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
  <div class="wrapper">
    <div class="app-container">
      <!-- {{ fishData.rating }} -->
      <RatingPlate :ra="ra" />
      
      <div class="score-grid-wrapper">
        <div class="score-grid">
          <div v-for="index in 35" :key="`cell-${index}`" class="score-cell">
            <ScoreCard />
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
}
</style>

<style scoped>
.wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
  overflow-x: hidden;
  box-sizing: border-box;
}

.app-container {
  width: 100%;
  max-width: calc(100vw - 40px);
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.score-grid-wrapper {
  width: 100%;
}

.score-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 15px;
  margin-top: 20px;
  width: 100%;
  justify-content: center;
}

@media (min-width: 1254px) {
  .score-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

@media (max-width: 1253px) and (min-width: 1000px) {
  .score-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 999px) and (min-width: 768px) {
  .score-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 767px) and (min-width: 500px) {
  .score-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  
  .app-container {
    padding: 0 10px;
  }
}

@media (max-width: 499px) {
  .score-grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
  
  .app-container {
    padding: 0 5px;
  }
}

.score-cell {
  display: flex;
  justify-content: center;
}
</style>
