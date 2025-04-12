<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAsyncData, useState } from '#app';
import ScoreSection from '~/components/ScoreSection.vue';
import type { DivingFishResponse } from '~/divingfish/type';

// Define the expected structure from the API endpoint
interface PlayerApiResponse {
  name: string;
  data: DivingFishResponse | null;
  error?: string;
}

const route = useRoute();
const username = ref(route.params.username as string);
const error = ref<string | null>(null); // Keep error state

// Use useState for server-side rendering and client-side hydration
const playerData = useState<PlayerApiResponse | null>(`player-${username.value}`, () => null);

// Fetch data using useAsyncData for SSR and client-side fetching/hydration
// 'pending' ref now controls the loading state
const { data: fetchedData, pending, error: fetchError, refresh } = useAsyncData<PlayerApiResponse>(
  `player-data-${username.value}`,
  () => $fetch(`/api/player/${encodeURIComponent(username.value)}`),
  {
    watch: [username], // Re-run fetch when username changes
    immediate: true,   // Fetch immediately on component load/activation
    // Default value helps prevent accessing null before first fetch completes
    default: () => ({ name: username.value, data: null, error: undefined })
  }
);

// Update local state based on fetched data
watch(fetchedData, (newData) => {
  if (newData) {
    playerData.value = newData;
    // Set error based on API response error, clear local error if API call succeeded but returned an error message
    error.value = newData.error || null;
    // Update global state if needed
    const globalPlayerInfo = useState<{ name: string; data: DivingFishResponse | null }>('playerInfo');
    if (newData.data && (globalPlayerInfo.value?.name !== newData.name || globalPlayerInfo.value?.data !== newData.data)) {
      globalPlayerInfo.value = { name: newData.name, data: newData.data };
    } else if (!newData.data && newData.error) {
      globalPlayerInfo.value = { name: newData.name, data: null };
    }
  } else {
    // If newData is null after fetch (shouldn't happen with default), reset state
    playerData.value = { name: username.value, data: null, error: undefined };
    error.value = null; // Clear potential previous error
    const globalPlayerInfo = useState<{ name: string; data: DivingFishResponse | null }>('playerInfo');
    globalPlayerInfo.value = { name: username.value, data: null };
  }
}, { immediate: true });

// Update error state based on actual fetchError (network issues, 500 errors not caught by API)
watch(fetchError, (newError) => {
  if (newError && !error.value) { // Only set if not already set by API response error
    // Try to extract a meaningful message from the fetch error itself
    const message = newError.data?.error || newError.message || 'Failed to connect to server.';
    error.value = message;
    // Ensure playerData reflects the error state if fetch itself failed
    if (!playerData.value || !playerData.value.error) {
      playerData.value = { name: username.value, data: null, error: message };
    }
  }
});

// Watch for route parameter changes to update username and trigger refresh
watch(() => route.params.username, (newUsername) => {
  const newName = newUsername as string;
  if (newName && newName !== username.value) {
    username.value = newName;
    // Reset state before fetching new user
    error.value = null;
    playerData.value = null; // Clear old data
    // useAsyncData will automatically refresh due to the watch on username ref
  }
});

// Computed property for easier access in the template
const fishData = computed(() => {
  // Ensure we return null if playerData itself is null
  return playerData.value?.data ?? null;
});

// Computed property for specific error message handling
const errorMessage = computed(() => {
  const msg = error.value === 'user not exists'
    ? `玩家 "${username.value}" 不存在`
    : error.value || '加载数据时出错'; // Default message if error is set but not 'user not exists'
  return msg;
});

</script>

<template>
  <div class="player-profile">
    <!-- Loading Indicator: Use 'pending' directly -->
    <div v-if="pending" class="loading-message">
      <div class="loading-spinner"></div>
      <p>加载中，请稍候...</p>
    </div>

    <!-- Error Message Display: Show if not pending and error is set -->
    <div v-else-if="error" class="error-message">
      <h2>{{ errorMessage }}</h2>
      <p v-if="error !== 'user not exists'">请检查网络连接或稍后再试。</p>
      <p v-else>请检查用户名是否正确。</p>
    </div>

    <!-- Player Data Display: Show if not pending, no error, and fishData is truthy -->
    <div v-else-if="fishData" class="player-b50">
      <!-- B50 Scores Section -->
      <ScoreSection v-if="fishData.b50?.sd?.length" title="旧版本成绩" :scores="fishData.b50.sd" />
      <ScoreSection v-if="fishData.b50?.dx?.length" title="新版本成绩" :scores="fishData.b50.dx" />
      <!-- Message if b50 arrays are empty -->
      <p v-if="!(fishData.b50?.sd?.length || fishData.b50?.dx?.length)" style="text-align: center; color: orange; margin-top: 20px;">
        玩家数据已加载，但 B50 成绩为空。
      </p>
    </div>

    <!-- Fallback: Show if not pending, no error, and no fishData (API returned null data without error) -->
    <div v-else class="error-message">
      <h2>无法加载玩家数据</h2>
      <p>未能获取到有效的玩家信息，请稍后再试或检查用户名。</p>
    </div>
  </div>
</template>

<style scoped>
.player-profile {
  width: 100%;
  padding-top: 20px;
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
</style>