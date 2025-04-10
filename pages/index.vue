<script setup lang="ts">
import { ref } from 'vue';

const searchInput = ref('');

// Navigate to player page
const navigateToPlayer = () => {
  if (searchInput.value.trim()) {
    window.location.href = `/${encodeURIComponent(searchInput.value.trim())}`;
  }
};

// Handle enter key press
const handleKeyPress = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    navigateToPlayer();
  }
};
</script>

<template>
  <div class="homepage-container">
    <h1 class="homepage-title">SaltWeb</h1>
    <div class="homepage-search-container">
      <input 
        v-model="searchInput" 
        @keyup="handleKeyPress"
        placeholder="输入用户名查询" 
        class="homepage-search-input"
      />
      <button @click="navigateToPlayer" class="homepage-search-button">搜索</button>
    </div>
  </div>
</template>

<style scoped>
.homepage-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 80vh;
  width: 100%;
  padding: 0 20px;
}

.homepage-title {
  font-size: 2.5rem;
  margin-bottom: 30px;
  color: var(--text-primary-color);
}

.homepage-search-container {
  display: flex;
  width: 100%;
  max-width: 500px;
  margin: 0 auto;
}

.homepage-search-input {
  flex: 1;
  padding: 15px;
  font-size: 1.1rem;
  border-radius: 4px 0 0 4px;
  border: 1px solid var(--border-color);
  background-color: var(--input-bg-color);
  color: var(--text-primary-color);
  outline: none;
}

.homepage-search-button {
  padding: 15px 25px;
  font-size: 1.1rem;
  border-radius: 0 4px 4px 0;
  background-color: #535bf2;
  color: white;
  border: none;
  cursor: pointer;
}

.homepage-search-button:hover {
  background-color: #646cff;
}
</style>