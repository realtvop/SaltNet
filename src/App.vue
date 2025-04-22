<script setup lang="ts">
import { ref, computed, watch, nextTick, provide } from 'vue';
import RatingPlate from "./components/RatingPlate.vue";
import { useRouter, useRoute } from 'vue-router';
// Import getSetting and SETTINGS
import { isFavorite, addFavorite, removeFavorite, getSetting, SETTINGS } from './utils/userSettings';

// Search input ref
const searchInput = ref('');
const router = useRouter();
const route = useRoute(); // Use Vue Router's useRoute

// Shared state for player info - replaced useState with ref
const playerInfo = ref({
  name: '',
  data: null as any // Use 'any' or define a proper type
});

// Previous route tracking
const previousPath = ref('');

// Compute if player info should be displayed
const showPlayerInfo = computed(() => {
  // Only show on username routes (not homepage, settings, or /SaltNet/*)
  const path = currentPath.value;
  const isHomepage = path === '/' || path === '';
  // Assuming '/settings' and '/SaltNet/favorites' are top-level routes now
  const isSettings = path === '/settings';
  const isFavorites = path === '/favorites'; // Example, adjust based on actual routes

  return !isHomepage && !isSettings && !isFavorites && route.params.username; // Check for username param
});

// Get username from URL path for initial display
const usernameFromURL = computed(() => {
  // Use route.params.username which is standard in Vue Router for dynamic segments
  return route.params.username as string || '';
});

// Get logged-in username from settings
const loggedInUsername = computed(() => getSetting<string>(SETTINGS.USERNAME));

// Check if player data has fully loaded
const playerDataLoaded = computed(() => {
  return playerInfo.value.name && playerInfo.value.data;
});

// Compute current path to determine which page to display
const currentPath = computed(() => {
  return route.path;
});

// Check if we should show the homepage
const shouldShowHomepage = computed(() => {
  return currentPath.value === '/';
});

// Determine if we're on a settings page
const isSettingsPage = computed(() => {
  return currentPath.value === '/settings';
});

// Determine if we should show the search box (on homepage or user detail pages)
const shouldShowSearchBox = computed(() => {
  return !isSettingsPage.value; // Show search on all pages except settings
});

// Function to update page title
const updatePageTitle = () => {
  let title = 'SaltNet'; // Default title
  if (shouldShowHomepage.value) {
    title = 'SaltNet';
  } else if (playerDataLoaded.value && playerInfo.value.data?.nickname) {
    title = `${playerInfo.value.data.nickname} - SaltNet`;
  } else if (usernameFromURL.value) {
    // Use username from route params if data not loaded
    title = `${usernameFromURL.value} - SaltNet`;
  } else if (isSettingsPage.value) {
    title = 'Settings - SaltNet'; // Example title for settings
  }

  document.title = title;
};

// Watch route changes to reset playerInfo or update title
watch(
  () => route.path,
  (newPath, oldPath) => {
    previousPath.value = oldPath;

    // Update page title whenever the route changes
    updatePageTitle();

    // Reset player info when navigating between different user pages
    if (newPath !== oldPath && route.params.username && oldPath !== '/' && !oldPath.startsWith('/settings')) {
      playerInfo.value = { name: '', data: null };
    }
  },
  { immediate: true } // Update title immediately on load
);

// Watch player data to update title when nickname becomes available
watch(
  () => playerInfo.value.data?.nickname,
  (newNickname) => {
    if (newNickname) {
      updatePageTitle();
    }
  }
);

// Set initial favicon (title is handled by watch)
const setFavicon = () => {
  let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = '/favicon.ico'; // Assuming favicon is in public folder
  link.type = 'image/x-icon';
};

setFavicon(); // Set favicon on component mount

// Navigate to another player's page - updated to use router
const navigateToPlayer = () => {
  if (searchInput.value.trim()) {
    router.push(`/user/${encodeURIComponent(searchInput.value.trim())}`); // Assuming '/user/:username' route
  }
};

// Navigate to homepage - updated to use router
const goToHomepage = () => {
  router.push('/');
};

// Navigate to settings page - updated to use router
const goToSettings = () => {
  router.push('/settings');
};

// Handle enter key press in search input
const handleKeyPress = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    navigateToPlayer();
  }
};

