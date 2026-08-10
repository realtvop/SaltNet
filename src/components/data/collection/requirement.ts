import type { Collection, CollectionRequired } from "./type";

export type RequirementPresentationKind =
    | "score"
    | "play"
    | "credit"
    | "play-count"
    | "multiplayer"
    | "miss"
    | "loadout"
    | "settings"
    | "special";

export type RequirementProgressMode = "score" | "play" | null;

export interface RequirementPresentation {
    kind: RequirementPresentationKind;
    icon: string;
    label: string;
    title: string;
    progressMode: RequirementProgressMode;
    manualReason?: string;
}

const creditPattern = /(クレジット|クレ(?:内|で|中)|同じクレ|同一クレ|一轮|一輪|同一局|同一局内)/i;
const playCountPattern = /(?:\d+|[一二三四五六七八九十百]+)\s*回(?:以上)?(?:の)?プレイ/i;
const multiplayerPattern =
    /((?:\d+|[一二三四五六七八九十]+)\s*人(?:以上|で|と)|複数人|多人|マッチング|協力プレイ|协力游玩)/i;
const missPattern = /(MISS|ミス|失误)/i;
const loadoutPattern = /(アイコン|つあーメンバー|ツアーメンバー|パートナー).*(セット|設定)/i;
const settingsPattern =
    /(SPEED|ミラー|MIRROR|トラックスキップ|TRACK\s*SKIP|上下|左右|反転|速度|镜像|設定|设置)/i;
const playPattern = /(プレイ|遊玩|游玩)/i;

export function hasScoreTarget(requirement: CollectionRequired): boolean {
    return Boolean(requirement.rate || requirement.fc || requirement.fs);
}

export function getRequirementPresentation(
    collection: Collection,
    requirement: CollectionRequired
): RequirementPresentation {
    const description = collection.description ?? "";
    const hasMultiplayerCondition = multiplayerPattern.test(description);
    const hasMissCondition = missPattern.test(description);

    if (creditPattern.test(description)) {
        return {
            kind: "credit",
            icon: "confirmation_number",
            label: "单局连续游玩",
            title: "需在同一轮游戏中完成",
            progressMode: null,
            manualReason: "最佳成绩不会记录多首或多次游玩是否在同一轮游戏中完成。",
        };
    }
    if (playCountPattern.test(description)) {
        return {
            kind: "play-count",
            icon: "repeat",
            label: "游玩次数条件",
            title: "需完成指定次数的游玩",
            progressMode: null,
            manualReason: "最佳成绩只保留最高记录，不能证明累计游玩次数。",
        };
    }
    if (hasMultiplayerCondition && hasMissCondition) {
        return {
            kind: "special",
            icon: "group_off",
            label: "复合特殊条件",
            title: "需同时满足多人游玩与 MISS 条件",
            progressMode: null,
            manualReason: "最佳成绩不会保留当局人数和 MISS 数量。",
        };
    }
    if (hasMultiplayerCondition) {
        return {
            kind: "multiplayer",
            icon: "groups",
            label: "多人游玩条件",
            title: "需以指定多人方式完成",
            progressMode: null,
            manualReason: "最佳成绩不会记录当局人数或匹配方式。",
        };
    }
    if (hasMissCondition) {
        return {
            kind: "miss",
            icon: "heart_broken",
            label: "特殊结果条件",
            title: "需满足指定 MISS 等特殊结果",
            progressMode: null,
            manualReason: "最佳成绩不会保留满足该条件时的 MISS 数量。",
        };
    }
    if (loadoutPattern.test(description)) {
        return {
            kind: "loadout",
            icon: "person_check",
            label: "装扮或成员设置",
            title: "需先设置指定头像、搭档或旅行伙伴",
            progressMode: null,
            manualReason: "最佳成绩不会记录游玩时使用的头像、搭档或旅行伙伴。",
        };
    }
    if (settingsPattern.test(description)) {
        return {
            kind: "settings",
            icon: "tune",
            label: "指定玩法设置",
            title: "需使用指定设置或操作方式完成",
            progressMode: null,
            manualReason: "最佳成绩不会记录当局使用的速度、镜像或其他玩法设置。",
        };
    }
    if (hasScoreTarget(requirement)) {
        return {
            kind: "score",
            icon: "military_tech",
            label: "成绩条件",
            title: "在指定谱面达到目标成绩",
            progressMode: "score",
        };
    }
    if (requirement.songs?.length && playPattern.test(description)) {
        return {
            kind: "play",
            icon: "play_circle",
            label: "指定曲游玩",
            title: "游玩指定曲目",
            progressMode: "play",
        };
    }

    return {
        kind: "special",
        icon: "extension",
        label: "特殊获取条件",
        title: "需在游戏内满足完整条件",
        progressMode: null,
        manualReason: "LXNS 未提供足以通过当前最佳成绩验证完成状态的结构化信息。",
    };
}
