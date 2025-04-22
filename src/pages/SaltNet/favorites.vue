<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { getFavorites } from '../../utils/userSettings';
import RatingPlate from "../../components/RatingPlate.vue";

const router = useRouter();
const favorites = ref<string[]>([]);
const playerDataList = ref<any[]>([]);
const isLoading = ref(false);

// Fetch favorites list
const loadFavorites = () => {
  favorites.value = getFavorites();
  if (favorites.value.length > 0) {
    fetchPlayerDataList();
  }
};

// Fetch player data for all favorites
const fetchPlayerDataList = async () => {
  isLoading.value = true;
  playerDataList.value = [];
  
  try {
    // Fetch data for each favorite player
    const promises = favorites.value.map(async (username) => {
      try {
        const cacheBuster = Date.now();
        const response = await $fetch(`/api/player/${encodeURIComponent(username)}?_=${cacheBuster}`);
        return {
          username,
          data: response.data,
          error: null
        };
      } catch (error) {
        console.error(`Error fetching data for ${username}:`, error);
        return {
          username,
          data: null,
          error: 'Failed to load data'
        };
      }
    });
    
    playerDataList.value = await Promise.all(promises);
  } catch (error) {
    console.error("Error fetching favorite player data:", error);
  } finally {
    isLoading.value = false;
  }
};

// Navigate to a player's details page
const viewPlayer = (username: string) => {
  router.push(`/${encodeURIComponent(username)}`);
};

// Handle favorites change event
const handleFavoritesChanged = () => {
  loadFavorites();
};

onMounted(() => {
  loadFavorites();
  window.addEventListener('favorites-changed', handleFavoritesChanged);
});

onUnmounted(() => {
  window.removeEventListener('favorites-changed', handleFavoritesChanged);
});
</script>

<template>
  <div class="favorites-page">
    <h1 class="page-title">收藏的用户</h1>
    
    <div v-if="isLoading" class="loading-message">
      <div class="loading-spinner"></div>
      <p>加载中，请稍候...</p>
    </div>
    
    <div v-else-if="favorites.length === 0" class="empty-state">
      <p>您还没有收藏任何用户</p>
      <p class="hint-text">在用户页面右上角点击收藏按钮来添加收藏</p>
    </div>
    
    <div v-else class="favorites-grid">
      <div 
        v-for="player in playerDataList" 
        :key="player.username" 
        class="player-card"
        @click="viewPlayer(player.username)"
      >
        <div class="player-card-content">
          <div class="player-info">
            <div class="player-name">
              {{ player.data?.nickname || player.username }}
            </div>
            <div class="player-username">
              {{ player.username }}
            </div>
          </div>
          
          <div class="player-rating" v-if="player.data && player.data.rating">
            <RatingPlate :ra="player.data.rating" :small="true" />
          </div>
          
          <div class="player-error" v-if="player.error">
            无法加载数据
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.favorites-page {
  width: 100%;
  padding-top: 20px;
}

.page-title {
  font-size: 2rem;
  margin-bottom: 30px;
  color: var(--text-primary-color);
  text-align: center;
}

.favorites-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  width: 100%;
}

.player-card {
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 20px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  border: 1px solid var(--border-color); /* Restore border */
  outline: none; /* Remove outline */
}

.player-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-color: #646cff; /* Restore hover border color */
}

.player-card:focus {
  outline: none; /* Remove outline on focus */
}

.player-card-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.player-info {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.player-name {
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--text-primary-color);
}

.player-username {
  font-size: 0.9rem;
  color: var(--text-secondary-color);
}

.player-rating {
  display: flex;
  align-items: center;
}

.player-error {
  color: #ff6b6b;
  font-size: 0.9rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 50px 20px;
  text-align: center;
}

.empty-state p {
  font-size: 1.2rem;
  color: var(--text-secondary-color);
  margin: 5px 0;
}

.hint-text {
  font-size: 1rem;
  opacity: 0.7;
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
  .favorites-grid {
    grid-template-columns: 1fr;
  }
}
</style>
