import type { User } from "@core/user/type";
import { normalizeRatingHistory } from "@core/user/ratingHistory";
import { int, list, nullable, object, str } from "../output/schema";
import { readUser } from "../users/repository";
import { userForCoreScores } from "../users/rows";
import { formatLocalTime } from "../util/time";
import { USER_OPTION } from "./describe";
import { defineCommand } from "./registry";
import { requireUserForScores, scoreMeta, useUserScores } from "./userScores";

interface RatingHistoryRow {
    readonly time: string;
    readonly rating: number;
    readonly change: number | null;
}

interface RatingResult {
    readonly rating: number | null;
    readonly history?: readonly RatingHistoryRow[];
}

const historySchema = object<RatingHistoryRow>(
    {
        time: str("这个 rating 的时间，用本机时区的偏移写"),
        rating: int("当时的 rating"),
        change: nullable(
            int("与上一条记录相比的变化量"),
            "与上一条记录相比的变化量；第一条是 null"
        ),
    },
    { description: "一条从旧到新排列的 rating 历史" }
);

function normalizedHistory(user: User, now: Date): RatingHistoryRow[] {
    const normalized = normalizeRatingHistory(user, () => now.getTime()).filter(entry =>
        Number.isSafeInteger(entry.rating)
    );
    return normalized.map((entry, index) => ({
        time: formatLocalTime(new Date(entry.time)),
        rating: entry.rating,
        change: index === 0 ? null : entry.rating - normalized[index - 1].rating,
    }));
}

export const rating = defineCommand(
    {
        name: "rating",
        summary: "查看当前 rating 和可选的 rating 历史",
        description:
            "读取 --user 指定用户（不写就是默认用户）的当前 rating；不是安全整数时返回 null。加 --history 后按从旧到新的顺序返回网页端 normalizeRatingHistory 规范化的历史，忽略不是安全整数的 rating，并按留下的上一条计算变化。命令不读取曲库，也不联网。",
        category: "scores",
        effect: "none",
        output: "object",
        options: {
            history: { kind: "boolean", description: "同时返回从旧到新的 rating 历史和变化量" },
            ...USER_OPTION,
        },
        examples: [
            { command: "rating", description: "当前 rating" },
            { command: "rating --history", description: "当前 rating 和历史" },
        ],
        errors: ["NOT_FOUND", "AMBIGUOUS_REF", "NO_USER", "DB_LOCKED"],
        dataSchema: object<RatingResult>(
            {
                rating: nullable(int("当前 rating"), "当前 rating；没有时是 null"),
                history: list(historySchema, "规范化后从旧到新的 rating 历史"),
            },
            {
                description: "用户的当前 rating；加 --history 后还有历史",
                optional: ["history"],
            }
        ),
    },
    (args, ctx) => {
        requireUserForScores(args, ctx);
        const userScores = useUserScores(args, ctx, []);
        const selectedUser = userScores.scores?.user;
        if (!selectedUser) throw new Error("rating requires a selected user");
        const rawUser = readUser(ctx.store(), selectedUser.uid);
        if (!rawUser) throw new Error(`selected user disappeared: ${selectedUser.uid}`);
        const user = userForCoreScores(rawUser);
        const rating = Number.isSafeInteger(user.data.rating) ? user.data.rating : null;
        return {
            data: {
                rating,
                ...(args.options.history ? { history: normalizedHistory(user, ctx.io.now()) } : {}),
            },
            meta: scoreMeta(userScores, {}),
            warnings: userScores.warnings,
        };
    }
);
