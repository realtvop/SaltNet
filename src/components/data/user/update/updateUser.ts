import { getUserDisplayName, type User, convertDetailed } from "@/components/data/user/type";
import { snackbar, alert } from "mdui";
import { markDialogOpen, markDialogClosed } from "@/components/app/router.vue";
import { fetchLXNSScore } from "@/components/integrations/lxns/fetchScore";
import { toHalfWidth } from "@/utils";
import {
    getSaltNetB50,
    getSaltNetRecords,
    getSaltNetUser,
    getSaltNetB50ByUsername,
    getSaltNetRecordsByUsername,
    type SaltNetScoreResponse,
} from "@/components/data/user/database";
import type {
    DivingFishFullRecord,
    DivingFishB50,
} from "@/components/integrations/diving-fish/type";
import type { ComboStatus, SyncStatus } from "@/components/data/maiTypes";
import { getRankRateByAchievement } from "@/components/data/maiTypes";
// @ts-ignore
import UpdateUserWorker from "./updateUser.worker.ts?worker&inline";

const updateUserWorker = new UpdateUserWorker();
updateUserWorker.onmessage = (event: MessageEvent) => {
    const { type } = event.data;
    if (type === "snackbar") {
        const { message, errorMsg } = event.data.data;
        snackbar({
            message,
            placement: "bottom",
            autoCloseDelay: errorMsg ? 3000 : 1500,
            action: errorMsg ? "复制错误" : undefined,
            onActionClick: errorMsg ? () => navigator.clipboard.writeText(errorMsg) : undefined,
        });
    } else if (type.startsWith("updateUserResult::")) {
        const { result: data } = event.data;
        if (data) {
            const user = pendingUsers[type.slice(18)];

            user.data = { ...user.data, ...data };
            if (
                user.inGame.id &&
                typeof user.inGame.id === "number" &&
                user.inGame.id.toString().length === 8
            )
                user.inGame.name = data.name;
        }
    } else if (type === "alert") {
        alert({
            ...event.data.data,
            onOpen: dialog => {
                markDialogOpen(dialog);
                // 允许 description 换行显示
                (
                    (dialog.shadowRoot as unknown as HTMLElement).querySelector(
                        "div.panel.has-description > div > slot.description"
                    ) as HTMLElement
                ).style.whiteSpace = "pre-wrap";
            },
            onClose: markDialogClosed,
        });
    } else console.log(type, event.data);
};

const pendingUsers: { [key: string]: User } = {};

export function updateUserWithWorker(user: User, updateItem: boolean = false) {
    // 检查并生成 uid
    if (!user.uid) {
        user.uid = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    }

    // LXNS uses useShared which is not supported in workers, handle it on main thread
    if (user.lxns?.auth?.accessToken) {
        updateFromLXNS(user);
        return;
    }

    // SaltNet-only user: user has saltnetDB but no other data sources
    const hasOnlySaltNet =
        user.saltnetDB?.sessionToken &&
        !user.inGame?.id &&
        !user.divingFish?.name &&
        !user.lxns?.auth?.accessToken;

    if (hasOnlySaltNet) {
        downloadFromSaltNet(user);
        return;
    }

    // User with saltnetUsername: query by username
    if (
        user.saltnetUsername &&
        !user.inGame?.id &&
        !user.divingFish?.name &&
        !user.lxns?.auth?.accessToken
    ) {
        downloadFromSaltNetByUsername(user);
        return;
    }

    const plainUser: User = JSON.parse(JSON.stringify(user));

    pendingUsers[user.uid] = user;
    updateUserWorker.postMessage({ type: "updateUser", user: plainUser, updateItem });
}

async function updateFromLXNS(user: User) {
    snackbar({
        message: `正在从落雪获取用户信息：${getUserDisplayName(user)}`,
        placement: "bottom",
        autoCloseDelay: 1500,
    });
    try {
        const data = await fetchLXNSScore(user);
        if (data) {
            user.data = {
                ...user.data,
                rating: data.rating,
                name: toHalfWidth(data.name),
                b50: data.b50,
                detailed: data.scores,
                updateTime: data.updateTime,
            };
            snackbar({
                message: `从落雪获取用户信息成功：${getUserDisplayName(user)}`,
                placement: "bottom",
                autoCloseDelay: 1500,
            });
        } else {
            snackbar({
                message: `从落雪获取 ${getUserDisplayName(user)} 信息失败`,
                placement: "bottom",
                autoCloseDelay: 3000,
            });
        }
    } catch (e) {
        const errorMsg = e?.toString?.() || "Unknown error";
        snackbar({
            message: `从落雪获取 ${getUserDisplayName(user)} 信息失败：${errorMsg}`,
            placement: "bottom",
            autoCloseDelay: 3000,
            action: "复制错误",
            onActionClick: () => navigator.clipboard.writeText(errorMsg),
        });
    }
}

/**
 * Convert SaltNet difficulty string to level_index
 */
