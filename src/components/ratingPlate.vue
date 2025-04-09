<script setup lang="ts">
import plates from "../assets/plates";
</script>

<template>
  <svg xmlns="http://www.w3.org/2000/svg" width="100px" height="20px">
      <image :href="plates['10']" x="0" y="0" height="1.2em"/>
        <text
          v-for="i in 5"
          :key="i"
          :x="`${4.9 + (i - 1) * 0.8}em`"
          y="1.45em"
          font-family="Monaco, 'JetBrains Mono', Monospaced, monospace"
          font-size="0.6em"
          fill="#FCD41B">
          {{ $attrs.ra[$attrs.ra.length - (6 - i)] ?? "" }}
        </text>
    </svg>
</template>

<style scoped>
</style>
