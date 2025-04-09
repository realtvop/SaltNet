<script setup lang="ts">
import { getDivingFishData } from "./divingfish";
import { ref } from 'vue';

import RatingPlate from "./components/ratingPlate.vue";
import ScoreCard from "./components/ScoreCard.vue";

const fishData = ref<any>(null);
const ra = ref(0);

getDivingFishData("realtvop"/* "蓝原柚子" */).then(data => { 
  fishData.value = data;
  console.log(fishData.value); 
  ra.value = data.rating; 
});
</script>

<template>
  <div class="wrapper">
    <div class="app-container">
      <RatingPlate :ra="ra" />
      
      <!-- SD Scores Section -->
      <h2 class="section-title">Standard Scores</h2>
      <div class="score-grid-wrapper" v-if="fishData && fishData.charts && fishData.charts.sd">
        <div class="score-grid">
          <div v-for="(score, index) in fishData.charts.sd" :key="`sd-cell-${index}`" class="score-cell">
            <ScoreCard :data="score" />
          </div>
        </div>
      </div>
      
      <!-- DX Scores Section -->
      <h2 class="section-title">Deluxe Scores</h2>
      <div class="score-grid-wrapper" v-if="fishData && fishData.charts && fishData.charts.dx">
        <div class="score-grid">
          <div v-for="(score, index) in fishData.charts.dx" :key="`dx-cell-${index}`" class="score-cell">
            <ScoreCard :data="score" />
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

.section-title {
  width: 100%;
  margin-top: 30px;
  margin-bottom: 10px;
  text-align: center;
  font-size: 1.8rem;
  font-weight: bold;
  color: #333;
}

/* Add this to ensure the first title has proper spacing */
.section-title:first-of-type {
  margin-top: 20px;
}
</style>