function difficultyToLevelIndex(difficulty: string): number {
    const difficulties: Record<string, number> = {
        basic: 0,
        advanced: 1,
        expert: 2,
        master: 3,
        remaster: 4,
    };
    return difficulties[difficulty.toLowerCase()] ?? 3;
}

/**
 * Convert SaltNet score to DivingFishFullRecord format
 */
function saltNetToDivingFish(record: SaltNetScoreResponse): DivingFishFullRecord {
    // For song_id: when type is dx, add 10000 to the base id
    const song_id = record.id + (record.type === "dx" ? 10000 : 0);
    const level_index = difficultyToLevelIndex(record.difficulty);

    return {
        song_id,
        level_index,
        level: record.level,
        level_label: record.difficulty,
        type: record.type === "dx" ? "DX" : "SD",
        dxScore: record.dxScore,
        ds: record.internalLevel,
        fc: (record.comboStat || "") as ComboStatus,
        fs: (record.syncStat || "") as SyncStatus,
        achievements: record.achievements,
        ra: record.rating,
        rate: getRankRateByAchievement(record.achievements),
        title: record.title,
        play_count: record.playCount ?? undefined,
    };
}

/**
 * Download scores from SaltNet database
 */
async function downloadFromSaltNet(user: User) {
    if (!user.saltnetDB?.sessionToken) {
        snackbar({
            message: "请先登录 SaltNet 账户",
            placement: "bottom",
            autoCloseDelay: 3000,
        });
        return;
    }

    snackbar({
        message: `正在从 SaltNet 获取用户信息：${getUserDisplayName(user)}`,
        placement: "bottom",
        autoCloseDelay: 1500,
    });

    try {
        // Fetch B50, all records, and user info in parallel
        const [b50Data, allRecords, userInfo] = await Promise.all([
            getSaltNetB50(user.saltnetDB.sessionToken),
            getSaltNetRecords(user.saltnetDB.sessionToken),
            getSaltNetUser(user.saltnetDB.sessionToken),
        ]);

        // Update shared.saltNetAccount with fresh user info (including region)
        if (userInfo) {
            const shared = useShared();
            if (shared.saltNetAccount) {
                shared.saltNetAccount.email = userInfo.email;
                shared.saltNetAccount.maimaidxRegion = userInfo.maimaidxRegion;
            }
        }

        if (!b50Data || !allRecords) {
            snackbar({
                message: `从 SaltNet 获取 ${getUserDisplayName(user)} 信息失败`,
                placement: "bottom",
                autoCloseDelay: 3000,
            });
            return;
        }

        // Convert all records to DivingFish format
        const dfRecords = allRecords.map(saltNetToDivingFish);

        // Convert B50 to DivingFish format
        const b50: DivingFishB50 = {
            sd: b50Data.past.map(saltNetToDivingFish),
            dx: b50Data.new.map(saltNetToDivingFish),
        };

        // Calculate total rating from B50
        const totalRating =
            b50.sd.reduce((sum, r) => sum + r.ra, 0) + b50.dx.reduce((sum, r) => sum + r.ra, 0);

        // Update user data
        user.data = {
            ...user.data,
            rating: totalRating,
            name: user.saltnetDB.username,
            b50,
            detailed: convertDetailed(dfRecords),
            updateTime: Date.now(),
        };

        snackbar({
            message: `从 SaltNet 获取用户信息成功：${getUserDisplayName(user)}`,
            placement: "bottom",
            autoCloseDelay: 1500,
        });
    } catch (e) {
        const errorMsg = e?.toString?.() || "Unknown error";
        snackbar({
            message: `从 SaltNet 获取 ${getUserDisplayName(user)} 信息失败：${errorMsg}`,
            placement: "bottom",
            autoCloseDelay: 3000,
            action: "复制错误",
            onActionClick: () => navigator.clipboard.writeText(errorMsg),
        });
    }
}

/**
 * Download scores from SaltNet database by username
 * Uses first user's sessionToken if available for full records,
 * otherwise falls back to public B50 API
 */
