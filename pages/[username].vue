<script setup lang="ts">
import { ref } from "vue";
import RatingPlate from "../components/RatingPlate.vue";
import ScoreSection from "../components/ScoreSection.vue";

const route = useRoute();
const username = route.params.username as string;

// Use useAsyncData for server-side rendering
const { data: playerData } = await useAsyncData(
  `player-${username}`,
  () => $fetch(`/api/player/${encodeURIComponent(username)}`),
  {
    server: true,
    cache: true,
  }
);

// Shared state for player data - update this to be accessible in app.vue
const playerInfo = useState("playerInfo", () => {
  return {
    name: playerData.value?.name || username || "realtvop",
    data: playerData.value?.data || null,
  };
});

// Update the shared state when data changes
if (playerData.value) {
  playerInfo.value = {
    name: playerData.value.name || username,
    data: playerData.value.data,
  };
}

// Data refs from the server-rendered data
const fishData = ref(playerInfo.value.data);
const player = ref(playerInfo.value.name);
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