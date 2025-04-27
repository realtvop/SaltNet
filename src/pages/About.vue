<script setup lang="ts">
const buildTime = window.spec?.currentVersionBuildTime;
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
          舞萌 DX 查分器
          <br>
          <div class="build-time-text">
            当前版本构建时间: {{ buildTime === "%buildTime%" ? "开发版本" : new Date(Number(buildTime)).toLocaleString() }}
          </div>
          <br>
          Made with ❤️ by realtvop
        </mdui-typography>

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