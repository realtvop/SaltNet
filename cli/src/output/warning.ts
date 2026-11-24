/**
 * What a command may flag in a result that is otherwise fine (design 4.3). The codes are constants
 * agents can match on; `schema` lists them with these descriptions.
 */
export const WARNING_CODES = {
    STALE_METADATA: "曲库或收藏品已过期又没能刷新（刷新失败或用了 --offline），用的是缓存",
    STALE_SCORES: "成绩已经很久没更新（超过 scores.staleDays 天）",
    NO_SCORES: "这个用户还没同步过成绩",
    PARTIAL_SCORES: "只拿到了水鱼公开的 B50，其他谱面没有成绩",
    NO_PLAY_COUNTS: "没有可用的正数游玩次数，PC50 只能按 rating 排序",
    TRUNCATED: "sql 的结果被截断了",
    UPLOAD_FAILED: "同步成功了，但上传到水鱼或落雪失败",
    GAME_ACCOUNT_CHANGED: "二维码属于另一个舞萌账号，同步后用户的游戏 ID 已改为该账号",
    SOME_FAILED: "sync --all 里有用户失败",
    LXNS_EXPIRING: "落雪授权快过期了",
    PUBLIC_B50_ONLY: "只更新了水鱼公开的 B50，详细成绩保留原样",
    PARTIAL_BACKUP: "游戏格式的备份里没有角色数据，只有成绩和已有的收藏品",
    NO_IMAGE: "选中的模式里没有谱面，没有画图片",
} as const;

export type WarningCode = keyof typeof WARNING_CODES;

/** Something to be aware of in a result that is otherwise fine. */
export interface Warning {
    readonly code: WarningCode;
    readonly message: string;
    /** A command that would remove the cause. */
    readonly fix?: string;
}
