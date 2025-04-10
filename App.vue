<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import RatingPlate from "./components/RatingPlate.vue";
import ScoreCard from "./components/ScoreCard.vue";

// Create shared state for player data
const playerInfo = useState('playerInfo', () => {
  // Try to get data from multiple sources to ensure it's available
  const event = useRequestEvent();
  
  // Default value
  return { name: 'realtvop', data: null };
});

// Server-side initialization
if (process.server) {
  const event = useRequestEvent();
  if (event?.context?.player) {
    playerInfo.value = event.context.player;
  }
}

// Initialize data using shared state
const fishData = ref(playerInfo.value?.data || null);
const player = ref(playerInfo.value?.name || 'realtvop');

// If we're on client-side and don't have data, try to fetch it
onMounted(async () => {
  if (!fishData.value) {
    try {
      // Get current player name from URL
      const path = window.location.pathname;
      const pathParts = path.split('/').filter(Boolean);
      const playerFromPath = pathParts.length > 0 ? pathParts[pathParts.length - 1] : '';
      const targetPlayer = playerFromPath || 'realtvop';
      
      // Fetch player data from API
      const response = await fetch(`/api/player/${encodeURIComponent(targetPlayer)}`);
      const data = await response.json();
      
      if (data && data.data) {
        fishData.value = data.data;
        player.value = data.name;
        playerInfo.value = { name: data.name, data: data.data };
      }
    } catch (error) {
      console.error('Failed to fetch player data:', error);
    }
  }
});

// Add new ref for search input
const searchInput = ref('');

// Navigate to another player's page
const navigateToPlayer = () => {
  if (searchInput.value.trim()) {
    window.location.href = `/player/${encodeURIComponent(searchInput.value.trim())}`;
  }
};

// Handle enter key press in search input
const handleKeyPress = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    navigateToPlayer();
  }
};

// Calculate statistics for the SD scores based on ra values
const sdStats = computed(() => {
  if (!fishData.value?.charts?.sd?.length) return null;
  
  const scores = fishData.value.charts.sd.map((item: any) => item.ra);
  scores.sort((a: number, b: number) => a - b);
  
  const avg = scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length;
  const median = scores.length % 2 === 0 
    ? (scores[scores.length/2 - 1] + scores[scores.length/2]) / 2 
    : scores[Math.floor(scores.length/2)];
  const range = scores[scores.length - 1] - scores[0];
  
  // Calculate difficulty constant range
  const constants = fishData.value.charts.sd.map((item: any) => item.ds);
  constants.sort((a: number, b: number) => a - b);
  const minConstant = constants[0];
  const maxConstant = constants[constants.length - 1];
  
  return {
    avg: avg.toFixed(2),
    median: median,
    range: range,
    levelRange: `${minConstant.toFixed(1)}~${maxConstant.toFixed(1)}`
  };
});

// Calculate statistics for the DX scores based on ra values
const dxStats = computed(() => {
  if (!fishData.value?.charts?.dx?.length) return null;
  
  const scores = fishData.value.charts.dx.map((item: any) => item.ra);
  scores.sort((a: number, b: number) => a - b);
  
  const avg = scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length;
  const median = scores.length % 2 === 0 
    ? (scores[scores.length/2 - 1] + scores[scores.length/2]) / 2 
    : scores[Math.floor(scores.length/2)];
  const range = scores[scores.length - 1] - scores[0];
  
  // Calculate difficulty constant range
  const constants = fishData.value.charts.dx.map((item: any) => item.ds);
  constants.sort((a: number, b: number) => a - b);
  const minConstant = constants[0];
  const maxConstant = constants[constants.length - 1];
  
  return {
    avg: avg.toFixed(2),
    median: median,
    range: range,
    levelRange: `${minConstant.toFixed(1)}~${maxConstant.toFixed(1)}`
  };
});
</script>

