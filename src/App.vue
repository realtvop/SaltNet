<script setup lang="ts">
    import { ref, provide } from "vue";
    import { useRoute, useRouter } from "vue-router";
    import TopAppBar from "./components/app/TopAppBar.vue";

    const playerInfo = ref({
        name: "",
        data: null as any,
    });

    provide("playerInfo", playerInfo);
    const route = useRoute();
    const router = useRouter();

    function handleSongsNavigation() {
        if (route.path === "/songs") {
            const searchInput = document.getElementById("search-input");
            if (searchInput) {
                searchInput.focus();
            }
        } else {
            router.push("/songs");
        }
    }

    function handleNavigationChange(event: Event) {
        const target = event.target as any;
        const value = target?.value;
        if (value === "/songs") {
            handleSongsNavigation();
        } else if (value) {
            router.push(value);
        }
    }
</script>

<template>
    <div class="app-layout">
        <component :is="TopAppBar" :playerInfo="playerInfo" />
        <s-navigation
            mode="bottom"
            :value="route.path"
            v-if="!route.path.startsWith('/b50/') && !route.path.startsWith('/songs/')"
            @change="handleNavigationChange"
        >
            <s-navigation-item value="/">
                <s-icon>home</s-icon>
                首页
            </s-navigation-item>
            <s-navigation-item value="/b50">
                <s-icon>data_thresholding</s-icon>
                B50
            </s-navigation-item>
            <s-navigation-item value="/songs">
                <s-icon>library_music</s-icon>
                谱面
            </s-navigation-item>
            <s-navigation-item value="/collections">
                <s-icon>collections</s-icon>
                藏品
            </s-navigation-item>
            <s-navigation-item value="/users">
                <s-icon>people</s-icon>
                用户
            </s-navigation-item>
            <s-navigation-item value="/about">
                <s-icon>info</s-icon>
                关于
            </s-navigation-item>
        </s-navigation>
        <s-navigation
            mode="rail"
            :value="route.path"
            v-if="!route.path.startsWith('/b50/') && !route.path.startsWith('/songs/')"
            @change="handleNavigationChange"
        >
            <s-navigation-item value="/">
                <s-icon>home</s-icon>
                首页
            </s-navigation-item>
            <s-navigation-item value="/b50">
                <s-icon>data_thresholding</s-icon>
                B50
            </s-navigation-item>
            <s-navigation-item value="/songs">
                <s-icon>library_music</s-icon>
                谱面
            </s-navigation-item>
            <s-navigation-item value="/collections">
                <s-icon>collections</s-icon>
                藏品
            </s-navigation-item>
            <s-navigation-item value="/users">
                <s-icon>people</s-icon>
                用户
            </s-navigation-item>
            <s-navigation-item value="/about">
                <s-icon>info</s-icon>
                关于
            </s-navigation-item>
        </s-navigation>

        <main class="app-container">
            <router-view v-slot="{ Component }">
                <component :is="Component" :key="route.path" />
            </router-view>
        </main>
    </div>
</template>

<style scoped>
    .app-layout {
        display: flex;
        flex-direction: column;
        height: 100vh;
    }

    .app-container {
        padding: 16px;
        box-sizing: border-box;
        flex: 1;
        overflow-y: auto;
    }

    s-navigation {
        position: fixed !important;
        -webkit-tap-highlight-color: transparent;
        z-index: 1000;
    }

    s-navigation[mode="bottom"] {
        bottom: 0;
        left: 0;
        right: 0;
        height: var(--nav-bar-height, 80px);
        padding-bottom: var(--nav-bar-padding-bottom, env(safe-area-inset-bottom));
    }

    s-navigation[mode="rail"] {
        left: 0;
        top: 0;
        bottom: 0;
        width: var(--nav-rail-width, 80px);
        display: none;
    }

    /* Show rail navigation on desktop */
    @media (min-aspect-ratio: 1.001/1) {
        s-navigation[mode="bottom"] {
            display: none;
        }
        s-navigation[mode="rail"] {
            display: block !important;
        }
        .app-container {
            margin-left: var(--nav-rail-width, 80px);
        }
    }

    .player-info-bar {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .player-rating-chip {
        margin-left: 4px;
        transform: scale(0.9);
    }

    .favorite-icon-button {
        margin-left: 4px;
    }

    .search-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .search-field {
        min-width: 150px;
    }

    @media (max-width: 600px) {
        .search-field {
            min-width: 120px;
        }
        .player-info-bar {
            gap: 4px;
        }
    }
</style>

<style>
    body {
        margin: 0;
    }

    #app {
        width: 100%;
        min-height: 100vh;
        display: block;
        overflow: hidden;
    }

    button {
        padding: initial;
        border: initial;
        background: initial;
        font-family: initial;
        font-size: initial;
        font-weight: initial;
        border-radius: initial;
        cursor: initial;
        transition: initial;
        color: initial;
    }
    button:hover {
        border-color: initial;
    }
    button:focus,
    button:focus-visible {
        outline: initial;
    }
</style>
