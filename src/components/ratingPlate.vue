<script setup lang="ts">
import plates from "../assets/plates";
</script>

<template>
  <svg xmlns="http://www.w3.org/2000/svg" width="100px" height="20px">
      <image :href="plates['10']" x="0" y="0" height="1.2em"/>
      {{ $attrs.ra.split('').map((char, i) => `
        <text
          x="${4.9 + (5 - $attrs.ra.length + i) * 0.8}em"
          y="1.45em"
          font-family="Monaco, 'JetBrains Mono', Monospaced, monospace"
          font-size="0.6em"
          fill="#FCD41B">
          ${char}
        </text>`).join('') }}
        <text x="4.9em" y="1.45em" font-family="Monaco, 'JetBrains Mono', Monospaced, monospace" font-size="0.6em" fill="#FCD41B">
          {{ $attrs.ra[$attrs.ra.length - 5] ?? "" }}
        </text>
        <text x="5.7em" y="1.45em" font-family="Monaco, 'JetBrains Mono', Monospaced, monospace" font-size="0.6em" fill="#FCD41B">
          {{ $attrs.ra[$attrs.ra.length - 4] ?? "" }}
        </text>
        <text x="6.5em" y="1.45em" font-family="Monaco, 'JetBrains Mono', Monospaced, monospace" font-size="0.6em" fill="#FCD41B">
          {{ $attrs.ra[$attrs.ra.length - 3] ?? "" }}
        </text>
        <text x="7.3em" y="1.45em" font-family="Monaco, 'JetBrains Mono', Monospaced, monospace" font-size="0.6em" fill="#FCD41B">
          {{ $attrs.ra[$attrs.ra.length - 2] ?? "" }}
        </text>
        <text x="8.1em" y="1.45em" font-family="Monaco, 'JetBrains Mono', Monospaced, monospace" font-size="0.6em" fill="#FCD41B">
          {{ $attrs.ra[$attrs.ra.length - 1] ?? "" }}
        </text>
    </svg>
</template>

<style scoped>
</style>
