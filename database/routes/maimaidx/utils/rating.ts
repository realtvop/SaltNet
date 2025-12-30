import { desc, eq } from "drizzle-orm";
import { db, schema } from "../../../db";

type RankType =
    | "d"
    | "c"
    | "b"
    | "bb"
    | "bbb"
    | "a"
    | "aa"
    | "aaa"
    | "s"
    | "sp"
    | "ss"
    | "ssp"
    | "sss"
    | "sssp";

type ScoreCoefficientEntry = [number, number, RankType];

const SCORE_COEFFICIENT_TABLE: readonly ScoreCoefficientEntry[] = [
    [0, 0, "d"],
    [10, 1.6, "d"],
    [20, 3.2, "d"],
    [30, 4.8, "d"],
    [40, 6.4, "d"],
    [50, 8.0, "c"],
    [60, 9.6, "b"],
    [70, 11.2, "bb"],
    [75, 12.0, "bbb"],
    [79.9999, 12.8, "bbb"],
    [80, 13.6, "a"],
    [90, 15.2, "aa"],
    [94, 16.8, "aaa"],
    [96.9999, 17.6, "aaa"],
    [97, 20.0, "s"],
    [98, 20.3, "sp"],
    [98.9999, 20.6, "sp"],
    [99, 20.8, "ss"],
    [99.5, 21.1, "ssp"],
    [99.9999, 21.4, "ssp"],
    [100, 21.6, "sss"],
    [100.4999, 21.6, "sss"], // wtf   * 水鱼大神啊你好像写错了
    [100.5, 22.4, "sssp"],
] as const;

export function calculateRating(achievements: number, ds: number): number {
    let coefficient = 0;
    for (let i = 0; i < SCORE_COEFFICIENT_TABLE.length; i++) {
        if (
            i === SCORE_COEFFICIENT_TABLE.length - 1 ||
            achievements < SCORE_COEFFICIENT_TABLE[i + 1]![0]
        ) {
            coefficient = SCORE_COEFFICIENT_TABLE[i]![1];
            break;
        }
    }
    return Math.floor((coefficient * ds * Math.min(100.5, achievements)) / 100);
}

export async function calculateUserB50Rating(
    userId: number,
    region: "jp" | "ex" | "cn"
): Promise<number | null> {
    const latestVersion = await db.query.maimaidxVersions.findFirst({
        where: eq(schema.maimaidxVersions.region, region),
        orderBy: [desc(schema.maimaidxVersions.releaseDate)],
    });

    if (!latestVersion) {
        return null;
    }

    const scores = await db.query.maimaidxScores.findMany({
        where: eq(schema.maimaidxScores.user, userId),
        with: {
            chart: true,
        },
    });

    const pastScores: number[] = [];
    const newScores: number[] = [];

    for (const score of scores) {
        if (score.chart.versions.includes(latestVersion.id)) {
            newScores.push(score.rating);
        } else {
            pastScores.push(score.rating);
        }
    }

    pastScores.sort((a, b) => b - a);
    newScores.sort((a, b) => b - a);

    const totalRating =
        pastScores.slice(0, 35).reduce((sum, r) => sum + r, 0) +
        newScores.slice(0, 15).reduce((sum, r) => sum + r, 0);

    return totalRating;
}

export async function updateUserB50Rating(
    userId: number,
    region: "jp" | "ex" | "cn"
): Promise<number | null> {
    const rating = await calculateUserB50Rating(userId, region);
    if (rating === null) {
        return null;
    }

    await db
        .update(schema.users)
        .set({ maimaidxRating: rating })
        .where(eq(schema.users.id, userId));

    return rating;
}
