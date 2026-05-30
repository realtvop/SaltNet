import { desc, eq } from "drizzle-orm";
import { db, schema } from "../../../db";

export { calculateRating } from "./calculateRating";

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
        // 排除宴会场曲目
        if (score.chart.type === "utage" || score.chart.difficulty === "utage") {
            continue;
        }

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
