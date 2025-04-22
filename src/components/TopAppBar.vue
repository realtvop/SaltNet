<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
const goToHomepage = () => router.push('/');
const goToSettings = () => router.push('/settings');
</script>

<template>
  <mdui-top-app-bar>
    <mdui-button-icon icon="home--outlined" @click="goToHomepage"></mdui-button-icon>
    <mdui-top-app-bar-title>SaltNet</mdui-top-app-bar-title>
    <mdui-button-icon icon="settings--outlined" @click="goToSettings" style="margin-left: 8px;"></mdui-button-icon>
  </mdui-top-app-bar>
</template>

<style scoped>
</style>
