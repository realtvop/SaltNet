<template>
    <mdui-dialog
        ref="dialogRef"
        :open="open"
        headline=""
        description=""
        @open="markDialogOpen"
        @close="handleClose"
        close-on-esc
    >
        <mdui-top-app-bar slot="header">
            <mdui-button-icon icon="close" @click="requestClose"></mdui-button-icon>
            <mdui-top-app-bar-title>登录 SaltNet</mdui-top-app-bar-title>
        </mdui-top-app-bar>

        <div class="dialog-body">
            <mdui-text-field
                label="邮箱或用户名"
                :value="identifier"
                @input="identifier = $event.target.value || ''"
                autocomplete="username"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                required
                clearable
                :disabled="isLoading"
            ></mdui-text-field>

            <mdui-text-field
                label="密码"
                type="password"
                :value="password"
                @input="password = $event.target.value || ''"
                autocomplete="current-password"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                toggle-password-visibility
                required
                :disabled="isLoading"
                @keydown.enter="handleLogin"
            ></mdui-text-field>

            <mdui-button
                full-width
                @click="handleLogin"
                :loading="isLoading"
                :disabled="!canSubmit"
            >
                登录
            </mdui-button>

            <mdui-button variant="text" @click="handleForgotPassword" full-width>
                忘记密码？
            </mdui-button>

            <div class="divider-container">
                <mdui-divider></mdui-divider>
                <span class="divider-text">或使用第三方账号</span>
                <mdui-divider></mdui-divider>
            </div>

            <div class="oauth-buttons">
                <mdui-button variant="outlined" @click="handleOAuthLogin('google')" full-width>
                    <mdui-icon slot="icon" name="g_mobiledata"></mdui-icon>
                    Google 登录
                </mdui-button>
                <mdui-button variant="outlined" @click="handleOAuthLogin('github')" full-width>
                    <mdui-icon slot="icon" name="code"></mdui-icon>
                    GitHub 登录
                </mdui-button>
            </div>
        </div>
    </mdui-dialog>
</template>

<script setup lang="ts">
    import { computed, nextTick, ref, watch } from "vue";
    import { prompt } from "mdui";
    import { markDialogOpen, markDialogClosed } from "@/components/app/router.vue";
    import { loginSaltNet, forgotPassword, getOAuthLoginUrl } from "./api";
    import type { SaltNetDatabaseLogin, OAuthProvider } from "./type";

    const props = defineProps<{ modelValue: boolean }>();
    const emit = defineEmits<{
        (event: "update:modelValue", value: boolean): void;
        (event: "login-success", data: SaltNetDatabaseLogin): void;
    }>();

    const dialogRef = ref<any>(null);
    const open = ref(false);

    const identifier = ref("");
    const password = ref("");
    const isLoading = ref(false);

    const canSubmit = computed(() => {
        return identifier.value.trim().length > 0 && password.value.length > 0 && !isLoading.value;
    });

    watch(
        () => props.modelValue,
        async newValue => {
            open.value = newValue;
            await nextTick();
            if (dialogRef.value) dialogRef.value.open = newValue;
        },
        { immediate: true }
    );

    const handleClose = () => {
        markDialogClosed(dialogRef.value);
        if (open.value) emit("update:modelValue", false);
    };

    const requestClose = () => {
        emit("update:modelValue", false);
    };

    const handleLogin = async () => {
        if (!canSubmit.value) return;

        isLoading.value = true;

        try {
            const result = await loginSaltNet(identifier.value.trim(), password.value);

            if (result) {
                emit("login-success", result);
                // Clear form
                identifier.value = "";
                password.value = "";
                requestClose();
            }
        } finally {
            isLoading.value = false;
        }
    };

    const handleForgotPassword = () => {
        prompt({
            headline: "找回密码",
            description: "输入您的注册邮箱，我们将发送密码重置链接",
            confirmText: "发送",
            cancelText: "取消",
            closeOnEsc: true,
            closeOnOverlayClick: true,
            textFieldOptions: {
                type: "email",
                label: "邮箱地址",
            },
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
            onConfirm: async (email: string) => {
                if (email && email.trim()) {
                    await forgotPassword(email.trim());
                }
            },
        });
    };

    const handleOAuthLogin = (provider: OAuthProvider) => {
        window.location.href = getOAuthLoginUrl(provider);
    };
</script>

<style scoped>
    .dialog-body {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    mdui-text-field {
        width: 100%;
    }

    .divider-container {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 8px 0;
    }

    .divider-container mdui-divider {
        flex: 1;
    }

    .divider-text {
        font-size: 0.85rem;
        color: var(--mdui-color-on-surface-variant);
        white-space: nowrap;
    }

    .oauth-buttons {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
</style>
