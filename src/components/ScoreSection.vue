<script setup lang="ts">
import { computed } from 'vue';
import ScoreCard from "./ScoreCard.vue";
import type { Chart } from '@/types/music';

// Define props for the component
const props = defineProps<{
  title: string;
  scores: any[]; // 允许更通用的卡片数据结构
  chartInfoDialog: {
    open: boolean;
    chart: any;
  };
}>();

// Calculate statistics for the scores based on ra values
const stats = computed(() => {
  if (!props.scores || props.scores.length === 0) return null;
  
  const scores = props.scores.map((item: any) => item.ra);
  scores.sort((a: number, b: number) => a - b);
  
  const avg = scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length;
  const median = scores.length % 2 === 0 
    ? (scores[scores.length/2 - 1] + scores[scores.length/2]) / 2 
    : scores[Math.floor(scores.length/2)];
  const range = scores[scores.length - 1] - scores[0];
  
  // Calculate difficulty constant range
  const constants = props.scores.map((item: any) => item.ds);
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

function openDialog(chart: any) {
  props.chartInfoDialog.open = !props.chartInfoDialog.open;
  props.chartInfoDialog.chart = chart;
}
</script>

<template>
  <div class="score-section">
    <h2 class="section-title">
      {{ title }}
      <span class="stats-info" v-if="stats">
        <span class="stat-item">{{ stats.levelRange }}</span>
        <span class="stat-item">平均: {{ stats.avg }}</span>
        <span class="stat-item">中位数: {{ stats.median }}</span>
        <span class="stat-item">极差: {{ stats.range }}</span>
      </span>
    </h2>
    <div class="score-grid-wrapper">
      <div class="score-grid">
        <div v-for="(score, index) in scores" :key="`score-cell-${index}`" class="score-cell">
          <ScoreCard @click="openDialog(score)" :data="score" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.score-section {
  width: 100%;
  max-width: 1300px;
  margin: 0 auto;
  padding: 0 20px;
  box-sizing: border-box;
  border-left: 1px solid transparent;
  border-right: 1px solid transparent;
}

.section-title {
  width: 100%;
  margin-top: 30px;
  margin-bottom: 10px;
  text-align: left;
  font-size: 1.5rem;
  font-weight: bold;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 15px;
  color: var(--text-primary-color, inherit);
}

.stats-info {
  font-size: 0.9rem;
  font-weight: normal;
  color: var(--text-secondary-color, #888);
  display: inline-flex;
  flex-wrap: wrap;
  gap: 10px;
}

.stat-item {
  white-space: nowrap;
}

.score-grid-wrapper {
  width: 100%;
  overflow: visible;
}

.score-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 210px);
  gap: 15px;
  margin-top: 20px;
  width: 100%;
  justify-content: center;
  box-sizing: border-box;
}

.score-cell {
  display: flex;
  justify-content: center;
  width: 210px;
  box-sizing: border-box;
  padding: 0;
  height: auto;
}

@media (min-width: 1254px) {
  .score-grid {
    grid-template-columns: repeat(5, 210px);
    justify-content: center;
  }
}

@media (max-width: 1253px) and (min-width: 1000px) {
  .score-grid {
    grid-template-columns: repeat(4, 210px);
    justify-content: center;
  }
}

@media (max-width: 999px) and (min-width: 768px) {
  .score-grid {
    grid-template-columns: repeat(3, 210px);
    justify-content: center;
  }
}

@media (max-width: 767px) and (min-width: 500px) {
  .score-grid {
    grid-template-columns: repeat(2, 210px);
    justify-content: center;
  }
}

@media (max-width: 499px) {
  .score-grid-wrapper {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    height: auto;
    overflow: visible;
  }
  .score-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    transform: none;
    width: 100%;
    margin: 0;
    justify-content: center;
  }
  .score-cell {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 0;
  }
  .score-section {
    padding: 0 20px;
    overflow: visible;
  }
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

@media (max-width: 349px) {
  .score-grid {
    grid-template-columns: 210px;
    justify-content: center;
  }
  .score-cell {
    width: 210px;
  }
  .score-section {
    padding: 0 20px;
  }
}
</style>