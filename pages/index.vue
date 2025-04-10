<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getSetting, SETTINGS } from "../utils/userSettings";
import RatingPlate from "../components/RatingPlate.vue";

const username = ref("");
const isLoggedIn = ref(false);
const playerData = ref<any>(null);
const isLoading = ref(false);

// Navigate to current user's b50
const viewMyB50 = () => {
  if (username.value) {
    window.location.href = `/${encodeURIComponent(username.value)}`;
  }
};

// Add navigation function for settings
const goToSettings = () => {
  window.location.href = "/settings";
};

// Fetch player data to get the rating
const fetchPlayerData = async (player: string) => {
  isLoading.value = true;
  try {
    const response = await fetch(`/api/player/${encodeURIComponent(player)}`);
    if (response.ok) {
      playerData.value = await response.json();
    }
  } catch (error) {
    console.error("Error fetching player data:", error);
  } finally {
    isLoading.value = false;
  }
};

// Check if user is logged in and get username from settings
onMounted(async () => {
  // Get username from userSettings utility
  const savedUsername = getSetting<string>(SETTINGS.USERNAME);
  if (savedUsername) {
    username.value = savedUsername;
    isLoggedIn.value = true;
    // Fetch player data to get the rating
    await fetchPlayerData(savedUsername);
  }
});
</script>

<template>
  <div class="homepage-container">
    <!-- Welcome section without background -->
    <div class="user-welcome-section">
      <h2 class="welcome-text">欢迎，{{ isLoggedIn ? username : "wmc" }}</h2>

      <!-- Display larger DX Rating when user is logged in and data is available -->
      <div
        v-if="isLoggedIn && playerData && playerData.data"
        class="rating-container"
      >
        <RatingPlate
          :ra="playerData.data.rating"
          :small="false"
          class="large-rating"
        />
      </div>
      <div v-else-if="isLoggedIn && isLoading" class="loading-text">
        加载中...
      </div>
      <div v-else class="loading-text">
        <span>请在设置中设置水鱼账号名</span>
      </div>

      <div class="user-action-buttons">
        <button
          v-if="isLoggedIn"
          @click="viewMyB50"
          class="action-button b50-button"
        >
          <span class="button-icon">📊</span> 我的 B50
        </button>
        <button @click="goToSettings" class="action-button settings-button">
          <span class="button-icon">⚙️</span> 设置
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.homepage-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 80vh;
  width: 100%;
  padding: 0 20px;
}

/* User welcome section styles - removed background */
.user-welcome-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 20px 0;
  padding: 30px;
  width: 100%;
  max-width: 600px;
}

.welcome-text {
  font-size: 2rem;
  margin-bottom: 15px;
  color: var(--text-primary-color);
}

/* Custom large rating style for homepage only */
.rating-container {
  display: flex;
  justify-content: center;
  margin-bottom: 25px;
}

.large-rating {
  transform: scale(1.5);
}

.loading-text {
  color: var(--text-secondary-color);
  margin-bottom: 25px;
  font-size: 1.1rem;
}

.user-action-buttons {
  display: flex;
  justify-content: center;
  gap: 20px;
  width: 100%;
  flex-wrap: wrap;
}

.action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px 25px;
  font-size: 1.2rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.b50-button {
  background-color: #535bf2;
  color: white;
  border: none;
}

.b50-button:hover {
  background-color: #646cff;
  transform: translateY(-2px);
}

.settings-button {
  background-color: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-primary-color);
}

.settings-button:hover {
  background-color: rgba(100, 108, 255, 0.1);
  border-color: #646cff;
  transform: translateY(-2px);
}

.button-icon {
  font-size: 1.3rem;
}
</style>