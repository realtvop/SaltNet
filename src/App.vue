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

    // Handle songs navigation - focus search if already on songs page
    function handleSongsNavigation() {
        if (route.path === "/songs") {
            // Already on songs page, focus the search input
            const searchInput = document.getElementById("search-input");
            if (searchInput) {
                searchInput.focus();
            }
        } else {
            // Navigate to songs page
            router.push("/songs");
        }
    }
</script>

<template>
    <mdui-layout>
        <component :is="TopAppBar" :playerInfo="playerInfo" />
        <mdui-navigation-bar
            :value="route.path"
            v-if="!route.path.startsWith('/b50/')"
            label-visibility="labeled"
        >
            <mdui-navigation-bar-item icon="home" value="/" @click="router.push('/')">
                首页
            </mdui-navigation-bar-item>
            <mdui-navigation-bar-item
                icon="data_thresholding"
                value="/b50"
                @click="router.push('/b50')"
            >
                B50
            </mdui-navigation-bar-item>
            <mdui-navigation-bar-item
                icon="library_music"
                value="/songs"
                @click="handleSongsNavigation"
            >
                谱面
            </mdui-navigation-bar-item>
            <mdui-navigation-bar-item icon="people" value="/users" @click="router.push('/users')">
                用户
            </mdui-navigation-bar-item>
            <mdui-navigation-bar-item icon="info" value="/about" @click="router.push('/about')">
                关于
            </mdui-navigation-bar-item>
        </mdui-navigation-bar>
        <mdui-navigation-rail :value="route.path" v-if="!route.path.startsWith('/b50/')">
            <mdui-navigation-rail-item icon="home" value="/" @click="router.push('/')">
                首页
            </mdui-navigation-rail-item>
            <mdui-navigation-rail-item
                icon="data_thresholding"
                value="/b50"
                @click="router.push('/b50')"
            >
                B50
            </mdui-navigation-rail-item>
            <mdui-navigation-rail-item
                icon="library_music"
                value="/songs"
                @click="handleSongsNavigation"
            >
                谱面
            </mdui-navigation-rail-item>
            <mdui-navigation-rail-item icon="people" value="/users" @click="router.push('/users')">
                用户
            </mdui-navigation-rail-item>
            <mdui-navigation-rail-item icon="info" value="/about" @click="router.push('/about')">
                关于
            </mdui-navigation-rail-item>
        </mdui-navigation-rail>

        <mdui-layout-main class="app-container">
            <router-view v-slot="{ Component }">
                <component :is="Component" :key="route.path" />
            </router-view>
        </mdui-layout-main>
    </mdui-layout>
</template>

<style scoped>
    .app-container {
        padding: 16px;
        box-sizing: border-box;
        height: 100%;
        overflow-y: auto;
    }

    mdui-navigation-bar,
    mdui-navigation-rail {
        position: fixed !important;
        -webkit-tap-highlight-color: transparent;
    }
    mdui-navigation-bar {
        height: var(--nav-bar-height);
        padding-bottom: var(--nav-bar-padding-bottom);
    }

    mdui-navigation-rail-item {
        overflow: hidden;
    }
    mdui-navigation-bar-item {
        overflow: hidden;
    }

    mdui-navigation-rail {
        display: none;
    }
    @media (min-aspect-ratio: 1.001/1) {
        mdui-navigation-bar {
            display: none;
        }
        mdui-navigation-rail {
            display: block !important;
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
