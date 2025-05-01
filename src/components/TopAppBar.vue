<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ref, computed } from 'vue';

const props = defineProps({
  playerInfo: {
    type: Object,
    required: false,
    default: undefined
  }
});

const router = useRouter();
const route = router.currentRoute;

const searchInput = ref('');

const goToHomepage = () => router.push('/');

// 判断当前是否在首页
const shouldShowHomepage = computed(() => route.value.path === '/' || route.value.path === '/index');

// 获取当前页面用户名
const usernameFromURL = computed(() => {
  if (route.value.params.username) return route.value.params.username as string;
  return '';
});

// 登录用户名
const loggedInUsername = computed(() => ''); // TODO

// 玩家数据加载状态
const playerDataLoaded = computed(() => props.playerInfo && props.playerInfo.data);

// 收藏状态
const favorited = ref(false);

const handleKeyPress = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    navigateToPlayer();
  }
};

const navigateToPlayer = () => {
  const name = searchInput.value.trim();
  if (name) {
    router.push(`/${encodeURIComponent(name)}`);
    searchInput.value = '';
  }
};

defineExpose({
  goToHomepage,
  shouldShowHomepage,
  playerDataLoaded,
  playerInfo: props.playerInfo,
  usernameFromURL,
  loggedInUsername,
  favorited,
  searchInput,
  handleKeyPress,
  navigateToPlayer
});
</script>

<template>
  <mdui-top-app-bar class="custom-app-bar" scroll-behavior="elevate">
    <mdui-button-icon icon="arrow_back" variant="text" v-if="['/settings'].includes(route.path) || route.path.startsWith('/b50/')" class="icon-btn" @click="router.back" style="aspect-ratio: 1;">
    </mdui-button-icon>
    <mdui-button variant="text" class="icon-btn" @click="goToHomepage" style="aspect-ratio: 1;">
        <img src="/favicon.ico" alt="icon" class="favicon-icon" />
    </mdui-button>
    <mdui-top-app-bar-title>SaltNet</mdui-top-app-bar-title>
    <template v-if="shouldShowHomepage">
      <mdui-button-icon icon="settings" @click="router.push('/settings')"></mdui-button-icon>
    </template>
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
.app-title {
  font-weight: bold;
  font-size: 1.1rem;
  margin: 0 12px 0 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 56px;
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
