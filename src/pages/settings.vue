<template>
    <div class="settings">
        <mdui-card variant="filled" class="settings-item">
            <h2>数据</h2>
            <br />
            <div class="btns-container">
                <mdui-button variant="tonal" @click="userData.import">导入</mdui-button>
                <mdui-button variant="tonal" @click="userData.export">导出</mdui-button>
                <mdui-button variant="tonal" @click="clearAllScoreHistory">
                    清除成绩历史
                </mdui-button>
            </div>
        </mdui-card>
        <mdui-card variant="filled" class="settings-item">
            <h2>缓存</h2>
            <br />
            <div class="btns-container">
                <mdui-button variant="tonal" @click="deleteCache('Covers')">
                    清除缓存图片
                </mdui-button>
            </div>
        </mdui-card>
        <mdui-card variant="filled" class="settings-item">
            <h2>显示</h2>
            <br />
            <div class="setting-row">
                <span class="setting-label">Rating 阶段默认筛选</span>
                <mdui-select
                    :value="shared.appSettings.defaultChartRatingDisplayMode"
                    style="width: 8em; --mdui-comp-select-menu-container-shape: 8px"
                    @change="handleDefaultRatingModeChange"
                >
                    <mdui-menu-item value="简洁">简洁</mdui-menu-item>
                    <mdui-menu-item value="吃分">吃分</mdui-menu-item>
                    <mdui-menu-item value="完整">全部</mdui-menu-item>
                </mdui-select>
            </div>
            <div class="setting-row">
                <span class="setting-label">在 B50 卡片显示 DX 分数</span>
                <mdui-switch
                    :checked="shared.appSettings.showDxScoreInB50"
                    @change="handleShowDxScoreInB50Change"
                />
            </div>
            <div class="setting-row">
                <span class="setting-label">谱面页面翻转难度、版本及万花筒门</span>
                <mdui-switch
                    :checked="shared.appSettings.reverseSongsDifficultyAndVersionTabs"
                    @change="handleReverseSongsDifficultyAndVersionTabsChange"
                />
            </div>
            <div class="setting-row">
                <span class="setting-label">谱面卡片右上角默认显示</span>
                <mdui-select
                    :value="shared.appSettings.songsCardTopRightDisplay"
                    style="width: 8em; --mdui-comp-select-menu-container-shape: 8px"
                    @change="handleSongsCardTopRightDisplayChange"
                >
                    <mdui-menu-item value="排序">排序</mdui-menu-item>
                    <mdui-menu-item value="无">无</mdui-menu-item>
                    <mdui-menu-item value="游玩次数">游玩次数</mdui-menu-item>
                </mdui-select>
            </div>
        </mdui-card>
    </div>
</template>

