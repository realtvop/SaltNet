<template>
    <mdui-dialog
        ref="dialogRef"
        headline=""
        description=""
        @open="markDialogOpen"
        @close="handleClose"
        @closed="markDialogClosed"
        close-on-esc
    >
        <mdui-top-app-bar slot="header">
            <mdui-button-icon icon="close" @click="requestClose"></mdui-button-icon>
            <mdui-top-app-bar-title>编辑用户绑定</mdui-top-app-bar-title>
            <mdui-button variant="text" @click="handleSave">保存</mdui-button>
        </mdui-top-app-bar>

        <mdui-text-field
            label="备注名(选填)"
            :value="localUser.remark ?? ''"
            @input="localUser.remark = $event.target.value || null"
            placeholder="用于显示的自定义名称"
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            clearable
        ></mdui-text-field>

        <!-- First user: show SaltNet register/login buttons between remark and tabs -->
        <div v-if="isDBEnabled && isFirstUser" class="saltnet-buttons">
            <mdui-button full-width @click="openSigninDialog">登录 SaltNet</mdui-button>
            <mdui-button full-width variant="tonal" @click="openSignupDialog">
                注册 SaltNet
            </mdui-button>
        </div>

        绑定账号：
        <mdui-tabs>
            <!-- SaltNet tab only for non-first users -->
            <mdui-tab
                value="saltnet"
                v-if="
                    isDBEnabled &&
                    !isFirstUser &&
                    !localUser.inGame?.id &&
                    !localUser.divingFish?.name &&
                    !userLXNSBindStatus
                "
            >
                SaltNet
            </mdui-tab>
            <mdui-tab-panel slot="panel" value="saltnet" v-if="isDBEnabled && !isFirstUser">
                <mdui-text-field
                    label="SaltNet 用户名"
                    :value="localUser.saltnetUsername ?? ''"
                    @input="localUser.saltnetUsername = $event.target.value || null"
                    helper="通过 SaltNet 用户名查询成绩"
                    autocapitalize="off"
                    autocomplete="off"
                    autocorrect="off"
                    spellcheck="false"
                    clearable
                ></mdui-text-field>
            </mdui-tab-panel>

            <mdui-tab value="divingFish">水鱼</mdui-tab>
            <mdui-tab-panel slot="panel" value="divingFish">
                <mdui-text-field
                    v-if="
                        localUser.divingFish &&
                        !(localUser.inGame && localUser.inGame.id) &&
                        !userLXNSBindStatus &&
                        !localUser.saltnetDB?.id
                    "
                    label="水鱼用户名"
                    :value="localUser.divingFish.name ?? ''"
                    @input="localUser.divingFish.name = $event.target.value || null"
                    helper="用于获取数据，绑定了游戏则可以不填"
                    autocapitalize="off"
                    autocomplete="off"
                    autocorrect="off"
                    spellcheck="false"
                ></mdui-text-field>
                <!-- <span v-else>
                    已绑定其他数据源，暂不可绑定水鱼
                </span> -->
                <mdui-text-field
                    v-if="localUser.divingFish && localUser.inGame && localUser.inGame.id"
                    label="水鱼成绩导入 Token"
                    :value="localUser.divingFish.importToken ?? ''"
                    @input="localUser.divingFish.importToken = $event.target.value || null"
                    helper="用于上传数据，若不绑定游戏则可以不填"
                    autocapitalize="off"
                    autocomplete="off"
                    autocorrect="off"
                    spellcheck="false"
                    clearable
                ></mdui-text-field>
            </mdui-tab-panel>

            <mdui-tab value="lxns">落雪</mdui-tab>
            <mdui-tab-panel slot="panel" value="lxns">
                <mdui-button full-width @click="startBindingLXNS">
                    {{ userLXNSBindStatus ? "换绑" : "绑定" }}落雪帐号
                </mdui-button>
                <mdui-button
                    full-width
                    variant="text"
                    @click="unbindLXNS"
                    v-if="userLXNSBindStatus"
                >
                    解绑
                </mdui-button>
            </mdui-tab-panel>

            <mdui-tab value="inGame">国服 NET</mdui-tab>
            <mdui-tab-panel slot="panel" value="inGame">
                <mdui-list-item headline="从国服 NET 同步成绩">
                    <span slot="description">直接从游戏内获取成绩</span>
                    <mdui-switch
                        slot="end-icon"
                        :checked="localUser.inGame?.enabled ?? false"
                        @change="handleEnabledChange"
                    ></mdui-switch>
                </mdui-list-item>
                <br />
                <template v-if="localUser.inGame?.enabled">
                    <mdui-list-item headline="默认快速更新">
                        <span slot="description">
                            无需每次获取二维码登录
                            <br />
                            只能更新达成率和 DX 分数
                            <br />
                            未启用不需要绑定账户
                        </span>
                        <mdui-switch
                            slot="end-icon"
                            :checked="localUser.inGame?.useFastUpdate ?? false"
                            @change="handleFastUpdateChange"
                        ></mdui-switch>
                    </mdui-list-item>
                    <br v-if="localUser.inGame?.useFastUpdate" />
                    <div class="userid-textfield" v-if="localUser.inGame?.useFastUpdate">
                        <mdui-text-field
                            v-if="localUser.inGame"
                            label="舞萌 UserID 右侧绑定"
                            placeholder="未绑定"
                            type="password"
                            :value="localUser.inGame.id ?? ''"
                            @input="
                                localUser.inGame.id = $event.target.value
                                    ? parseInt($event.target.value)
                                    : null
                            "
                            autocapitalize="off"
                            autocomplete="off"
                            autocorrect="off"
                            spellcheck="false"
                            disabled
                        ></mdui-text-field>
                        <mdui-button-icon icon="edit" @click="bindInGame"></mdui-button-icon>
                    </div>
                </template>
            </mdui-tab-panel>
        </mdui-tabs>

        <SignupDialog
            v-if="isDBEnabled"
            v-model="isSignupDialogOpen"
            @register-success="handleLoginSuccess"
        />
        <SigninDialog
            v-if="isDBEnabled"
            v-model="isSigninDialogOpen"
            @login-success="handleLoginSuccess"
        />
    </mdui-dialog>
