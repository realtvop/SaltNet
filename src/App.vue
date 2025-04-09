<script setup lang="ts">
import { getDivingFishData } from "./divingfish";
import { ref, computed } from 'vue';

import RatingPlate from "./components/RatingPlate.vue";
import ScoreCard from "./components/ScoreCard.vue";

const fishData = ref<any>(null);
// const player = "realtvop" // "蓝原柚子";
// const player = "蓝原柚子";
// const player = "Kaosas";
const player = decodeURI(window.location.pathname.split("/").pop() || "realtvop"); // Get the player name from the URL

getDivingFishData(player).then(data => fishData.value = data);

// Calculate statistics for the SD scores based on ra values
const sdStats = computed(() => {
  if (!fishData.value?.charts?.sd?.length) return null;
  
  const scores = fishData.value.charts.sd.map((item: any) => item.ra);
  scores.sort((a: number, b: number) => a - b);
  
  const avg = scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length;
  const median = scores.length % 2 === 0 
    ? (scores[scores.length/2 - 1] + scores[scores.length/2]) / 2 
    : scores[Math.floor(scores.length/2)];
  const range = scores[scores.length - 1] - scores[0];
  
  // Calculate difficulty constant range
  const constants = fishData.value.charts.sd.map((item: any) => item.ds);
  constants.sort((a: number, b: number) => a - b);
  const minConstant = constants[0];
  const maxConstant = constants[constants.length - 1];
  
  return {
    avg: avg.toFixed(2),
    median: median,
    range: range,
    levelRange: `${minConstant.toFixed(1)}~${maxConstant.toFixed(1)}`
  };
});

// Calculate statistics for the DX scores based on ra values
const dxStats = computed(() => {
  if (!fishData.value?.charts?.dx?.length) return null;
  
  const scores = fishData.value.charts.dx.map((item: any) => item.ra);
  scores.sort((a: number, b: number) => a - b);
  
  const avg = scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length;
  const median = scores.length % 2 === 0 
    ? (scores[scores.length/2 - 1] + scores[scores.length/2]) / 2 
    : scores[Math.floor(scores.length/2)];
  const range = scores[scores.length - 1] - scores[0];
  
  // Calculate difficulty constant range
  const constants = fishData.value.charts.dx.map((item: any) => item.ds);
  constants.sort((a: number, b: number) => a - b);
  const minConstant = constants[0];
  const maxConstant = constants[constants.length - 1];
  
  return {
    avg: avg.toFixed(2),
    median: median,
    range: range,
    levelRange: `${minConstant.toFixed(1)}~${maxConstant.toFixed(1)}`
  };
});
</script>

<template>
  <div class="wrapper">
    <div class="app-container">
      <h1 class="section-title player-name">{{ player }}</h1>
      <RatingPlate :ra="fishData ? fishData.rating : 0" />
      
      <!-- SD Scores Section -->
      <h2 class="section-title">
        旧版本
        <span class="stats-info" v-if="sdStats">
          <span class="stat-item">{{ sdStats.levelRange }}</span>
          <span class="stat-item">平均: {{ sdStats.avg }}</span>
          <span class="stat-item">中位数: {{ sdStats.median }}</span>
          <span class="stat-item">极差: {{ sdStats.range }}</span>
        </span>
      </h2>
      <div class="score-grid-wrapper" v-if="fishData && fishData.charts && fishData.charts.sd">
        <div class="score-grid">
          <div v-for="(score, index) in fishData.charts.sd" :key="`sd-cell-${index}`" class="score-cell">
            <ScoreCard :data="score" />
          </div>
        </div>
      </div>
      
      <!-- DX Scores Section -->
      <h2 class="section-title">
        新版本
        <span class="stats-info" v-if="dxStats">
          <span class="stat-item">{{ dxStats.levelRange }}</span>
          <span class="stat-item">平均: {{ dxStats.avg }}</span>
          <span class="stat-item">中位数: {{ dxStats.median }}</span>
          <span class="stat-item">极差: {{ dxStats.range }}</span>
        </span>
      </h2>
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
  color: white;
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
  text-align: left;
  font-size: 1.8rem;
  font-weight: bold;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 15px;
  /* color: #333; */
}

.stats-info {
  font-size: 0.9rem;
  font-weight: normal;
  color: #aaa;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 10px;
}

.stat-item {
  white-space: nowrap;
}

/* Add a class for player name to keep it centered */
.player-name {
  text-align: center;
  justify-content: center;
}

/* Add this to ensure the first title has proper spacing */
.section-title:first-of-type {
  margin-top: 20px;
}

@media (max-width: 768px) {
  .section-title {
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
  }
  
  .stats-info {
    margin-left: 5px;
    font-size: 0.8rem;
  }
}
</style>
