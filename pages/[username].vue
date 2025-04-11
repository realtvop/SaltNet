<script setup lang="ts">
import { ref, watch, computed } from "vue";
import ScoreSection from "../components/ScoreSection.vue";

const route = useRoute();
const username = ref(route.params.username as string);

// Shared state for player info (to be accessible in app.vue)
const playerInfo = useState("playerInfo");

// Create a function to fetch the player data
const fetchPlayerData = async () => {
  try {
    const data = await $fetch(`/api/player/${encodeURIComponent(username.value)}`);
    playerInfo.value = {
      name: data.name || username.value,
      data: data.data,
    };
    return data;
  } catch (error) {
    console.error("Error fetching player data:", error);
    return {
      name: username.value,
      data: null
    };
  }
};

// Watch for route changes to handle navigation between different usernames
watch(() => route.params.username, async (newUsername) => {
  if (newUsername && newUsername !== username.value) {
    username.value = newUsername as string;
    await fetchPlayerData();
  }
}, { immediate: false });

// Initial data fetch
const { data: initialData } = await useAsyncData(
  `player-${username.value}`,
  () => fetchPlayerData(),
  {
    server: false, // Changed to false for client-side rendering
    cache: true,
  }
);

// Data refs from the fetched data
const fishData = computed(() => playerInfo.value?.data || null);
</script>

<template>
  <div class="player-profile">
    <!-- SD Scores Section -->
    <ScoreSection title="旧版本成绩" :scores="fishData?.charts?.sd || []" />

    <!-- DX Scores Section -->
    <ScoreSection title="新版本成绩" :scores="fishData?.charts?.dx || []" />
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

.user-name h1 {
  margin: 0;
  font-size: 2rem;
  color: var(--text-primary-color);
}

@media (max-width: 768px) {
  .user-name h1 {
    font-size: 1.8rem;
  }
}
</style>