</template>

<script setup lang="ts">
    import { ref, watch, nextTick, toRaw, computed } from "vue";
    import { markDialogOpen, markDialogClosed } from "@/components/app/router";
    import type { User } from "@/components/data/user/type";
    import { confirm, prompt, snackbar } from "mdui";
    import { postAPI, SaltAPIEndpoints } from "@/components/integrations/SaltNet";
    import { initLXNSOAuth } from "@/components/integrations/lxns";

    import SignupDialog from "./database/SignupDialog.vue";
    import SigninDialog from "./database/SigninDialog.vue";
    import { isDBEnabled, type SaltNetDatabaseLogin } from "./database";

    const props = defineProps<{
        modelValue: boolean;
        user: User | null;
        userIndex: number | null;
        isEditingNewUser: boolean;
        isFirstUser: boolean;
    }>();

    const emit = defineEmits(["update:modelValue", "save", "delete", "saltnet-login"]);

    const dialogRef = ref<any>(null);
    const isSignupDialogOpen = ref(false);
    const isSigninDialogOpen = ref(false);

    const localUser = ref<Partial<User>>({});

    const ensureUserSettings = (user: Partial<User>) => {
        if (!user.settings) {
            user.settings = { manuallyUpdate: false } as User["settings"];
            return;
        }
        if (user.settings.manuallyUpdate === undefined) user.settings.manuallyUpdate = false;
    };

    const ensureInGame = (user: Partial<User>) => {
        if (!user.inGame) {
            user.inGame = { name: null, id: null, enabled: false, useFastUpdate: false };
            return;
        }
        if (user.inGame.enabled === undefined) user.inGame.enabled = false;
        if (user.inGame.useFastUpdate === undefined) user.inGame.useFastUpdate = false;
    };

    watch(
        () => props.user,
        newUser => {
            if (newUser) {
                localUser.value = toRaw(newUser);
                if (!localUser.value.divingFish) {
                    localUser.value.divingFish = { name: null, importToken: null };
                }
                ensureInGame(localUser.value);
                if (!localUser.value.lxns) {
                    localUser.value.lxns = { auth: null, name: null, id: null };
                }
                ensureUserSettings(localUser.value);
            } else {
                localUser.value = {
                    divingFish: { name: null, importToken: null },
                    inGame: { name: null, id: null, enabled: false, useFastUpdate: false },
                    lxns: { auth: null, name: null, id: null },
                    settings: { manuallyUpdate: false },
                };
            }
        },
        { immediate: true, deep: true }
    );

    const userLXNSBindStatus = computed(() => {
        if (!localUser.value.lxns || !localUser.value.lxns.auth) return false;
        if (localUser.value.lxns.auth.expiresAt! + 2592e6 > Date.now()) return true;
        return false;
    });

    watch(
        () => props.modelValue,
        async newValue => {
            await nextTick();
            if (dialogRef.value) {
                dialogRef.value.open = newValue;
            }
        }
    );

    const handleClose = () => {
        // 同步父组件的 modelValue，但不重复 markDialogClosed（已在 @closed 事件中调用）
        if (props.modelValue) emit("update:modelValue", false);
    };

    const requestClose = () => {
        emit("update:modelValue", false);
    };

    function saveUser() {
        ensureUserSettings(localUser.value);
        ensureInGame(localUser.value);
        emit("save", {
            remark: localUser.value.remark ?? null,
            divingFish: {
                name: localUser.value.divingFish?.name ?? null,
                importToken: localUser.value.divingFish?.importToken ?? null,
            },
            lxns: {
                auth: localUser.value.lxns?.auth ?? null,
                name: localUser.value.lxns?.name ?? null,
                id: localUser.value.lxns?.id ?? null,
            },
            inGame: {
                id: localUser.value.inGame?.id ?? null,
                enabled: localUser.value.inGame?.enabled ?? false,
                useFastUpdate: localUser.value.inGame?.useFastUpdate ?? false,
            },
            saltnetUsername: localUser.value.saltnetUsername ?? null,
            settings: {
                manuallyUpdate: localUser.value.settings?.manuallyUpdate ?? false,
            },
        });
        requestClose();
    }

    const handleFastUpdateChange = (event: Event) => {
        ensureInGame(localUser.value);
        localUser.value.inGame!.useFastUpdate = (event.target as HTMLInputElement).checked;
    };

    const handleEnabledChange = (event: Event) => {
        ensureInGame(localUser.value);
        localUser.value.inGame!.enabled = (event.target as HTMLInputElement).checked;
    };

    function openSignupDialog() {
        isSignupDialogOpen.value = true;
    }

    function openSigninDialog() {
        isSigninDialogOpen.value = true;
    }

    function handleLoginSuccess(data: SaltNetDatabaseLogin) {
        emit("saltnet-login", data);
        snackbar({ message: "SaltNet 登录成功！", autoCloseDelay: 1500 });
    }

    const handleSave = () => {
        saveUser();
    };

    function bindInGame() {
        prompt({
            headline: "绑定用户",
            description: "输入二维码扫描结果或复制的二维码页面链接",
            confirmText: "绑定",
            cancelText: "取消",
            closeOnEsc: true,
            closeOnOverlayClick: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
            onConfirm: async (value: string) => {
                if (value) {
                    const id = parseInt(value);
                    if (!isNaN(id)) {
                        if (!localUser.value.inGame)
                            localUser.value.inGame = { name: null, id: null };
                        localUser.value.inGame.id = id;
                        return;
                    } else {
                        if (value.startsWith("SGWCMAID") && value.length === 84)
                            return await getUserIdFromQRCode(value);
                        if (value.startsWith("http")) {
                            const matches = value.match(/MAID.{0,76}/g);
                            if (matches && matches[0]) return await getUserIdFromQRCode(matches[0]);
                            else
                                snackbar({
                                    message: "二维码/链接解析失败，请检查是否正确",
                                    autoCloseDelay: 1000,
                                });
                        }
                        snackbar({
                            message: "二维码/链接解析失败，请检查是否正确",
                            autoCloseDelay: 1000,
                        });
                    }
                }
            },
        });
    }

    function getUserIdFromQRCode(qrCode: string) {
        qrCode = qrCode.slice(-64);
        return postAPI(SaltAPIEndpoints.GetQRInfo, { qrCode } as Record<string, unknown>)
            .then(r => r.json())
            .then(data => {
                if (data.errorID === 0) {
                    if (!localUser.value.inGame) localUser.value.inGame = { name: null, id: null };
                    localUser.value.inGame.id = data.userID;
                } else {
                    snackbar({
                        message: "二维码/链接解析失败，请检查二维码是否正确",
                        autoCloseDelay: 1000,
                    });
                }
            });
    }

    function startBindingLXNS() {
        if (props.isEditingNewUser) saveUser();
        setTimeout(async () => {
            const url = await initLXNSOAuth(
                props.isEditingNewUser ? props.userIndex! - 1 : props.userIndex!
            );
            window.location.href = url;
        }, 0);
    }
    function unbindLXNS() {
        confirm({
            headline: "确认解绑落雪帐号？",
            description: "您可以稍后重新绑定",
            confirmText: "解绑",
            cancelText: "取消",
            closeOnEsc: true,
            closeOnOverlayClick: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
            onConfirm: () => {
                localUser.value.lxns = { auth: null, name: null, id: null };
                snackbar({ message: "已解绑落雪帐号", autoCloseDelay: 1000 });
                return true;
            },
        });
    }
</script>

<style scoped>
    mdui-text-field {
        display: block;
        margin-bottom: 16px;
    }

    .switch-container {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        padding: 0 2px;
        justify-content: space-between;
    }
    .switch-description {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .userid-textfield {
        display: flex;
        align-items: center;
        width: 100%;
        margin-bottom: 16px;
    }
    .userid-textfield mdui-text-field {
        width: calc(100% - 3rem);
        margin-bottom: 0px;
        margin-right: 0.5rem;
    }

    mdui-tabs {
        --mdui-color-surface: #6cf;
    }
    mdui-tab-panel {
        padding-top: 1rem;
    }

    .saltnet-buttons {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
    }
</style>
