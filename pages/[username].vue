<script setup lang="ts">
import { ref, watch, onMounted, onActivated, computed } from "vue";
import ScoreSection from "../components/ScoreSection.vue";
import { isFavorite, addFavorite, removeFavorite } from "../utils/userSettings";

const route = useRoute();
const username = ref(route.params.username as string);

// Add error and loading state
const error = ref<string | null>(null);
const isLoading = ref(false);
const playerData = ref(null);
const favorited = ref(false);

// Check if user is favorited
const checkFavoriteStatus = () => {
  favorited.value = isFavorite(username.value);
};

// Toggle favorite status
const toggleFavorite = () => {
  if (favorited.value) {
    removeFavorite(username.value);
  } else {
    addFavorite(username.value);
  }
  favorited.value = !favorited.value;
  // Emit event for favorites page to update
  window.dispatchEvent(new CustomEvent('favorites-changed'));
};

// Create a function to fetch the player data
const fetchPlayerData = async () => {
  // Reset data before fetching
  error.value = null;
  isLoading.value = true;
  playerData.value = null;
  
  // Get current username from route
  username.value = route.params.username as string;
  
  // Check if user is in favorites
  checkFavoriteStatus();
  
  try {
    // Add cache-busting parameter to prevent API caching
    const cacheBuster = Date.now();
    const data = await $fetch(`/api/player/${encodeURIComponent(username.value)}?_=${cacheBuster}`);
    
    // Check if the API returned an error message
    if (typeof data.data === 'string' && data.data === 'user not exists') {
      error.value = 'User does not exist';
      return;
    }
    
    // Update local player data
    playerData.value = data.data;
    
    // Update app level state
    useState("playerInfo").value = {
      name: data.name || username.value,
      data: data.data,
    };
  } catch (e) {
    console.error("Error fetching player data:", e);
    error.value = 'Failed to fetch player data';
  } finally {
    isLoading.value = false;
  }
};

// Watch for route changes
watch(() => route.params.username, async (newUsername) => {
  if (newUsername && newUsername !== username.value) {
    username.value = newUsername as string;
    await fetchPlayerData();
  }
}, { immediate: true });

// Force-fetch data on component lifecycle events
onMounted(fetchPlayerData);
onActivated(fetchPlayerData);

// Use local data ref instead of global state
const fishData = computed(() => playerData.value);
</script>

<template>
  <div class="player-profile">
    <!-- Loading Indicator -->
    <div v-if="isLoading" class="loading-message">
      <div class="loading-spinner"></div>
      <p>加载中，请稍候...</p>
    </div>
    
    <!-- Error Message Display -->
    <div v-else-if="error" class="error-message">
      <h2>{{ error }}</h2>
      <p>请检查用户名是否正确</p>
    </div>

    <div v-else>
      <!-- SD Scores Section -->
      <ScoreSection v-if="fishData?.charts?.sd" title="旧版本成绩" :scores="fishData.charts.sd || []" />

      <!-- DX Scores Section -->
      <ScoreSection v-if="fishData?.charts?.dx" title="新版本成绩" :scores="fishData.charts.dx || []" />
    </div>
  </div>
</template>

<style scoped>
.player-profile {
  width: 100%;
  padding-top: 20px;
}

.user-header {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 30px;
}

.user-name {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.user-name-wrapper {
  display: flex;
  align-items: center;
  gap: 15px;
}

.user-name h1 {
  margin: 0;
  font-size: 2rem;
  color: var(--text-primary-color);
}

.favorite-button {
  background: transparent;
  border: none;
  font-size: 1.8rem;
  padding: 0 5px;
  cursor: pointer;
  transition: transform 0.2s, color 0.2s;
  color: var(--text-secondary-color);
  line-height: 1;
}

.favorite-button:hover {
  transform: scale(1.1);
}

.favorite-button.favorited {
  color: #ffd700; /* Gold color for favorited */
}

.error-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 50px 20px;
  text-align: center;
  color: var(--text-error-color, #ff6b6b);
}

.error-message h2 {
  font-size: 1.8rem;
  margin-bottom: 10px;
}

.error-message p {
  font-size: 1.2rem;
  color: var(--text-secondary-color, #888);
}

.loading-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 50px 20px;
  text-align: center;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 5px solid rgba(100, 108, 255, 0.2);
  border-top-color: #646cff;
  border-radius: 50%;
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .user-name h1 {
    font-size: 1.8rem;
  }
  
  .error-message h2 {
    font-size: 1.5rem;
  }
  
  .error-message p {
    font-size: 1rem;
  }
}
</style>