<template>
  <div class="wrapper">
    <!-- Fixed App Bar -->
    <div class="app-bar">
      <div class="app-bar-content">
        <div class="user-info">
          <h2 class="app-bar-player-name">{{ fishData ? fishData.nickname : player }}</h2>
          <RatingPlate :ra="fishData ? fishData.rating : 0" :small="true" />
        </div>
        <div class="search-container">
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
      <!-- Main content starts below the app bar -->
      <div class="content-padding"></div>
      
      <!-- SD Scores Section -->
      <h2 class="section-title">
        旧版本
        <span class="stats-info" v-if="sdStats">
          <span class="stat-item">{{ sdStats.levelRange }}</span>
          <span class="stat-item">平均: {{ sdStats.avg }}</span>
          <span class="stat-item">中位数: {{ sdStats.median }}</span>
          <span class="stat-item">极差: {{ sdStats.range }}</span>
        </span>
      </h2>
      <div class="score-grid-wrapper" v-if="fishData && fishData.charts && fishData.charts.sd">
        <div class="score-grid">
          <div v-for="(score, index) in fishData.charts.sd" :key="`sd-cell-${index}`" class="score-cell">
            <ScoreCard :data="score" />
          </div>
        </div>
      </div>
      
      <!-- DX Scores Section -->
      <h2 class="section-title">
        新版本
        <span class="stats-info" v-if="dxStats">
          <span class="stat-item">{{ dxStats.levelRange }}</span>
          <span class="stat-item">平均: {{ dxStats.avg }}</span>
          <span class="stat-item">中位数: {{ dxStats.median }}</span>
          <span class="stat-item">极差: {{ dxStats.range }}</span>
        </span>
      </h2>
      <div class="score-grid-wrapper" v-if="fishData && fishData.charts && fishData.charts.dx">
        <div class="score-grid">
          <div v-for="(score, index) in fishData.charts.dx" :key="`dx-cell-${index}`" class="score-cell">
            <ScoreCard :data="score" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  overflow-x: hidden;
  color: white;
}
</style>

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

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-bar-player-name {
  margin: 0;
  font-size: 1.3rem;
  white-space: nowrap;
  color: var(--text-primary-color);
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

.score-grid-wrapper {
  width: 100%;
  overflow: visible; /* Ensure content doesn't get clipped */
}

.score-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 15px;
  margin-top: 20px;
  width: 100%;
  justify-content: center;
  box-sizing: border-box; /* Ensure proper width calculation */
}

@media (min-width: 1254px) {
  .score-grid {
    grid-template-columns: repeat(5, 1fr); /* Using 1fr instead of minmax for even distribution */
  }
}

@media (max-width: 1253px) and (min-width: 1000px) {
  .score-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 999px) and (min-width: 768px) {
  .score-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 767px) and (min-width: 500px) {
  .score-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .app-container {
    padding: 0 10px;
  }
  
  .app-bar-content {
    padding: 10px 15px;
  }
}

@media (max-width: 499px) {
  .score-grid {
    grid-template-columns: repeat(1, 1fr);
    gap: 12px; /* Smaller gap for mobile */
  }
  
  .app-container {
    padding: 0 5px;
  }
  
  .app-bar-content {
    padding: 8px 10px;
    flex-direction: column;
    gap: 8px;
  }
  
  .content-padding {
    height: 90px; /* Taller for mobile layout */
  }
}

.score-cell {
  display: flex;
  justify-content: center;
  width: 100%;
  box-sizing: border-box;
  padding: 0;
}

.section-title {
  width: 100%;
  margin-top: 30px;
  margin-bottom: 10px;
  text-align: left;
  font-size: 1.8rem;
  font-weight: bold;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 15px;
  color: var(--text-primary-color, inherit);
}

.stats-info {
  font-size: 0.9rem;
  font-weight: normal;
  color: var(--text-secondary-color, #888);
  display: inline-flex;
  flex-wrap: wrap;
  gap: 10px;
}

.stat-item {
  white-space: nowrap;
}

/* Removed player-name class for the original h1 since it's now in the app bar */

/* Add this to ensure the first title has proper spacing */
.section-title:first-of-type {
  margin-top: 20px;
}

@media (max-width: 768px) {
  .section-title {
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
  }
  
  .stats-info {
    margin-left: 5px;
    font-size: 0.8rem;
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