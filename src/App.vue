<script setup lang="ts">
import { ref, provide } from 'vue';
import { useRoute } from 'vue-router';
import * as TopAppBar from './components/TopAppBar.vue';

const playerInfo = ref({
  name: '',
  data: null as any
});

provide('playerInfo', playerInfo);
const route = useRoute();
</script>

<template>
  <mdui-layout>
    <component :is="TopAppBar.default" :playerInfo="playerInfo"/>
    <mdui-layout-main class="app-container">
      <!-- Router View -->
      <router-view v-slot="{ Component }">
        <component :is="Component" :key="route.path" />
      </router-view>
    </mdui-layout-main>
  </mdui-layout>
</template>

<style scoped>
.app-container {
  padding: 16px;
  box-sizing: border-box;
  /* Removed fixed height and overflow-y */
}

.player-info-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.player-rating-chip {
  margin-left: 4px;
  transform: scale(0.9);
}

.favorite-icon-button {
  margin-left: 4px;
}

.search-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-field {
  min-width: 150px;
}

@media (max-width: 600px) {
  .search-field {
    min-width: 120px;
  }
  .player-info-bar {
     gap: 4px;
  }
  /* Removed height adjustment for .app-container */
}
</style>

<style>
body {
  margin: 0;
}

#app {
  width: 100%;
  min-height: 100vh;
  display: block;
}

button {
  padding: initial;
  border: initial;
  background: initial;
  font-family: initial;
  font-size: initial;
  font-weight: initial;
  border-radius: initial;
  cursor: initial;
  transition: initial;
  color: initial;
}
button:hover {
  border-color: initial;
}
button:focus,
button:focus-visible {
  outline: initial;
}
</style>