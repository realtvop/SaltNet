<script setup lang="ts">
import { ref, computed, watch, provide } from 'vue';
import RatingPlate from "./components/RatingPlate.vue"; // Keep RatingPlate for now
import { useRouter, useRoute } from 'vue-router';
import { isFavorite, addFavorite, removeFavorite, getSetting, SETTINGS } from './utils/userSettings';
import '@mdui/icons/home--outlined';
import '@mdui/icons/arrow-back--outlined';
import '@mdui/icons/star-border--outlined';
import '@mdui/icons/star--outlined';
import '@mdui/icons/search--outlined';
import '@mdui/icons/settings--outlined';

const searchInput = ref('');
const router = useRouter();
const route = useRoute();

const playerInfo = ref({
  name: '',
  data: null as any
});

const previousPath = ref('');

const currentPath = computed(() => route.path);
const usernameFromURL = computed(() => route.params.username as string || '');
const loggedInUsername = computed(() => getSetting<string>(SETTINGS.USERNAME));
const playerDataLoaded = computed(() => playerInfo.value.name && playerInfo.value.data);

const showPlayerInfo = computed(() => {
  const path = currentPath.value;
  const isHomepage = path === '/' || path === '';
  const isSettings = path === '/settings';
  const isFavorites = path === '/favorites';
  return !isHomepage && !isSettings && !isFavorites && route.params.username;
});

const shouldShowHomepage = computed(() => currentPath.value === '/');
const isSettingsPage = computed(() => currentPath.value === '/settings');
const shouldShowSearchBox = computed(() => !isSettingsPage.value); // Hide on settings page

const updatePageTitle = () => {
  let title = 'SaltNet';
  if (shouldShowHomepage.value) {
    title = 'SaltNet';
  } else if (playerDataLoaded.value && playerInfo.value.data?.nickname) {
    title = `${playerInfo.value.data.nickname} - SaltNet`;
  } else if (usernameFromURL.value) {
    title = `${usernameFromURL.value} - SaltNet`;
  } else if (isSettingsPage.value) {
    title = 'Settings - SaltNet';
  }
  document.title = title;
};

watch(() => route.path, (newPath: string, oldPath: string) => {
  previousPath.value = oldPath;
  updatePageTitle();
  if (newPath !== oldPath && route.params.username && oldPath !== '/' && !oldPath.startsWith('/settings')) {
    playerInfo.value = { name: '', data: null };
  }
}, { immediate: true });

watch(() => playerInfo.value.data?.nickname, (newNickname: string | undefined) => {
  if (newNickname) {
    updatePageTitle();
  }
});

const navigateToPlayer = () => {
  if (searchInput.value.trim()) {
    router.push(`/user/${encodeURIComponent(searchInput.value.trim())}`);
    searchInput.value = ''; // Clear search input after navigation
  }
};

const goToHomepage = () => router.push('/');
const goToSettings = () => router.push('/settings'); // Navigate to settings

const handleKeyPress = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    navigateToPlayer();
  }
};

const favorited = ref(false);

watch([() => route.params.username, () => playerInfo.value.name], () => {
  const currentUsername = route.params.username as string;
  if (showPlayerInfo.value && currentUsername) {
    favorited.value = isFavorite(currentUsername);
  } else {
    favorited.value = false;
  }
}, { immediate: true });

const toggleFavorite = () => {
  const username = usernameFromURL.value;
  if (!username || username === loggedInUsername.value) return;
  if (!favorited.value && !playerDataLoaded.value) return;

  if (favorited.value) {
    removeFavorite(username);
  } else {
    addFavorite(username);
  }
  favorited.value = !favorited.value;
};

provide('playerInfo', playerInfo);

</script>

<template>
  <mdui-layout>
    <mdui-top-app-bar scroll-behavior="shrink" scroll-target=".app-container">
      <!-- Back/Home Button -->
      <template #navigation-icon>
        <mdui-button-icon
          v-if="!shouldShowHomepage"
          icon="arrow_back--outlined"
          @click="goToHomepage"
        ></mdui-button-icon>
        <mdui-button-icon
          v-else
          icon="home--outlined"
          @click="goToHomepage"
        ></mdui-button-icon>
      </template>

      <!-- Title -->
      <mdui-top-app-bar-title>
        <template #headline>
          <div v-if="showPlayerInfo" class="player-info-bar">
            <span>{{ playerDataLoaded ? playerInfo.data.nickname : usernameFromURL }}</span>
            <RatingPlate v-if="playerDataLoaded" :ra="playerInfo.data.rating" :small="true" class="player-rating-chip" />
            <mdui-tooltip
               v-if="usernameFromURL && usernameFromURL !== loggedInUsername"
              :content="favorited ? '取消收藏' : (playerDataLoaded ? '添加收藏' : '无法收藏不存在的用户')"
              placement="bottom"
            >
              <mdui-button-icon
                :icon="favorited ? 'star--outlined' : 'star_border--outlined'"
                :color="favorited ? 'warning' : ''"
                @click="toggleFavorite"
                :disabled="!playerDataLoaded && !favorited"
                class="favorite-icon-button"
              ></mdui-button-icon>
            </mdui-tooltip>
          </div>
          <span v-else-if="shouldShowHomepage">SaltNet</span>
          <span v-else-if="isSettingsPage">Settings</span>
        </template>
      </mdui-top-app-bar-title>

      <!-- Search Field and Buttons -->
      <template #action-items>
        <div v-if="shouldShowSearchBox" class="search-actions">
           <mdui-text-field
              variant="outlined"
              placeholder="搜索用户..."
              v-model="searchInput"
              @keydown="handleKeyPress"
              class="search-field"
              clearable
            >
              <template #suffix-icon>
                 <mdui-button-icon icon="search--outlined" @click="navigateToPlayer"></mdui-button-icon>
              </template>
            </mdui-text-field>
        </div>
         <!-- Settings Button -->
         <mdui-button-icon
            v-if="!isSettingsPage"
            icon="settings--outlined"
            @click="goToSettings"
            style="margin-left: 8px;"
          ></mdui-button-icon>
      </template>

    </mdui-top-app-bar>

    <mdui-layout-main class="app-container">
      <!-- Router View -->
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
  /* Removed fixed height and overflow-y */
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
  /* Removed height adjustment for .app-container */
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