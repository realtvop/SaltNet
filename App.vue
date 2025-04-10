<script setup lang="ts">
import { ref, computed } from 'vue';
import RatingPlate from "./components/RatingPlate.vue";

// Search input ref
const searchInput = ref('');

// Shared state for player info that can be updated from [username].vue
const playerInfo = useState('playerInfo', () => ({
  name: '',
  data: null
}));

// Compute if player info should be displayed
const showPlayerInfo = computed(() => {
  return !shouldShowHomepage.value && playerInfo.value.name && playerInfo.value.data;
});

// Compute current path to determine which page to display
const currentPath = computed(() => {
  if (typeof window !== 'undefined') {
    return window.location.pathname;
  }
  return '/';
});

// Check if we should show the homepage
const shouldShowHomepage = computed(() => {
  const path = currentPath.value;
  return path === '/' || path === '';
});

// Navigate to another player's page
const navigateToPlayer = () => {
  if (searchInput.value.trim()) {
    window.location.href = `/${encodeURIComponent(searchInput.value.trim())}`;
  }
};

// Navigate to homepage
const goToHomepage = () => {
  window.location.href = '/';
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
        <div v-if="!shouldShowHomepage" class="app-bar-left">
          <button @click="goToHomepage" class="home-button">
            <span class="home-icon">←</span> 首页
          </button>
          
          <div v-if="showPlayerInfo" class="player-info">
            <h2 class="app-title">{{ playerInfo.data.nickname }}</h2>
            <RatingPlate :ra="playerInfo.data.rating" :small="true" />
          </div>
        </div>
        <div v-else class="logo">
          <h2 class="app-title">SaltWeb</h2>
        </div>
        
        <div class="search-container" v-if="!shouldShowHomepage">
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