<script setup lang="ts">
    import { useRouter } from "vue-router";

    const router = useRouter();
    const route = router.currentRoute;
</script>

<template>
    <s-appbar>
        <s-icon-button
            slot="navigation"
            v-if="
                ['/settings'].includes(route.path) ||
                route.path.startsWith('/b50/') ||
                route.path.startsWith('/songs/')
            "
            @click="router.back"
        >
            <s-icon name="arrow_back"></s-icon>
        </s-icon-button>
        <s-icon-button slot="navigation" @click="router.push('/')">
            <s-icon><img src="/favicon.ico" alt="icon" class="favicon-icon favicon" /></s-icon>
        </s-icon-button>

        <div slot="headline">SaltNet</div>

        <s-icon-button
            slot="action"
            v-if="route.path === '/' || route.path === '/index'"
            @click="router.push('/settings')"
        >
            <s-icon><mdui-icon name="settings"></mdui-icon></s-icon>
        </s-icon-button>
    </s-appbar>
</template>

<style scoped></style>
