<script setup lang="ts">
import { getDivingFishData } from "./divingfish";
import { ref } from 'vue';

// window.g = getDivingFishData;
const fishData = ref('');
getDivingFishData("realtvop").then(data => fishData.value = JSON.stringify(data));
</script>

<template>
  {{ fishData }}
</template>

<style scoped>
</style>
