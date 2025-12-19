import { db, schema } from "../../db";
import { eq, and, desc } from "drizzle-orm";
import { verifyUserAuth } from "../../services/auth";
import { calculateRating, updateUserB50Rating } from "./utils/rating";

// Type definitions for Elysia context
type ElysiaSet = {
    status?: number;
    headers: Record<string, string>;
};
type ElysiaHeaders = Record<string, string | undefined>;

// Request body structure for uploading scores
interface UserScore {
    title: string;
    type: "std" | "dx" | "utage";
    difficulty: string;
    achievements: number;
    dxScore: number;
    comboStat: string;
    syncStat: string;
    playCount?: number | null;
}

// Response structure for fetching scores
interface ScoreResponse extends UserScore {
    id: number | null;
    level: string;
    internalLevel: number;
    rating: number;
}

/**
 * GET /records - 获取用户的所有成绩
 * 支持通过 query param `user` 指定查询的用户名
 * 需要任意有效的 sessionToken 或 PAT 认证
 */
export async function getRecords({
    headers,
    set,
    query,
}: {
    headers: ElysiaHeaders;
    set: ElysiaSet;
    query: { user?: string };
}) {
    // 必须有任意有效的认证
    const authResult = await verifyUserAuth(headers["authorization"]);
    if (!authResult) {
        set.status = 401;
        return { error: "Not authenticated or invalid token" };
    }

    // 确定查询的目标用户
    let targetUser = {
        id: authResult.user.id,
        userName: authResult.user.userName,
        maimaidxRegion: authResult.user.maimaidxRegion,
        maimaidxRating: authResult.user.maimaidxRating,
    };

    if (query.user) {
        // 通过用户名查询指定用户
        const foundUser = await db.query.users.findFirst({
            where: eq(schema.users.userName, query.user),
        });
        if (!foundUser) {
            set.status = 404;
            return { error: "User not found" };
        }
        targetUser = {
            id: foundUser.id,
            userName: foundUser.userName,
            maimaidxRegion: foundUser.maimaidxRegion,
            maimaidxRating: foundUser.maimaidxRating,
        };
    }

    // Query user scores with chart and music information
    const scores = await db.query.maimaidxScores.findMany({
        where: eq(schema.maimaidxScores.user, targetUser.id),
        with: {
            chart: {
                with: {
                    music: true,
                },
            },
        },
    });

    // Transform to response format
    const result: ScoreResponse[] = scores.map(score => ({
        id: score.chart.music.id,
        title: score.chart.music.title,
        type: score.chart.type,
        difficulty: score.chart.difficulty,
        level: score.chart.level,
        internalLevel: parseFloat(score.chart.internalLevel),
        achievements: score.achievements ? parseFloat(score.achievements) : 0,
        dxScore: score.deluxeScore,
        comboStat: score.comboStat,
        syncStat: score.syncStat,
        playCount: score.playCount,
        rating: score.rating,
    }));

    return {
        userName: targetUser.userName,
        region: targetUser.maimaidxRegion ?? "ex",
        rating: targetUser.maimaidxRating ?? -1,
        records: result,
    };
}

/**
 * POST /records - 批量上传/更新成绩
 */
export async function uploadRecords({
    headers,
    set,
    body,
}: {
    headers: ElysiaHeaders;
    set: ElysiaSet;
    body: UserScore[];
}) {
    const authResult = await verifyUserAuth(headers["authorization"]);
    if (!authResult) {
        set.status = 401;
        return { error: "Not authenticated or invalid token" };
    }

    const userId = authResult.user.id;
    const results: { success: number; failed: number; errors: string[] } = {
        success: 0,
        failed: 0,
        errors: [],
    };

    for (const score of body) {
        try {
            // Find the chart by title, type, and difficulty
            const chart = await db.query.maimaidxCharts.findFirst({
                where: and(
                    eq(schema.maimaidxCharts.music, score.title),
                    eq(schema.maimaidxCharts.type, score.type),
                    eq(
                        schema.maimaidxCharts.difficulty,
                        score.difficulty as
                        | "basic"
                        | "advanced"
                        | "expert"
                        | "master"
                        | "remaster"
                        | "utage"
                    )
                ),
            });

            if (!chart) {
                results.failed++;
                results.errors.push(
                    `Chart not found: ${score.title} [${score.type}] ${score.difficulty}`
                );
                continue;
            }

            // Check if score already exists for this user and chart
            const existingScore = await db.query.maimaidxScores.findFirst({
                where: and(
                    eq(schema.maimaidxScores.user, userId),
                    eq(schema.maimaidxScores.chart, chart.idx)
                ),
            });

            // Calculate rating from achievements and internal level
            const rating = Math.floor(
                calculateRating(score.achievements, parseFloat(chart.internalLevel))
            );

            if (existingScore) {
                // Update existing score
                await db
                    .update(schema.maimaidxScores)
                    .set({
                        achievements: score.achievements.toFixed(4),
                        deluxeScore: score.dxScore,
                        comboStat: score.comboStat as "" | "fc" | "fcp" | "ap" | "app",
                        syncStat: score.syncStat as "" | "sync" | "fs" | "fsp" | "fsd" | "fsdp",
                        playCount: score.playCount ?? null,
                        rating,
                    })
                    .where(eq(schema.maimaidxScores.id, existingScore.id));
            } else {
                // Insert new score
                await db.insert(schema.maimaidxScores).values({
                    user: userId,
                    chart: chart.idx,
                    achievements: score.achievements.toFixed(4),
                    deluxeScore: score.dxScore,
                    comboStat: score.comboStat as "" | "fc" | "fcp" | "ap" | "app",
                    syncStat: score.syncStat as "" | "sync" | "fs" | "fsp" | "fsd" | "fsdp",
                    playCount: score.playCount ?? null,
                    rating,
                });
            }

            results.success++;
        } catch (error) {
            results.failed++;
            results.errors.push(
                `Error processing ${score.title}: ${error instanceof Error ? error.message : "Unknown error"}`
            );
            console.log(error, score);
        }
    }

    // 计算并更新用户的总 rating（基于 B50）
    try {
        const userRegion = authResult.user.maimaidxRegion ?? "ex";
        await updateUserB50Rating(userId, userRegion);
    } catch {
        // 如果计算总 rating 失败，不影响成绩上传结果
    }

    return {
        message: `Processed ${body.length} scores`,
        success: results.success,
        failed: results.failed,
        errors: results.errors.length > 0 ? results.errors : undefined,
    };
}

