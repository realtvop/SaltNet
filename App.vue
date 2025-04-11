<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import RatingPlate from "./components/RatingPlate.vue";
import { useRouter, useRoute } from 'vue-router';

// Search input ref
const searchInput = ref('');
const router = useRouter();

// Shared state for player info that can be updated from [username].vue
const playerInfo = useState('playerInfo', () => ({
  name: '',
  data: null
}));

// Previous route tracking for detecting navigation from settings to home
const previousPath = ref('');

// Current path ref (updated to use Nuxt's useRoute)
const route = useRoute();

// Compute if player info should be displayed
const showPlayerInfo = computed(() => {
  // Only show on username routes (not homepage or settings)
  return !shouldShowHomepage.value && !isSettingsPage.value;
});

// Get username from URL path for initial display
const usernameFromURL = computed(() => {
  if (!shouldShowHomepage.value && !isSettingsPage.value) {
    return route.path.substring(1); // Remove leading slash
  }
  return '';
});

// Check if player data has fully loaded
const playerDataLoaded = computed(() => {
  return playerInfo.value.name && playerInfo.value.data;
});

// Watch route changes to reset playerInfo when navigating to a new user page
// or refresh home page when coming from settings
watch(
  () => route.path,
  (newPath, oldPath) => {
    // Store previous path
    previousPath.value = oldPath;
    
    // If changing to a different user page or from a non-user page to a user page
    if (newPath !== oldPath && !shouldShowHomepage.value && !isSettingsPage.value) {
      // Reset player info to clear playerDataLoaded
      playerInfo.value = {
        name: '',
        data: null
      };
    }
    
    // If navigating from settings to home page, emit a refresh event
    if (newPath === '/' && oldPath === '/settings') {
      // Use nextTick to ensure the route change is complete
      nextTick(() => {
        // Emit a custom event to notify components to refresh data
        window.dispatchEvent(new CustomEvent('settings-changed'));
      });
    }
  }
);

// Compute current path to determine which page to display
const currentPath = computed(() => {
  return route.path;
});

// Check if we should show the homepage
const shouldShowHomepage = computed(() => {
  const path = currentPath.value;
  return path === '/' || path === '';
});

// Determine if we're on a settings page
const isSettingsPage = computed(() => {
  const path = currentPath.value;
  return path === '/settings';
});

// Determine if we should show the search box (on homepage or user detail pages)
const shouldShowSearchBox = computed(() => {
  return !isSettingsPage.value; // Show search on all pages except settings
});

// Compute page title based on current page and player data
const pageTitle = computed(() => {
  if (shouldShowHomepage.value) {
    return 'SaltNet';
  } else if (playerDataLoaded.value && playerInfo.value.data?.nickname) {
    return `${playerInfo.value.data.nickname} - SaltNet`;
  } else {
    // Extract username from path when player data isn't loaded yet
    const username = route.path.substring(1);
    return username ? `${username} - SaltNet` : 'SaltNet';
  }
});

// Set page title and favicon
useHead({
  title: pageTitle,
  link: [
    {
      rel: 'icon',
      type: 'image/ico',
      href: '/favicon.ico'
    },
  ]
});

// Navigate to another player's page - updated to use router
const navigateToPlayer = () => {
  if (searchInput.value.trim()) {
    router.push(`/${encodeURIComponent(searchInput.value.trim())}`);
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
            <RatingPlate v-if="playerDataLoaded" :ra="playerInfo.data.rating" :small="true" />
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
      <!-- NuxtPage will automatically render the matching page component -->
      <NuxtPage />
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
  transform: scale(1.1);
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

/* Add a fix for nuxt rendering container width */
#__nuxt {
  max-width: 100%;
  width: 100%;
  margin: 0 auto;
  padding: 0;
  text-align: center;
  box-sizing: border-box;
  overflow-x: hidden; /* Prevent horizontal scrolling */
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