async function downloadFromSaltNetByUsername(user: User) {
    if (!user.saltnetUsername) {
        snackbar({
            message: "请设置 SaltNet 用户名",
            placement: "bottom",
            autoCloseDelay: 3000,
        });
        return;
    }

    const username = user.saltnetUsername;

    snackbar({
        message: `正在从 SaltNet 获取用户信息：${getUserDisplayName(user)}`,
        placement: "bottom",
        autoCloseDelay: 1500,
    });

    try {
        const shared = useShared();
        const sessionToken = shared.saltNetAccount?.sessionToken;

        let b50Data;
        let allRecords = null;

        if (sessionToken) {
            // Use first user's session token to get full records
            [b50Data, allRecords] = await Promise.all([
                getSaltNetB50ByUsername(username),
                getSaltNetRecordsByUsername(sessionToken, username),
            ]);
        } else {
            // Fallback to public B50 API only
            b50Data = await getSaltNetB50ByUsername(username);
        }

        if (!b50Data) {
            snackbar({
                message: `从 SaltNet 获取 ${getUserDisplayName(user)} 信息失败，用户可能不存在`,
                placement: "bottom",
                autoCloseDelay: 3000,
            });
            return;
        }

        // Convert B50 to DivingFish format
        const b50: DivingFishB50 = {
            sd: b50Data.past.map(saltNetToDivingFish),
            dx: b50Data.new.map(saltNetToDivingFish),
        };

        // Calculate total rating from B50
        const totalRating =
            b50.sd.reduce((sum, r) => sum + r.ra, 0) + b50.dx.reduce((sum, r) => sum + r.ra, 0);

        // Update user data
        user.data = {
            ...user.data,
            rating: totalRating,
            name: username,
            b50,
            // Only set detailed if we got full records
            ...(allRecords && { detailed: convertDetailed(allRecords.map(saltNetToDivingFish)) }),
            updateTime: Date.now(),
        };

        snackbar({
            message: `从 SaltNet 获取用户信息成功：${getUserDisplayName(user)}`,
            placement: "bottom",
            autoCloseDelay: 1500,
        });
    } catch (e) {
        const errorMsg = e?.toString?.() || "Unknown error";
        snackbar({
            message: `从 SaltNet 获取 ${getUserDisplayName(user)} 信息失败：${errorMsg}`,
            placement: "bottom",
            autoCloseDelay: 3000,
            action: "复制错误",
            onActionClick: () => navigator.clipboard.writeText(errorMsg),
        });
    }
}

export function checkLoginWithWorker(user: User) {
    const plainUser: User = JSON.parse(JSON.stringify(user));

    updateUserWorker.postMessage({ type: "checkLogin", user: plainUser, updateItem: false });
}

export function previewRivalsWithWorker(user: User) {
    const plainUser: User = JSON.parse(JSON.stringify(user));

    updateUserWorker.postMessage({ type: "previewRivals", user: plainUser });
}

export function clearIllegalTicketsWithWorker(user: User) {
    const plainUser: User = JSON.parse(JSON.stringify(user));

    updateUserWorker.postMessage({ type: "clearIllegalTickets", user: plainUser });
}
export function previewStockedTicketsWithWorker(user: User) {
    const plainUser: User = JSON.parse(JSON.stringify(user));

    updateUserWorker.postMessage({ type: "previewStockedTickets", user: plainUser });
}

// Import for SaltNet upload
import { uploadToSaltNet, type SaltNetUploadScore } from "@/components/data/user/database/api";
import { useShared } from "@/components/app/shared";

/**
 * Convert level_index to difficulty string for SaltNet API
 */
function levelIndexToDifficulty(levelIndex: number): string {
    const difficulties = ["basic", "advanced", "expert", "master", "remaster"];
    return difficulties[levelIndex] || "master";
}

/**
 * Convert DivingFish type to SaltNet API type
 */
function convertChartType(type: "DX" | "SD"): "std" | "dx" {
    return type === "DX" ? "dx" : "std";
}

/**
 * Upload user scores to SaltNet database
 * Converts existing detailed data to SaltNet format and uploads
 */
export async function uploadScoresToSaltNet(user: User) {
    const shared = useShared();

    if (!shared.saltNetAccount?.sessionToken) {
        snackbar({
            message: "请先登录 SaltNet 账户",
            placement: "bottom",
            autoCloseDelay: 3000,
        });
        return;
    }

    if (!user.data.detailed) {
        snackbar({
            message: "没有可上传的成绩数据，请先更新用户",
            placement: "bottom",
            autoCloseDelay: 3000,
        });
        return;
    }

    snackbar({
        message: `正在上传 ${getUserDisplayName(user)} 的成绩到 SaltNet...`,
        placement: "bottom",
        autoCloseDelay: 1500,
    });

    // Convert detailed data (Record<string, DivingFishFullRecord>) to SaltNetUploadScore[]
    const scores: SaltNetUploadScore[] = Object.values(user.data.detailed).map(record => ({
        title: record.title,
        type: convertChartType(record.type),
        difficulty: levelIndexToDifficulty(record.level_index),
        achievements: record.achievements,
        dxScore: record.dxScore,
        comboStat: record.fc || "",
        syncStat: record.fs || "",
        playCount: record.play_count ?? null,
    }));

    try {
        const result = await uploadToSaltNet(shared.saltNetAccount.sessionToken, scores);

        if (result) {
            snackbar({
                message: `上传完成：成功 ${result.success} 条，失败 ${result.failed} 条`,
                placement: "bottom",
                autoCloseDelay: 3000,
            });

            if (result.failed > 0 && result.errors) {
                console.warn("Upload errors:", result.errors);
            }
        }
    } catch (e) {
        const errorMsg = e?.toString?.() || "Unknown error";
        snackbar({
            message: `上传失败：${errorMsg}`,
            placement: "bottom",
            autoCloseDelay: 3000,
            action: "复制错误",
            onActionClick: () => navigator.clipboard.writeText(errorMsg),
        });
    }
}
