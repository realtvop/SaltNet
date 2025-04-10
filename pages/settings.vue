<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { getSetting, setSetting, SETTINGS } from '../utils/userSettings';

// Username input ref
const username = ref('');

// Load username from settings on mount
onMounted(() => {
  username.value = getSetting<string>(SETTINGS.USERNAME);
});

// Watch for changes and save automatically
watch(username, (newValue) => {
  if (newValue.trim()) {
    setSetting(SETTINGS.USERNAME, newValue.trim());
  }
});
</script>

<template>
  <div class="settings-container">
    <h1>设置</h1>
    
    <div class="settings-section">
      <h2>个人信息</h2>
      
      <div class="form-group">
        <label for="username">用户名</label>
        <input 
          id="username" 
          v-model="username" 
          type="text" 
          placeholder="输入您的用户名" 
          class="input-field"
        />
        <p class="hint-text">请填写您的水鱼用户名</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  text-align: left;
}

h1 {
  font-size: 2rem;
  margin-bottom: 30px;
  color: var(--text-primary-color);
}

.settings-section {
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 30px;
  border: 1px solid var(--border-color);
}

h2 {
  font-size: 1.5rem;
  margin-bottom: 20px;
  color: var(--text-primary-color);
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-primary-color);
}

.input-field {
  width: 100%;
  padding: 10px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background-color: var(--input-bg-color);
  color: var(--text-primary-color);
  font-size: 1rem;
  max-width: 300px;
}

.input-field:focus {
  outline: none;
  border-color: #646cff;
}

.hint-text {
  margin-top: 6px;
  font-size: 0.9rem;
  color: var(--text-secondary-color);
}

.success-message {
  color: #51cf66;
  margin-top: 8px;
  font-size: 0.9rem;
}

.error-message {
  color: #ff6b6b;
  margin-bottom: 15px;
}

@media (max-width: 600px) {
  .settings-container {
    padding: 15px;
  }
}
</style>