<script setup lang="ts">
    import { ref, toRaw } from "vue";
    import { useRouter } from "vue-router";
    import { markDialogOpen, markDialogClosed } from "@/components/app/router.vue";
    import RatingPlate from "@/components/data/user/RatingPlate.vue";
    import BindUserDialog from "@/components/data/user/BindUserDialog.vue";
    import { type User, getUserDisplayName } from "@/components/data/user/type";
    import {
        checkLogin,
        updateUser,
        previewRivals,
        clearIllegalTickets,
        previewStockedTickets,
    } from "@/components/data/user/update";
    import { alert, confirm, snackbar } from "mdui";
    import { useShared } from "@/components/app/shared";
    import type { UserInfo } from "@/components/data/inGame";
    import { exportUserBackup } from "@/components/data/user/exportBackup";

    const shared = useShared();

    const isDialogVisible = ref(false);
    const currentUserToEdit = ref<User | null>(null);
    const editingUserIndex = ref<number | null>(null);

    const router = useRouter();

    const openEditDialog = (user: User, index: number) => {
        currentUserToEdit.value = toRaw(user);
        editingUserIndex.value = index;
        isDialogVisible.value = true;
    };

    const openAddDialog = () => {
        currentUserToEdit.value = {
            remark: null,
            divingFish: { name: null, importToken: null },
            inGame: { name: null, id: null },
            settings: { manuallyUpdate: false },
            data: {
                updateTime: null,
                name: null,
                rating: null,
            },
        };
        editingUserIndex.value = null;
        isDialogVisible.value = true;
    };

    const openDeleteDialog = (index: number) => {
        confirm({
            headline: `删除绑定的用户：${getUserDisplayName(shared.users[index])}？`,
            description: "用户删除后无法恢复",
            confirmText: "删除",
            cancelText: "取消",
            closeOnEsc: true,
            closeOnOverlayClick: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
            onConfirm: () => {
                if (index !== null && index >= 0 && index < shared.users.length)
                    shared.users.splice(index, 1);
                return true;
            },
        });
    };

    const goToUserDetails = (index: number) => {
        // if (index == 0) return router.push("/b50");
        router.push(`/b50/${index}`);
    };
    const goToUserFittedDetails = (index: number) => {
        // if (index == 0) return router.push("/b50");
        router.push(`/b50/${index}?fit_diff=y`);
    };

    const goToUserSongs = (index: number) => {
        router.push(`/songs/${index}`);
    };

    function showUserInfo(user: User) {
        const info = user.data.info as UserInfo;

        alert({
            headline: `${getUserDisplayName(user)}`,
            description:
                (info
                    ? `头像 ID: ${info.iconId ?? "未知"}\n` +
                      `总觉醒数: ${info.totalAwake ?? "未知"}\n` +
                      `最后游戏程序版本: ${info.lastRomVersion ?? "未知"}\n` +
                      `最后数据版本: ${info.lastDataVersion ?? "未知"}\n` +
                      `Rating 显示设置: ${info.dispRate ?? "未知"}\n\n`
                    : "") +
                `最后更新: ${new Date(Number(user.data.updateTime)).toLocaleString() ?? "未知"}`,
            closeOnEsc: true,
            closeOnOverlayClick: true,
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
    }
    function clearIllegalTicketsPrompt(user: User) {
        confirm({
            headline: `清除 ${getUserDisplayName(user)} 的补偿倍券？`,
            description:
                "[请先点击获取登录二维码] 仅用于修复异常数据，将会上传一次游玩成绩，介意勿用",
            confirmText: "确认",
            cancelText: "取消",
            closeOnEsc: true,
            closeOnOverlayClick: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
            onConfirm: () => {
                clearIllegalTickets(user);
                return true;
            },
        });
    }

    interface UpdatedUserData {
        remark?: string | null;
        divingFish: { name: string | null; importToken: string | null };
        inGame: { name: string | null; id: number | null };
    }

    const handleUserSave = (updatedUserData: UpdatedUserData) => {
        if (editingUserIndex.value === null) {
            shared.users.push({
                remark: updatedUserData.remark,
                divingFish: {
                    name: updatedUserData.divingFish.name,
                    importToken: updatedUserData.divingFish.importToken,
                },
                inGame: { name: updatedUserData.inGame.name, id: updatedUserData.inGame.id },
                settings: { manuallyUpdate: false },
                data: {
                    updateTime: null,
                    name: null,
                    rating: null,
                },
            });
            currentUserToEdit.value = null;
            isDialogVisible.value = false;
            return;
        }

        const index = editingUserIndex.value;

        if (index >= 0 && index < shared.users.length) {
            const originalUser = shared.users[index];
            shared.users[index] = {
                ...originalUser,
                remark: updatedUserData.remark,
                divingFish: {
                    ...originalUser.divingFish,
                    name: updatedUserData.divingFish.name,
                    importToken: updatedUserData.divingFish.importToken,
                },
                inGame: {
                    ...originalUser.inGame,
                    id: updatedUserData.inGame.id,
                },
            };
        } else {
            console.warn("Invalid user index for update:", index);
        }

        currentUserToEdit.value = null;
        editingUserIndex.value = null;
        isDialogVisible.value = false;
    };

    const setAsDefault = (index: number) => {
        confirm({
            headline: `将 ${getUserDisplayName(shared.users[index])} 设为主用户？`,
            description: "您只应该将主用户设置为自己",
            confirmText: "确认",
            cancelText: "取消",
            closeOnEsc: true,
            closeOnOverlayClick: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
            onConfirm: () => {
                if (index > 0 && index < shared.users.length) {
                    const user = shared.users.splice(index, 1)[0];
                    shared.users.unshift(user);
                }
                return true;
            },
        });
    };

    function updateAll() {
        shared.users.forEach((user, index) => {
            if (!user.settings || !user.settings.manuallyUpdate) {
                updateUser(user, index === 0 ? true : false);
            }
        });
    }

    const toggleManualUpdate = (index: number) => {
        if (index >= 0 && index < shared.users.length) {
            const user = shared.users[index];
            // Ensure settings object exists
            if (!user.settings) {
                user.settings = { manuallyUpdate: false };
            }
            user.settings.manuallyUpdate = !user.settings.manuallyUpdate;
        }
    };

    async function exportUserBackupHandler(user: User) {
        let abortBackup = false;
        if (!user.inGame.id) return snackbar({ message: "你怎么进来的！", autoCloseDelay: 2000 });
        if (!user.data.updateTime)
            return confirm({
                headline: `用户 ${getUserDisplayName(user)} 尚未更新过数据，无法导出备份`,
                description: "是否现在更新？(更新后需手动重新导出备份)",
                confirmText: "更新",
                cancelText: "取消",
                closeOnEsc: true,
                closeOnOverlayClick: true,
                onOpen: markDialogOpen,
                onClose: markDialogClosed,
                onConfirm: () => {
                    updateUser(user, true);
                },
            });
        if (!user.data.characters || !user.data.characters.length) {
            await confirm({
                headline: `用户 ${getUserDisplayName(user)} 的数据${user.data.characters ? "可能" : ""}不完整`,
                description:
                    "直接导出会缺少收藏品数据，是否执行完整更新？(更新后需手动重新执行导出备份，也可只导出成绩数据)",
                confirmText: "更新",
                cancelText: "取消",
                closeOnEsc: true,
                closeOnOverlayClick: true,
                onOpen: markDialogOpen,
                onClose: markDialogClosed,
                onConfirm: () => {
                    updateUser(user, true);
                    abortBackup = true;
                },
            });
        }
        if (!abortBackup) exportUserBackup(user);
    }
</script>

<template>
    <div style="height: 10px"></div>
    <div class="user-cards-container">
        <mdui-card
            :variant="index ? 'elevated' : 'filled'"
            v-for="(user, index) in shared.users"
            :key="index"
            clickable
        >
            <div class="user-name" @click="goToUserDetails(index)">
                <div class="user-badges">
                    <h2 class="primary-name">
                        {{ getUserDisplayName(user, "未知") }}
                    </h2>
                    <RatingPlate
                        v-if="typeof user.data?.rating === 'number'"
                        :ra="user.data.rating"
                    ></RatingPlate>
                </div>
                <div class="user-badges">
                    <mdui-chip icon="videogame_asset" :disabled="!user.divingFish?.name">
                        {{
                            user.divingFish?.name ??
                            (user.divingFish?.importToken && user.inGame?.id
                                ? "仅上传"
                                : "未绑定水鱼")
                        }}
                    </mdui-chip>
                    <mdui-chip
                        icon="local_laundry_service"
                        :disabled="!user.inGame?.id && !user.inGame?.name"
                    >
                        {{ user.inGame?.name ?? user.inGame?.id ?? "未绑定游戏" }}
                    </mdui-chip>
                    <!-- <mdui-chip
                        v-if="user.settings?.manuallyUpdate"
                        icon="sync_disabled"
                        variant="assist"
                    >
                        手动更新
                    </mdui-chip> -->
                </div>
            </div>
            <div class="user-actions">
                <mdui-button-icon
                    variant="standard"
                    icon="update"
                    @click="updateUser(user, index === 0 ? true : false)"
                ></mdui-button-icon>
                <mdui-dropdown>
                    <mdui-button-icon
                        slot="trigger"
                        icon="more_vert"
                        style="margin-right: 10px"
                    ></mdui-button-icon>
                    <mdui-menu>
                        <mdui-menu-item @click="openEditDialog(user, index)">
                            修改
                            <mdui-icon slot="icon" name="edit"></mdui-icon>
                        </mdui-menu-item>

                        <mdui-divider />

                        <mdui-menu-item @click="checkLogin(user)" v-if="user.inGame?.id">
                            视奸（查询登录状态）
                            <mdui-icon slot="icon" name="remove_red_eye"></mdui-icon>
                        </mdui-menu-item>
                        <mdui-menu-item
                            @click="previewRivals(user)"
                            v-if="!index && user.inGame?.id"
                        >
                            查询对战好友
                            <mdui-icon slot="icon" name="list_alt"></mdui-icon>
                        </mdui-menu-item>
                        <mdui-menu-item
                            @click="goToUserFittedDetails(index)"
                            v-if="user.data.detailed"
                        >
                            查看拟合 B50
                            <mdui-icon slot="icon" name="stacked_bar_chart"></mdui-icon>
                        </mdui-menu-item>
                        <mdui-menu-item
                            @click="goToUserSongs(index)"
                            v-if="index && user.data.detailed"
                        >
                            查看完整成绩
                            <mdui-icon slot="icon" name="library_music"></mdui-icon>
                        </mdui-menu-item>
                        <mdui-menu-item @click="showUserInfo(user)">
                            查看用户信息
                            <mdui-icon slot="icon" name="info"></mdui-icon>
                        </mdui-menu-item>

                        <mdui-menu-item @click="previewStockedTickets(user)" v-if="user.inGame?.id">
                            预览倍券
                            <mdui-icon slot="icon" name="airplane_ticket"></mdui-icon>
                        </mdui-menu-item>
                        <mdui-menu-item
                            @click="clearIllegalTicketsPrompt(user)"
                            v-if="user.inGame?.id"
                        >
                            清理补偿倍券
                            <mdui-icon slot="icon" name="airplane_ticket"></mdui-icon>
                        </mdui-menu-item>

                        <mdui-menu-item
                            @click="exportUserBackupHandler(user)"
                            v-if="user.inGame.id"
                        >
                            下载数据备份
                            <mdui-icon slot="icon" name="cloud_download"></mdui-icon>
                        </mdui-menu-item>

                        <mdui-divider />

                        <mdui-menu-item @click="toggleManualUpdate(index)" v-if="index">
                            手动更新模式
                            <mdui-icon
                                slot="icon"
                                :name="user.settings?.manuallyUpdate ? 'check' : ''"
                            ></mdui-icon>
                        </mdui-menu-item>

                        <mdui-menu-item @click="setAsDefault(index)" v-if="index">
                            设为主用户
                            <mdui-icon slot="icon" name="vertical_align_top"></mdui-icon>
                        </mdui-menu-item>
                        <mdui-menu-item @click="openDeleteDialog(index)">
                            删除
                            <mdui-icon slot="icon" name="delete"></mdui-icon>
                        </mdui-menu-item>
                    </mdui-menu>
                </mdui-dropdown>
                <!-- <mdui-button end-icon="arrow_forward" @click="goToUserDetails(index)">详情</mdui-button> -->
            </div>
        </mdui-card>
    </div>

    <BindUserDialog v-model="isDialogVisible" :user="currentUserToEdit" @save="handleUserSave" />

    <div class="fab-container">
        <mdui-fab icon="update" extended v-if="shared.users.length" @click="updateAll">
            全部更新
        </mdui-fab>
        <mdui-fab icon="add" :extended="!shared.users.length" @click="openAddDialog">
            添加用户
        </mdui-fab>
    </div>
</template>

<style scoped>
    .user-cards-container {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-bottom: calc(3.5rem + 32px);
    }

    mdui-card {
        width: 97.5%;
        margin-left: 1.25%;
        align-items: center;

        display: flex;
        justify-content: space-between;
    }

    .user-name {
        max-width: calc(97.5vw - 37.5px - 5rem);
        display: flex;
        flex-direction: column;
        height: 100%;
        justify-content: space-evenly;
        align-items: flex-start;
        padding: 10px 10px 13px 15px;
        width: 100%;
    }
    .user-badges {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: 5px;
        height: 2rem;
    }
    .primary-name {
        font-weight: 500;
        margin-top: 0;
        margin-bottom: 5px;
    }
    mdui-chip {
        height: 28px;
    }

    /* svg {
        padding-left: 15px;
    } */

    .user-actions {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 2.5px;

        /* padding-right: 10px; */
    }

    .fab-container {
        position: fixed;
        right: 16px;
        display: flex;
        flex-direction: row-reverse;
        gap: 15px;
        bottom: 96px;

        @media (min-aspect-ratio: 1.001/1) {
            bottom: 16px;
        }
        @media (max-aspect-ratio: 0.999/1) or (aspect-ratio: 1/1) {
            bottom: 96px;
        }
    }
    @supports (-webkit-touch-callout: none) {
        @media all and (display-mode: standalone) {
            .fab-container {
                bottom: 112px;
            }
            .user-cards-container {
                padding-bottom: calc(4.5rem + 32px);
            }
        }
    }
</style>