// Add favorite functionality
const favorited = ref(false);

// Check favorite status when route or player info changes
watch(
  [() => route.params.username, () => playerInfo.value.name],
  () => {
    const currentUsername = route.params.username as string;
    if (showPlayerInfo.value && currentUsername) {
      favorited.value = isFavorite(currentUsername);
    } else {
      favorited.value = false; // Reset if not on a user page or no username
    }
  },
  { immediate: true }
);

// Toggle favorite status
const toggleFavorite = () => {
  const username = usernameFromURL.value;
  // Prevent adding self to favorites (double check)
  if (!username || username === loggedInUsername.value) return;

  // Prevent adding favorites for users that don't exist
  if (!favorited.value && !playerDataLoaded.value) {
    // User doesn't exist or data isn't loaded yet
    return;
  }

  if (favorited.value) {
    removeFavorite(username);
  } else {
    addFavorite(username);
  }
  favorited.value = !favorited.value;
};

// Provide playerInfo for child components to potentially update
provide('playerInfo', playerInfo);

</script>

<template>
  <div class="wrapper">
    <!-- Fixed App Bar -->
    <div class="app-bar">
      <div class="app-bar-content">
        <div class="app-bar-left">
          <!-- App icon using existing favicon -->
          <div class="app-icon" @click="goToHomepage">
            <img src="/favicon.ico" class="favicon-icon" />
          </div>
          
          <button v-if="!shouldShowHomepage" @click="goToHomepage" class="home-button">
            <span class="home-icon">←</span> 首页
          </button>
          
          <div v-if="showPlayerInfo" class="player-info">
            <h2 class="app-title">
              {{ playerDataLoaded ? playerInfo.data.nickname : usernameFromURL }}
            </h2>
            <div class="player-stats">
              <RatingPlate v-if="playerDataLoaded" :ra="playerInfo.data.rating" :small="true" />
              <!-- Add favorite button - hide if it's the logged-in user's profile -->
              <button 
                v-if="usernameFromURL && usernameFromURL !== loggedInUsername"
                @click="toggleFavorite" 
                class="favorite-button" 
                :class="{ 'favorited': favorited, 'disabled': !playerDataLoaded && !favorited }"
                :title="favorited ? '取消收藏' : (playerDataLoaded ? '添加收藏' : '无法收藏不存在的用户')"
                :disabled="!playerDataLoaded && !favorited"
              >
                {{ favorited ? '★' : '☆' }}
              </button>
            </div>
          </div>
          
          <h2 v-if="shouldShowHomepage" class="app-title">SaltNet</h2>
        </div>
        
        <div class="search-container" v-if="shouldShowSearchBox">
          <input 
            v-model="searchInput" 
            @keyup="handleKeyPress"
            placeholder="搜索用户..." 
            class="search-input"
          />
          <button @click="navigateToPlayer" class="search-button">跳转</button>
        </div>
      </div>
    </div>
    
    <div class="app-container">
      <div class="content-padding"></div>
      <!-- Use router-view instead of NuxtPage -->
      <router-view v-slot="{ Component }">
        <component :is="Component" :key="route.path" />
      </router-view>
    </div>
  </div>
</template>

<style scoped>
.wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow-x: hidden;
  box-sizing: border-box;
}

/* App Bar Styles */
.app-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  width: 100%;
  background-color: var(--app-bar-bg);
  backdrop-filter: blur(10px);
  z-index: 1000;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

