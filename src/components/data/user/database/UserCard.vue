<script setup lang="ts">
    import { useRouter } from "vue-router";
    import type { SaltNetDatabaseLogin } from "./type";

    const router = useRouter();

    const props = defineProps<{
        loggedInUser?: SaltNetDatabaseLogin | null;
    }>();

    const emit = defineEmits<{
        (event: "open-signin"): void;
        (event: "open-signup"): void;
    }>();

    const openSignin = () => emit("open-signin");
    const openSignup = () => emit("open-signup");
    const goToMe = () => router.push("/me");
</script>

<template>
    <mdui-card variant="filled">
        <!-- Logged out state -->
        <template v-if="!props.loggedInUser">
            <h2>注册或登录您的 SaltNet 账户</h2>
            <span style="margin-top: -1rem; margin-bottom: 0.25rem;">(当前处于测试阶段) 您也永远可以不登录使用</span>
            <div class="signup-login-btns">
                <mdui-button full-width @click="openSignin">登录</mdui-button>
                <mdui-button full-width variant="text" @click="openSignup">注册</mdui-button>
            </div>
        </template>

        <!-- Logged in state -->
        <template v-else>
            <div class="logged-in-header">
                <div class="user-info">
                    <mdui-icon name="account_circle"></mdui-icon>
                    <div class="user-details">
                        <span class="email" ]>欢迎回来，</span>
                        <span class="username">{{ props.loggedInUser.username }}</span>
                    </div>
                </div>
                <mdui-button variant="text" @click="goToMe">账户设置</mdui-button>
            </div>
        </template>
    </mdui-card>
</template>

<style scoped>
    mdui-card {
        padding: 10px;
        flex-direction: column;
        width: 100%;
    }

    .signup-login-btns {
        display: flex;
        flex-direction: row;
        gap: 10px;
        margin-bottom: 10px;
    }

    .logged-in-header {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        padding: 5px 0;
        width: 100%;
    }

    .user-info {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 12px;
    }

    .user-info mdui-icon {
        font-size: 40px;
        color: var(--mdui-color-primary);
    }

    .user-details {
        display: flex;
        flex-direction: column;
    }

    .username {
        font-weight: 500;
        font-size: 1.1rem;
    }

    .email {
        font-size: 0.85rem;
        color: var(--mdui-color-on-surface-variant);
    }
</style>
