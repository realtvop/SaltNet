<script setup lang="ts">
    const emit = defineEmits<{
        (event: "open-signin"): void;
        (event: "open-signup"): void;
    }>();

    const openSignin = () => emit("open-signin");
    const openSignup = () => emit("open-signup");
</script>

<template>
    <mdui-card variant="filled">
        <h2>注册或登录您的 SaltNet 账户</h2>
        <div class="signup-login-btns">
            <mdui-button full-width @click="openSignin">登录</mdui-button>
            <mdui-button full-width variant="text" @click="openSignup">注册</mdui-button>
        </div>
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
</style>