.app-bar-content {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.app-bar-left {
  display: flex;
  align-items: center;
  gap: 15px;
}

.app-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.app-icon:hover {
  /* transform: scale(1.1); */ /* Removed this line */
}

.favicon-icon {
  width: 24px;
  height: 24px;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 10px;
  /* border-left: 1px solid var(--border-color); */
}

.player-stats {
  display: flex;
  align-items: center;
  gap: 10px;
}

.favorite-button {
  background: transparent;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  padding: 0 5px;
  margin-left: 10px;
  cursor: pointer;
  transition: transform 0.2s, color 0.2s;
  color: var(--text-secondary-color);
  outline: none !important; /* Remove outline */
}

.favorite-button:hover {
  transform: scale(1.1);
  border-color: transparent;
  outline: none !important; /* Ensure no outline on hover */
}

.favorite-button:focus {
  outline: none !important; /* Remove outline when focused */
  box-shadow: none !important; /* Remove any focus shadow */
}

.favorite-button.favorited {
  color: #ffd700; /* Gold color for favorited */
}

.favorite-button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.player-name {
  font-weight: 600;
  color: var(--text-primary-color);
}

.player-rating {
  font-weight: 500;
  color: #646cff;
  background-color: rgba(100, 108, 255, 0.1);
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 0.9em;
}

.search-container {
  display: flex;
  align-items: center;
}

.search-input {
  padding: 8px 12px;
  border-radius: 4px 0 0 4px;
  border: 1px solid var(--border-color);
  background-color: var(--input-bg-color);
  color: var(--text-primary-color);
  font-size: 14px;
  outline: none;
}

.search-button {
  padding: 8px 12px;
  border-radius: 0 4px 4px 0;
  background-color: #535bf2;
  color: white;
  border: none;
  cursor: pointer;
}

.search-button:hover {
  background-color: #646cff;
}

.settings-button {
  padding: 8px 12px;
  border-radius: 4px;
  background-color: #535bf2;
  color: white;
  border: none;
  cursor: pointer;
}

.settings-button:hover {
  background-color: #646cff;
}

.content-padding {
  height: 60px; /* Match the height of the app bar */
}

.app-container {
  width: 100%;
  max-width: 1280px; /* Set a maximum width to create space on larger screens */
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box; /* Ensure padding is included in width calculation */
}

/* For very large screens, add even more side margins */
@media (min-width: 1600px) {
  .app-container {
    max-width: 1400px;
  }
}

/* For extremely large screens */
@media (min-width: 2000px) {
  .app-container {
    max-width: 1600px;
  }
}

.app-title {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary-color);
  font-weight: bold;
}

.logo {
  display: flex;
  align-items: center;
}

.home-button {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  font-size: 0.9rem;
  background-color: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-primary-color);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.home-button:hover {
  background-color: rgba(100, 108, 255, 0.1);
  border-color: #646cff;
}

.home-icon {
  font-size: 1.1rem;
  margin-right: 4px;
}

@media (max-width: 499px) {
  .app-bar-content {
    padding: 8px 10px;
    flex-direction: column;
    gap: 8px;
  }
  
  .content-padding {
    height: 90px; /* Taller for mobile layout */
  }
}
</style>

<style>
:root {
  font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;

  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;
  
  /* Add CSS variables for text colors */
  --text-primary-color: rgba(255, 255, 255, 0.87);
  --text-secondary-color: #aaa;
  --border-color: #444;
  --input-bg-color: rgba(255, 255, 255, 0.1);
  --app-bar-bg: rgba(36, 36, 36, 0.95);

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  font-weight: 500;
  color: #646cff;
  text-decoration: inherit;
}
a:hover {
  color: #535bf2;
}

body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
  width: 100%;
}

h1 {
  font-size: 3.2em;
  line-height: 1.1;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #1a1a1a;
  cursor: pointer;
  transition: border-color 0.25s;
}
button:hover {
  border-color: #646cff;
}
button:focus,
button:focus-visible {
  outline: 4px auto -webkit-focus-ring-color;
}

.card {
  padding: 2em;
}

/* Ensure body and html take full height/width */
html, body {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  overflow-x: hidden; /* Prevent horizontal scrolling */
}

/* Ensure the root element for Vue app takes full space */
#app {
  width: 100%;
  min-height: 100vh;
  display: flex; /* Optional: if needed for layout */
  flex-direction: column; /* Optional: if needed for layout */
}

@media (prefers-color-scheme: light) {
  :root {
    color: #213547;
    background-color: #ffffff;
    /* Update CSS variables for light mode */
    --text-primary-color: #213547;
    --text-secondary-color: #666;
    --border-color: #ddd;
    --input-bg-color: rgba(0, 0, 0, 0.05);
    --app-bar-bg: rgba(255, 255, 255, 0.95);
  }
  
  .app-bar {
    background-color: var(--app-bar-bg);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  }
  
  a:hover {
    color: #747bff;
  }
  button {
    background-color: #f9f9f9;
  }
  
  .search-button {
    background-color: #535bf2;
    color: white;
  }
}
</style>