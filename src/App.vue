<script setup lang="ts">
import { getDivingFishData } from "./divingfish";
import { ref } from 'vue';

import RatingPlate from "./components/ratingPlate.vue";
import ScoreCard from "./components/ScoreCard.vue";

// window.g = getDivingFishData;
const fishData = ref('');
const ra = ref(0);
getDivingFishData("realtvop"/* "蓝原柚子" */).then(data => { fishData.value = data; ra.value = data.rating; });

</script>

<template>
  <!-- {{ fishData.rating }} -->
  <RatingPlate :ra="ra" />
  
  <div class="score-grid">
    <div v-for="index in 35" :key="`cell-${index}`" class="score-cell">
      <ScoreCard />
    </div>
  </div>
</template>

<style scoped>
.score-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin-top: 20px;
  justify-content: center;
  width: 100%;
}

.score-cell {
  display: flex;
  justify-content: center;
}
</style>
