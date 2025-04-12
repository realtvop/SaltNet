<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAsyncData, useState } from '#app';
import ScoreSection from '~/components/ScoreSection.vue';
import RatingPlate from '~/components/RatingPlate.vue'; // Assuming you have this component
import type { DivingFishResponse } from '~/divingfish/type';

const route = useRoute();
const username = ref(route.params.username as string);
const isLoading = ref(true);
const error = ref<string | null>(null);

// Use useState for server-side rendering and client-side hydration
const playerData = useState<{ name: string; data: DivingFishResponse | null; error?: string } | null>(`player-${username.value}`, () => null);

// Fetch data using useAsyncData for SSR and client-side fetching/hydration
const { data: fetchedData, pending, error: fetchError, refresh } = useAsyncData(
  `player-data-${username.value}`,
  () => $fetch(`/api/player/${encodeURIComponent(username.value)}`),
  {
    watch: [username], // Re-run fetch when username changes
    immediate: true,   // Fetch immediately on component load/activation
  }
);

// Update local state based on fetched data
watch(fetchedData, (newData) => {
  if (newData) {
    playerData.value = newData;
    error.value = newData.error || null;
    // Update global state if needed (ensure this doesn't cause infinite loops)
    const globalPlayerInfo = useState<{ name: string; data: DivingFishResponse | null }>('playerInfo');
    if (globalPlayerInfo.value?.name !== newData.name || globalPlayerInfo.value?.data !== newData.data) {
       globalPlayerInfo.value = { name: newData.name, data: newData.data };
    }
  } else {
    playerData.value = null;
    error.value = 'Failed to load player data.';
  }
  isLoading.value = false; // Update loading state when data arrives or fetch fails
}, { immediate: true });

// Update loading state based on pending status
watch(pending, (newPending) => {
  isLoading.value = newPending;
});

// Update error state based on fetchError
watch(fetchError, (newError) => {
  if (newError) {
    // Try to extract a meaningful message
    const message = newError.data?.error || newError.message || 'An unknown error occurred';
    error.value = message;
    playerData.value = { name: username.value, data: null, error: message }; // Clear data on error
  } else {
    // Clear error if fetch succeeds on retry or subsequent fetch
    // error.value = null; // Only clear if playerData is successfully populated
  }
  isLoading.value = false; // Ensure loading is false after error
});

// Watch for route parameter changes to update username and trigger refresh
watch(() => route.params.username, (newUsername) => {
  const newName = newUsername as string;
  if (newName && newName !== username.value) {
    username.value = newName;
    // Reset state before fetching new user
    isLoading.value = true;
    error.value = null;
    playerData.value = null; // Clear old data
    // useAsyncData will automatically refresh due to the watch on username ref
  }
});

// Computed property for easier access in the template
const fishData = computed(() => playerData.value?.data);

// Computed property for specific error message handling
const errorMessage = computed(() => {
  if (error.value === 'user not exists') {
    return `玩家 "${username.value}" 不存在`;
  }
  return error.value || '加载数据时出错';
});

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
      <h2>{{ errorMessage }}</h2>
      <p v-if="error !== 'user not exists'">请检查网络连接或稍后再试。</p>
      <p v-else>请检查用户名是否正确。</p>
    </div>
    <!-- Player Data Display -->
    <div v-else-if="fishData">
      <!-- User Header -->
      <div class="user-header">
        <div class="user-name">
          <h1>{{ fishData.nickname || username }}</h1>
          <RatingPlate
            v-if="fishData.rating !== undefined && fishData.additional_rating !== undefined"
            :plate="fishData.plate || ''"
            :ra="fishData.rating"
            :additionalRa="fishData.additional_rating"
            :small="false"
            class="large-rating-plate"
          />
           <p v-else>Rating: N/A</p> <!-- Fallback if rating is missing -->
        </div>
      </div>

      <!-- B50 Scores Section -->
      <ScoreSection v-if="fishData.b50?.sd?.length" title="旧版本成绩" :scores="fishData.b50.sd" />
      <ScoreSection v-if="fishData.b50?.dx?.length" title="新版本成绩" :scores="fishData.b50.dx" />

      <!-- Optional: Display All Scores -->
      <!-- <ScoreSection v-if="fishData.records?.filter(s => s.type === 'SD').length" title="全部旧版本成绩" :scores="fishData.records.filter(s => s.type === 'SD')" /> -->
      <!-- <ScoreSection v-if="fishData.records?.filter(s => s.type === 'DX').length" title="全部新版本成绩" :scores="fishData.records.filter(s => s.type === 'DX')" /> -->

    </div>
     <!-- Fallback if data is somehow null without error -->
    <div v-else class="error-message">
      <h2>无法加载玩家数据</h2>
      <p>请稍后再试。</p>
    </div>
  </div>
</template>

<style scoped>
.player-profile {
  width: 100%;
  padding-top: 20px;
  padding-bottom: 40px; /* Add padding at the bottom */
}

.loading-message,
.error-message {
  text-align: center;
  margin-top: 50px;
  color: var(--text-secondary-color);
}

.loading-spinner {
  /* Add your spinner styles */
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top: 4px solid var(--accent-color, #fff);
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 20px auto;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
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

.player-b50 {
  padding-bottom: 5vh;
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
  color: var(--error-color, #ff6b6b);
  margin-bottom: 10px;
}

.user-header {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 30px;
  text-align: center;
}

.user-name {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px; /* Space between nickname and rating plate */
}

.user-name h1 {
  margin: 0;
  font-size: 2.5rem;
  color: var(--text-primary-color);
}

.large-rating-plate {
  /* Adjust styles for the rating plate in the header if needed */
  transform: scale(1.1); /* Example: make it slightly larger */
}

/* Add styles for ScoreSection if needed, or rely on its internal styles */
</style>