<script setup lang="ts">
    import { useRouter } from "vue-router";
    import { setAPIKey } from "../integrations/nearcade/setAPIKey";

    const router = useRouter();
    const route = router.currentRoute;
</script>

<template>
    <mdui-top-app-bar class="custom-app-bar" scroll-behavior="elevate">
        <mdui-button-icon
            icon="arrow_back"
            variant="text"
            v-if="
                ['/settings', '/nearcade', '/about', '/me'].includes(route.path) ||
                route.path.startsWith('/b50/') ||
                route.path.startsWith('/songs/')
            "
            class="icon-btn"
            @click="router.back"
            style="aspect-ratio: 1"
        ></mdui-button-icon>
        <mdui-button
            variant="text"
            class="icon-btn"
            @click="router.push('/')"
            style="aspect-ratio: 1"
        >
            <img src="/favicon.ico" alt="icon" class="favicon-icon favicon" />
        </mdui-button>
        <mdui-top-app-bar-title>SaltNet</mdui-top-app-bar-title>
        <template v-if="route.path === '/' || route.path === '/index'">
            <mdui-button-icon icon="info" @click="router.push('/about')"></mdui-button-icon>
        </template>
        <template v-if="route.path === '/' || route.path === '/index'">
            <mdui-button-icon icon="settings" @click="router.push('/settings')"></mdui-button-icon>
        </template>

        <mdui-tooltip v-if="route.path === '/nearcade'" content="设置 nearcade API Key">
            <mdui-button-icon @click="setAPIKey" icon="key"></mdui-button-icon>
        </mdui-tooltip>
        <mdui-tooltip v-if="route.path === '/nearcade'" content="打开 nearcade 网站">
            <mdui-button-icon
                icon="open_in_new"
                href="https://nearcade.phizone.cn/"
                target="_blank"
            ></mdui-button-icon>
        </mdui-tooltip>
    </mdui-top-app-bar>
</template>

<style scoped>
    mdui-top-app-bar {
        position: fixed !important;
    }

    .custom-app-bar {
        height: 56px;
        min-height: 56px;
        display: flex;
        align-items: center;
        padding: 0 8px;
        box-sizing: border-box;
        position: relative;
    }
    .icon-btn {
        height: 40px;
        min-width: 40px;
        padding: 0 4px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .favicon-icon {
        width: 24px;
        height: 24px;
        display: block;
    }

    mdui-top-app-bar-title {
        font-weight: 750;
    }
</style>
