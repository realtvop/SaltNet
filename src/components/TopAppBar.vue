<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ref, computed, watchEffect } from 'vue';
import RatingPlate from './RatingPlate.vue';

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

watchEffect(() => {
  favorited.value = !!(usernameFromURL.value && isFavorite(usernameFromURL.value));
});

const toggleFavorite = () => {
  if (!usernameFromURL.value) return;
  if (favorited.value) {
    removeFavorite(usernameFromURL.value);
  } else if (playerDataLoaded.value) {
    addFavorite(usernameFromURL.value);
  }
  // 通知收藏变更
  window.dispatchEvent(new Event('favorites-changed'));
  // 强制刷新收藏状态
  favorited.value = !!(usernameFromURL.value && isFavorite(usernameFromURL.value));
};

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
  toggleFavorite,
  searchInput,
  handleKeyPress,
  navigateToPlayer
});
</script>

<template>
  <mdui-top-app-bar class="custom-app-bar" scroll-behavior="elevate">
    <mdui-tooltip content="首页">
        <mdui-button variant="text" class="icon-btn" @click="goToHomepage" style="aspect-ratio: 1;">
            <img src="/favicon.ico" alt="icon" class="favicon-icon" />
        </mdui-button>
    </mdui-tooltip>
    <mdui-top-app-bar-title>SaltNet</mdui-top-app-bar-title>
    <template v-if="!shouldShowHomepage">
      <mdui-top-app-bar-title class="player-title">
        {{ playerDataLoaded ? playerInfo.data.nickname : usernameFromURL }}
      </mdui-top-app-bar-title>
      <RatingPlate v-if="playerDataLoaded" :ra="playerInfo.data.rating" :small="true" />

      <!-- <mdui-button
        v-if="usernameFromURL && usernameFromURL !== loggedInUsername"
        variant="text"
        class="icon-btn"
        :disabled="!playerDataLoaded && !favorited"
        @click="toggleFavorite"
        :title="favorited ? '取消收藏' : (playerDataLoaded ? '添加收藏' : '无法收藏不存在的用户')"
      >
        <mdui-icon :name="favorited ? 'star' : 'star_outline'" style="color: gold;" />
      </mdui-button> -->
      <mdui-button-icon
        v-if="usernameFromURL && usernameFromURL !== loggedInUsername && playerDataLoaded"
        selectable
        icon="star_outline" selected-icon="star"
        style="margin-left: 10px;"
        :selected="favorited"
        @click="toggleFavorite"
        ></mdui-button-icon>
    </template>
    <div v-if="false" class="search-box search-box-right">
      <mdui-text-field
        v-model="searchInput"
        @keyup="handleKeyPress"
        placeholder="搜索用户..."
        variant="outlined"
        class="search-input"
      >
        <mdui-button variant="tonal" class="search-btn" @click="navigateToPlayer" slot="end-icon">跳转</mdui-button>
      </mdui-text-field>
    </div>
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
