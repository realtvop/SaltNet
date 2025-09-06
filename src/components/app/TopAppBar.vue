<script setup lang="ts">
    import { useRouter } from "vue-router";

    const router = useRouter();
    const route = router.currentRoute;
</script>

<template>
    <s-appbar class="custom-app-bar">
        <s-icon-button
            v-if="
                ['/settings'].includes(route.path) ||
                route.path.startsWith('/b50/') ||
                route.path.startsWith('/songs/')
            "
            class="icon-btn"
            @click="router.back"
        >
            <s-icon>arrow_back</s-icon>
        </s-icon-button>
        <s-button type="text" class="icon-btn" @click="router.push('/')" style="aspect-ratio: 1">
            <img src="/favicon.ico" alt="icon" class="favicon-icon favicon" />
        </s-button>
        <h1 class="app-title">SaltNet</h1>
        <div class="spacer"></div>
        <template v-if="route.path === '/' || route.path === '/index'">
            <s-icon-button @click="router.push('/settings')">
                <s-icon>settings</s-icon>
            </s-icon-button>
        </template>
    </s-appbar>
</template>

<style scoped>
    s-appbar {
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
        width: 100%;
        z-index: 1000;
    }

    .spacer {
        flex: 1;
    }

    .app-title {
        font-weight: bold;
        font-size: 1.1rem;
        margin: 0 12px 0 8px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 56px;
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

    .player-title {
        max-width: 120px;
        display: inline-block;
        vertical-align: middle;
    }
    .search-box {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .search-box-right {
        margin-left: auto;
    }
    .search-input {
        height: 40px;
        min-width: 120px;
        font-size: 1rem;
    }
    .search-btn {
        height: 40px;
        min-width: 48px;
        font-size: 1rem;
    }

    mdui-top-app-bar-title {
        font-weight: 750;
    }
</style>
