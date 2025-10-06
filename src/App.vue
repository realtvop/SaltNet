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
</script>

<template>
    <component
        :is="TopAppBar"
        class="appbar"
        :playerInfo="playerInfo"
        v-if="route.path !== '/b50/render'"
    />
    <s-navigation
        v-if="!route.path.startsWith('/b50/') && !route.path.startsWith('/songs/')"
        :value="route.path"
        mode="bottom"
    >
        <s-navigation-item value="/" @click="router.push('/')">
            <mdui-icon name="home" slot="icon"></mdui-icon>
            <div slot="text">{{ $t("navigation.home") }}</div>
        </s-navigation-item>
        <s-navigation-item value="/b50" @click="router.push('/b50')">
            <mdui-icon name="data_thresholding" slot="icon"></mdui-icon>
            <div slot="text">{{ $t("navigation.b50") }}</div>
        </s-navigation-item>
        <s-navigation-item value="/songs" @click="handleSongsNavigation">
            <mdui-icon name="library_music" slot="icon"></mdui-icon>
            <div slot="text">{{ $t("navigation.songs") }}</div>
        </s-navigation-item>
        <s-navigation-item value="/collections" @click="router.push('/collections')">
            <mdui-icon name="collections" slot="icon"></mdui-icon>
            <div slot="text">{{ $t("navigation.collections") }}</div>
        </s-navigation-item>
        <s-navigation-item value="/users" @click="router.push('/users')">
            <mdui-icon name="people" slot="icon"></mdui-icon>
            <div slot="text">{{ $t("navigation.users") }}</div>
        </s-navigation-item>
        <s-navigation-item value="/about" @click="router.push('/about')">
            <mdui-icon name="info" slot="icon"></mdui-icon>
            <div slot="text">{{ $t("navigation.about") }}</div>
        </s-navigation-item>
    </s-navigation>
    <s-navigation
        v-if="!route.path.startsWith('/b50/') && !route.path.startsWith('/songs/')"
        :value="route.path"
        mode="rail"
    >
        <s-navigation-item value="/" @click="router.push('/')">
            <mdui-icon name="home" slot="icon"></mdui-icon>
            <div slot="text">{{ $t("navigation.home") }}</div>
        </s-navigation-item>
        <s-navigation-item value="/b50" @click="router.push('/b50')">
            <mdui-icon name="data_thresholding" slot="icon"></mdui-icon>
            <div slot="text">{{ $t("navigation.b50") }}</div>
        </s-navigation-item>
        <s-navigation-item value="/songs" @click="handleSongsNavigation">
            <mdui-icon name="library_music" slot="icon"></mdui-icon>
            <div slot="text">{{ $t("navigation.songs") }}</div>
        </s-navigation-item>
        <s-navigation-item value="/collections" @click="router.push('/collections')">
            <mdui-icon name="collections" slot="icon"></mdui-icon>
            <div slot="text">{{ $t("navigation.collections") }}</div>
        </s-navigation-item>
        <s-navigation-item value="/users" @click="router.push('/users')">
            <mdui-icon name="people" slot="icon"></mdui-icon>
            <div slot="text">{{ $t("navigation.users") }}</div>
        </s-navigation-item>
        <s-navigation-item value="/about" @click="router.push('/about')">
            <mdui-icon name="info" slot="icon"></mdui-icon>
            <div slot="text">{{ $t("navigation.about") }}</div>
        </s-navigation-item>
    </s-navigation>
    <div class="app-container">
        <router-view v-slot="{ Component }">
            <component :is="Component" :key="route.path" />
        </router-view>
    </div>
</template>

<style scoped>
    .app-container {
        /* padding-left: 16px; */
        padding-top: 80px; /* 64+16 */
        @media (max-width: 1024px) {
            padding-top: 72px; /* 56+16 */
        }
        box-sizing: border-box;
        height: 100%;
        overflow-y: auto;
    }

    .appbar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 10;
    }

    s-navigation {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 114514;
    }
    s-navigation[mode="rail"] {
        display: none;
        top: 64px;
        bottom: 0;
    }

    s-navigation-item {
        overflow: hidden;
    }

    @media (min-aspect-ratio: 1.001/1) {
        s-navigation {
            display: none;
        }
        s-navigation[mode="rail"] {
            display: block !important;
        }
        .app-container {
            margin-left: 64px;
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