/**
 * B50 Response structure
 */
interface B50Response {
    userName: string;
    region: "jp" | "ex" | "cn";
    rating: number;
    past: ScoreResponse[];
    new: ScoreResponse[];
}

/**
 * GET /records/b50 - 获取用户的 B50 数据
 * B50 = 35首旧版本最佳成绩 + 15首当前版本最佳成绩
 * 支持通过 query param `user` 指定查询的用户名，使用该方法无需鉴权
 * 不指定 user 时需要认证，查询自己的 B50
 */
export async function getB50({
    headers,
    set,
    query,
}: {
    headers: ElysiaHeaders;
    set: ElysiaSet;
    query: { user?: string };
}): Promise<B50Response | { error: string }> {
    let targetUser: {
        id: number;
        userName: string;
        maimaidxRegion: "jp" | "ex" | "cn" | null;
        maimaidxRating: number | null;
    };

    if (query.user) {
        // 通过用户名查询指定用户的 B50，无需鉴权
        const foundUser = await db.query.users.findFirst({
            where: eq(schema.users.userName, query.user),
        });
        if (!foundUser) {
            set.status = 404;
            return { error: "User not found" };
        }
        targetUser = {
            id: foundUser.id,
            userName: foundUser.userName,
            maimaidxRegion: foundUser.maimaidxRegion,
            maimaidxRating: foundUser.maimaidxRating,
        };
    } else {
        // 不指定 user 时，需要认证查询自己的 B50
        const authResult = await verifyUserAuth(headers["authorization"]);
        if (!authResult) {
            set.status = 401;
            return { error: "Not authenticated or invalid token" };
        }
        targetUser = {
            id: authResult.user.id,
            userName: authResult.user.userName,
            maimaidxRegion: authResult.user.maimaidxRegion,
            maimaidxRating: authResult.user.maimaidxRating,
        };
    }

    const userRegion = targetUser.maimaidxRegion ?? "ex";

    // Get the latest version for the user's region
    const latestVersion = await db.query.maimaidxVersions.findFirst({
        where: eq(schema.maimaidxVersions.region, userRegion),
        orderBy: [desc(schema.maimaidxVersions.releaseDate)],
    });

    if (!latestVersion) {
        set.status = 500;
        return { error: "No version data found for the region" };
    }

    const latestVersionId = latestVersion.id;

    // Query user scores with chart and music information
    const scores = await db.query.maimaidxScores.findMany({
        where: eq(schema.maimaidxScores.user, targetUser.id),
        with: {
            chart: {
                with: {
                    music: true,
                },
            },
        },
    });

    // Transform to response format and separate into past/new
    const pastScores: ScoreResponse[] = [];
    const newScores: ScoreResponse[] = [];

    for (const score of scores) {
        const scoreResponse: ScoreResponse = {
            id: score.chart.music.id,
            title: score.chart.music.title,
            type: score.chart.type,
            difficulty: score.chart.difficulty,
            level: score.chart.level,
            internalLevel: parseFloat(score.chart.internalLevel),
            achievements: score.achievements ? parseFloat(score.achievements) : 0,
            dxScore: score.deluxeScore,
            comboStat: score.comboStat,
            syncStat: score.syncStat,
            playCount: score.playCount,
            rating: score.rating,
        };

        if (score.chart.versions.includes(latestVersionId)) {
            newScores.push(scoreResponse);
        } else {
            pastScores.push(scoreResponse);
        }
    }

    // Sort by rating descending and take top 35 past + top 15 new
    pastScores.sort((a, b) => b.rating - a.rating);
    newScores.sort((a, b) => b.rating - a.rating);

    return {
        userName: targetUser.userName,
        region: targetUser.maimaidxRegion ?? "ex",
        rating: targetUser.maimaidxRating ?? -1,
        past: pastScores.slice(0, 35),
        new: newScores.slice(0, 15),
    };
}
