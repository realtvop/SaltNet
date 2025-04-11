<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { getSetting, SETTINGS } from "../utils/userSettings";
import RatingPlate from "../components/RatingPlate.vue";
import { useRouter } from "vue-router";

const username = ref("");
const isLoggedIn = ref(false);
const playerData = ref<any>(null);
const isLoading = ref(false);
const error = ref<string | null>(null); // Add error state
const router = useRouter();

// Navigate to current user's b50
const viewMyB50 = () => {
  if (username.value) {
    router.push(`/${encodeURIComponent(username.value)}`);
  }
};

// Add navigation function for settings
const goToSettings = () => {
  router.push("/SaltNet/settings");
};

// Fetch player data to get the rating
const fetchPlayerData = async (player: string) => {
  isLoading.value = true;
  error.value = null; // Reset error state
  try {
    const response = await fetch(`/api/player/${encodeURIComponent(player)}`);
    if (response.ok) {
      const data = await response.json();
      
      // Check if the API returned an error message
      if (data.error || (typeof data.data === 'string' && data.data === 'user not exists')) {
        error.value = '用户不存在';
        playerData.value = null;
        return;
      }
      
      playerData.value = data;
    } else {
      error.value = '数据获取失败';
    }
  } catch (error) {
    console.error("Error fetching player data:", error);
    error.value = '数据获取失败';
  } finally {
    isLoading.value = false;
  }
};

// Handler for settings-changed event
const handleSettingsChanged = () => {
  // Get updated username from userSettings
  const savedUsername = getSetting<string>(SETTINGS.USERNAME);
  
  // Check if username changed
  if (savedUsername !== username.value) {
    username.value = savedUsername || "";
    isLoggedIn.value = !!savedUsername;
    
    if (savedUsername) {
      // Re-fetch player data with new username
      fetchPlayerData(savedUsername);
    } else {
      // Clear player data if username was removed
      playerData.value = null;
    }
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
  
  // Add event listener for settings changes
  window.addEventListener('settings-changed', handleSettingsChanged);
});

// Clean up event listener
onUnmounted(() => {
  window.removeEventListener('settings-changed', handleSettingsChanged);
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
      <div v-else-if="isLoggedIn && error" class="error-text">
        {{ error }}
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
        
        <!-- Add new favorites button -->
        <button
          @click="router.push('/SaltNet/favorites')"
          class="action-button favorites-button"
        >
          <span class="button-icon">★</span> 收藏用户
        </button>
        
        <button @click="goToSettings" class="action-button settings-button">
          <span class="button-icon">⚙️</span> 设置
        </button>
      </div>
    </div>
    
    <!-- GitHub link footer -->
    <div class="github-footer">
      <a href="https://github.com/realtvop/SaltNet" target="_blank" rel="noopener noreferrer" class="github-pill">
        <span class="github-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
            <path fill="currentColor" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"></path>
          </svg>
        </span>
        <span class="github-text">realtvop/SaltNet</span>
      </a>
    </div>
  </div>
</template>

<style scoped>
.homepage-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  width: 100%;
  padding: 0 20px 0;
  margin-top: -60px; /* Shift content upward */
  position: relative;
}

.user-welcome-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30px;
  width: 100%;
  max-width: 600px;
  margin-top: 0; /* Removed the top margin */
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

.error-text {
  color: red;
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

.favorites-button {
  background-color: #ffd700;
  color: #000;
}

.favorites-button:hover {
  background-color: #ffeb3b;
}

.button-icon {
  font-size: 1.3rem;
}

/* GitHub footer styles */
.github-footer {
  position: fixed;
  bottom: 20px;
  left: 0;
  width: 100%;
  text-align: center;
  padding: 10px;
  z-index: 10;
}

@media (max-height: 600px) {
  .github-footer {
    position: relative;
    bottom: auto;
    left: auto;
    margin-top: 30px;
  }
}

.github-pill {
  display: inline-flex;
  align-items: center;
  background-color: var(--background-secondary);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 8px 16px;
  font-size: 0.9rem;
  color: var(--text-secondary-color);
  text-decoration: none;
  transition: all 0.2s ease;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}

.github-pill:hover {
  background-color: var(--background-tertiary);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.github-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
  color: var(--text-secondary-color);
}

.github-text {
  font-weight: 500;
}
</style>