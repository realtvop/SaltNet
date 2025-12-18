import { db, schema } from "../../db";
import { eq, and } from "drizzle-orm";
import { verifyUserAuth } from "../../services/auth";

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
    id: number;
    level: string;
    internalLevel: number;
}

/**
 * GET /records - 获取当前用户的所有成绩
 */
export async function getRecords({
    headers,
    set,
}: {
    headers: ElysiaHeaders;
    set: ElysiaSet;
}) {
    const authResult = await verifyUserAuth(headers["authorization"]);
    if (!authResult) {
        set.status = 401;
        return { error: "Not authenticated or invalid token" };
    }

    // Query user scores with chart and music information
    const scores = await db.query.maimaidxScores.findMany({
        where: eq(schema.maimaidxScores.user, authResult.user.id),
        with: {
            chart: {
                with: {
                    music: true,
                },
            },
        },
    });

    // Transform to response format
    const result: ScoreResponse[] = scores.map((score) => ({
        id: score.id,
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
    }));

    return result;
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

            if (existingScore) {
                // Update existing score
                await db
                    .update(schema.maimaidxScores)
                    .set({
                        achievements: score.achievements.toFixed(4),
                        deluxeScore: score.dxScore,
                        comboStat: score.comboStat as "" | "fc" | "fcp" | "ap" | "app",
                        syncStat: score.syncStat as "" | "sync" | "fs" | "fsp" | "fsdx" | "fsdxp",
                        playCount: score.playCount ?? null,
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
                    syncStat: score.syncStat as "" | "sync" | "fs" | "fsp" | "fsdx" | "fsdxp",
                    playCount: score.playCount ?? null,
                });
            }

            results.success++;
        } catch (error) {
            results.failed++;
            results.errors.push(
                `Error processing ${score.title}: ${error instanceof Error ? error.message : "Unknown error"}`
            );
        }
    }

    return {
        message: `Processed ${body.length} scores`,
        success: results.success,
        failed: results.failed,
        errors: results.errors.length > 0 ? results.errors : undefined,
    };
}