<script setup lang="ts">
    import { useShared, type SongsCardTopRightDisplay } from "@/components/app/shared";
    import { snackbar, confirm } from "mdui";
    import { markDialogClosed, markDialogOpen } from "@/components/app/router";
    import {
        clearScoreHistory,
        createUserDataBackup,
        decodeUserDataBackup,
        flushScoreHistoryQueue,
        hasPendingScoreHistoryWrites,
        replaceImportedUserData,
    } from "@/components/data/user/scoreHistory";
    import { cancelPendingUserUpdates, hasPendingUserUpdates } from "@/components/data/user/update";

    const shared = useShared();
    type RatingDisplayMode = "简洁" | "吃分" | "完整";

    const userData = {
        import: () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json,application/json";
            input.onchange = async (e: Event) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    const decoded = decodeUserDataBackup(JSON.parse(text));
                    if (hasPendingUserUpdates() || hasPendingScoreHistoryWrites()) {
                        throw new Error("仍有用户更新或成绩历史等待保存，请稍后重试");
                    }
                    const confirmed = await confirm({
                        headline: "替换全部用户数据与成绩历史？",
                        description: "导入会覆盖当前全部用户及曲目成绩历史，建议先导出当前数据。",
                        confirmText: "导入",
                        cancelText: "取消",
                        closeOnEsc: true,
                        closeOnOverlayClick: true,
                        onOpen: markDialogOpen,
                        onClose: markDialogClosed,
                    })
                        .then(() => true)
                        .catch(() => false);
                    if (!confirmed) return;

                    cancelPendingUserUpdates();
                    await replaceImportedUserData(decoded.users, decoded.events);
                    shared.users = decoded.users;
                    snackbar({
                        message: "用户数据与成绩历史导入成功",
                        autoCloseDelay: 1000,
                    });
                } catch (err) {
                    snackbar({
                        message:
                            err instanceof Error
                                ? `导入失败：${err.message}`
                                : "导入失败，文件格式错误或数据损坏",
                        autoCloseDelay: 3000,
                    });
                }
            };
            input.click();
        },
        export: async () => {
            snackbar({
                message: "正在导出",
                autoCloseDelay: 500,
            });
            if (shared.users) {
                try {
                    if (hasPendingUserUpdates()) {
                        snackbar({ message: "用户数据仍在更新，请稍后导出", autoCloseDelay: 2000 });
                        return;
                    }
                    if (!(await flushScoreHistoryQueue())) {
                        snackbar({
                            message: "成绩历史仍有未保存内容，导出已取消",
                            autoCloseDelay: 3000,
                        });
                        return;
                    }
                    const data = await createUserDataBackup(shared.users);
                    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "SaltNet_用户数据.json";
                    a.click();
                    URL.revokeObjectURL(url);

                    snackbar({
                        message: "已导出",
                        autoCloseDelay: 500,
                    });
                } catch (error) {
                    snackbar({
                        message:
                            error instanceof Error
                                ? `导出失败：${error.message}`
                                : "用户数据导出失败",
                        autoCloseDelay: 3000,
                    });
                }
            } else {
                snackbar({
                    message: "没有数据可导出",
                    autoCloseDelay: 500,
                });
            }
        },
    };

    function clearAllScoreHistory() {
        void confirm({
            headline: "清除全部曲目成绩历史？",
            description: "当前成绩不会受影响，历史删除后无法恢复。",
            confirmText: "清除",
            cancelText: "取消",
            closeOnEsc: true,
            closeOnOverlayClick: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
            onConfirm: async () => {
                if (hasPendingScoreHistoryWrites() || hasPendingUserUpdates()) {
                    snackbar({ message: "仍有成绩正在更新，请稍后重试", autoCloseDelay: 2000 });
                    return;
                }
                try {
                    await clearScoreHistory();
                    snackbar({ message: "已清除全部曲目成绩历史", autoCloseDelay: 1000 });
                } catch (error) {
                    console.error("Failed to clear score history:", error);
                    snackbar({ message: "成绩历史清除失败", autoCloseDelay: 3000 });
                }
            },
        }).catch(() => undefined);
    }

    const displayName = {
        Covers: "图片资源",
    };
    function deleteCache(key: keyof typeof displayName) {
        void confirm({
            headline: `清除缓存的${displayName[key]}？`,
            description: "数据删除后将无法恢复",
            closeOnEsc: true,
            closeOnOverlayClick: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
            onConfirm: () =>
                caches
                    .delete(`SaltNetv0-${key}`)
                    .then(() => {
                        snackbar({
                            message: `已清除缓存的${displayName[key]}`,
                            autoCloseDelay: 500,
                        });
                    })
                    .catch(() => {
                        snackbar({
                            message: `清除缓存的${displayName[key]}失败`,
                            autoCloseDelay: 500,
                        });
                    }),
        }).catch(() => undefined);
    }

    function handleDefaultRatingModeChange(event: Event) {
        const target = event.target as HTMLSelectElement;
        const value = target.value as RatingDisplayMode;
        if (!value) return;
        shared.appSettings.defaultChartRatingDisplayMode = value;
    }

    function handleShowDxScoreInB50Change(event: Event) {
        const target = event.target as HTMLInputElement;
        shared.appSettings.showDxScoreInB50 = target.checked;
    }

    function handleReverseSongsDifficultyAndVersionTabsChange(event: Event) {
        const target = event.target as HTMLInputElement;
        shared.appSettings.reverseSongsDifficultyAndVersionTabs = target.checked;
    }

    function handleSongsCardTopRightDisplayChange(event: Event) {
        const target = event.target as HTMLSelectElement;
        const value = target.value as SongsCardTopRightDisplay;
        if (!value) return;
        shared.appSettings.songsCardTopRightDisplay = value;
    }
</script>

<style scoped>
    .settings {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 24px;
    }

    .settings-item {
        width: 1000px;
        max-width: 90%;
        padding: 15px 20px;
    }
    h2 {
        margin: 0;
    }
    .btns-container {
        display: flex;
        flex-direction: row-reverse;
        gap: 20px;
    }
    .setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 10px 0;
    }
    .setting-label {
        color: rgb(var(--mdui-color-on-surface));
    }
</style>
