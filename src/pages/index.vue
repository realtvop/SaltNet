<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import RatingPlate from "@/components/RatingPlate.vue";
import { useRouter } from "vue-router";
import { fetchPlayerData as fetchDivingFishData } from "@/divingfish/index";
import type { DivingFishResponse } from "@/divingfish/type";

const username = ref("");
const isLoggedIn = ref(false);
const playerData = ref<DivingFishResponse | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);
const router = useRouter();

const viewMyB50 = () => {
  if (username.value) {
    router.push(`/user/${encodeURIComponent(username.value)}`);
  }
};

const goToSettings = () => {
  router.push("/settings");
};

const goToFavorites = () => {
  router.push("/favorites"); // Assuming /favorites is the route
};

const fetchPlayerData = async (player: string) => {
  isLoading.value = true;
  error.value = null;
  playerData.value = null;
  try {
    const data = await fetchDivingFishData(player);
    playerData.value = data;
  } catch (err: any) {
    console.error("Error fetching player data:", err);
    if (err.message === 'user not exists') {
      error.value = '用户不存在';
    } else {
      error.value = '数据获取失败';
    }
    playerData.value = null;
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="page-content">
    <div class="header-content">
      <img src="/favicon.png" alt="Favicon" class="favicon-image" />
      <h1 variant="display-large" class="project-title">SaltNet</h1>
    </div>
    <mdui-card variant="filled" style="width: 100%; max-width: 600px; margin-bottom: 24px;">
      <div style="padding: 20px; text-align: center;">
        <mdui-typography variant="headline-medium" class="welcome-text">
          欢迎，{{ isLoggedIn ? username : "wmc" }}
        </mdui-typography>

        <div v-if="isLoggedIn">
          <mdui-linear-progress v-if="isLoading"></mdui-linear-progress>
          <div v-else-if="playerData" class="rating-container">
            <RatingPlate :ra="playerData.rating" :small="false" class="large-rating" />
          </div>
          <mdui-chip v-else-if="error" variant="assist" color="error">{{ error }}</mdui-chip>
        </div>
        <div v-else class="loading-text">
           <mdui-chip variant="assist">请在 <a href="javascript:void(0)" @click="goToSettings">设置</a> 中设置水鱼账号名</mdui-chip>
        </div>
      </div>
    </mdui-card>

    <div class="github-footer">
       <mdui-chip
          variant="outlined"
          icon="link"
          href="https://github.com/realtvop/SaltNet"
          target="_blank"
        >
          realtvop/SaltNet
        </mdui-chip>
    </div>

  </div>
</template>

<style scoped>
.header-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20px;
}

.favicon-image {
  width: 120px; /* Increased size further */
  height: 120px; /* Increased size further */
  margin-bottom: 15px; /* Adjusted spacing */
}

.project-title {
  margin-top: 0;
  margin-bottom: 0;
}

.page-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center; /* Center content vertically */
  min-height: calc(100vh - 64px - 40px); /* Adjust based on app bar and potential footer/padding */
  width: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.welcome-text {
  margin-bottom: 16px;
}

.rating-container {
  display: flex;
  justify-content: center;
  margin: 25px 0; /* Restore margin */
}

.large-rating {
  transform: scale(1.5); /* Restore scale */
}

.loading-text {
  margin: 25px 0; /* Restore margin */
  font-size: 1.1rem;
}

.loading-text a {
  color: var(--mdui-color-primary);
  text-decoration: underline;
}
.loading-text a:hover {
  color: var(--mdui-color-primary-hover);
}

.github-footer {
  margin-top: 40px;
  text-align: center;
  width: 100%;
  /* Optional: Re-add fixed positioning if desired */
  /* position: fixed; */
  /* bottom: 20px; */
  /* left: 0; */
}

/* Ensure MDUI components fit well */
mdui-button {
  margin: 0; /* Remove default browser margins if any */
}
mdui-card {
  text-align: center;
}
</style>