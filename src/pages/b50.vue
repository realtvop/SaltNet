<script setup lang="ts">
import { ref, computed, watch, onMounted, inject } from 'vue';
import { useRoute } from 'vue-router';
import ScoreSection from '@/components/ScoreSection.vue';
import type { User } from '@/types/user';
import localForage from "localforage";

const route = useRoute();
const userId = ref(route.params.id as string);
const error = ref<string | null>(null);
const pending = ref(false);
const playerData = ref<User | null>(null);


const loadPlayerData = async (id: number) => {
  pending.value = true;
  error.value = null;
  playerData.value = null;

  localForage.getItem<User[]>("users").then(v => {
    if (v) playerData.value = v[id];
    pending.value = false;
  });
};

onMounted(() => {
  loadPlayerData(Number(userId.value ?? "0"));
});

// watch(() => route.params.username, (newUsername) => {
//   const newName = newUsername as string;
//   if (newName && newName !== username.value) {
//     username.value = newName;
//     loadPlayerData(newName);
//   }
// });

const player = computed(() => {
  return playerData.value ?? null;
});

const errorMessage = computed(() => {
  if (!error.value) return '';
  const msg = error.value === 'user not exists'
    ? `玩家 "${userId.value}" 不存在`
    : error.value || '加载数据时出错';
  return msg;
});

</script>

<template>
  <div class="player-profile">
    <div v-if="pending" class="loading-message">
      <div class="loading-spinner"></div>
      <p>加载中，请稍候...</p>
    </div>

    <div v-else-if="error" class="error-message">
      <h2>{{ errorMessage }}</h2>
      <p v-if="error !== 'user not exists'">请检查网络连接或稍后再试。</p>
      <p v-else>请检查用户名是否正确。</p>
    </div>

    <div v-else-if="player && player.data" class="player-b50">
      <ScoreSection v-if="player.data.b50?.sd?.length" title="旧版本成绩" :scores="player.data.b50.sd" />
      <ScoreSection v-if="player.data.b50?.dx?.length" title="新版本成绩" :scores="player.data.b50.dx" />
      <p v-if="!(player.data.b50?.sd?.length || player.data.b50?.dx?.length)" style="text-align: center; color: orange; margin-top: 20px;">
        玩家数据已加载，但 B50 成绩为空。
      </p>
    </div>

    <div v-else class="error-message">
      <h2>无法加载玩家数据</h2>
      <p>未能获取到有效的玩家信息，请稍后再试或检查用户名。</p>
    </div>
  </div>
</template>

<style scoped>
.player-profile {
  width: 100%;
  /* padding-top: 80px; */ /* 移除此行，由 App.vue 的 content-padding 处理 */
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}

.loading-message,
.error-message {
  text-align: center;
  margin-top: 50px;
  color: var(--text-secondary-color);
}

.loading-spinner {
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top: 4px solid var(--accent-color, #fff);
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 20px auto;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.player-b50 {
  width: 100%;
  max-width: 1200px;
  box-sizing: border-box;
  padding-bottom: 5vh;
}

.error-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 50px 20px;
  text-align: center;
  color: var(--text-error-color, #ff6b6b);
}

.error-message h2 {
  color: var(--error-color, #ff6b6b);
  margin-bottom: 10px;
}
</style>