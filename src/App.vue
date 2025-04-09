<script setup lang="ts">
import { getDivingFishData } from "./divingfish";
import { ref } from 'vue';

import RatingPlate from "./components/ratingPlate.vue";

// import { generateRatingSvg } from "./utils/genPlate";


// window.g = getDivingFishData;
const fishData = ref('');
getDivingFishData("realtvop").then(data => fishData.value = data);

const ra = "14555";
// const aaa = generateRatingSvg(ra, plates["10"]);
</script>

<template>
  <!-- {{ fishData.rating }} -->
    <RatingPlate :ra="ra" />
</template>

<style scoped>
</style>
