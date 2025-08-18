<script setup lang="ts">
    import RatingPlate from "@/components/data/user/RatingPlate.vue";
    import { useRouter } from "vue-router";
    import { useShared } from "@/components/app/shared";
    import { updateUser } from "@/components/data/user/update";
    import { showSnackbar } from "@/components/app/utils";
    import { getUserDisplayName } from "@/components/data/user/type";

    const router = useRouter();
    const shared = useShared();

    function reloadPage() {
        window.location.reload();
    }

    function openPWADocs() {
        window.open("https://docs.salt.realtvop.top/basis/pwa/", "_blank");
    }

    let lastSaltClick = -114514;
    function meow() {
        console.log("meow");
        const now = performance.now();
        if (now - lastSaltClick < 500) {
            showSnackbar({
                message: "喵喵，咕噜咕噜～",
                duration: 3000,
            });
        }
        lastSaltClick = now;
    }
</script>

<template>
    <div class="announcement-list">
        <s-card type="filled" clickable v-if="shared.isUpdated" class="announcement-item">
            <div class="announcement-content">
                <s-icon>update</s-icon>
                <span>更新完成！刷新生效</span>
                <s-button
                    type="text"
                    style="margin-left: auto; margin-right: -1rem"
                    @click="reloadPage"
                >
                    立即刷新
                </s-button>
            </div>
        </s-card>
        <s-card
            class="announcement-item pwa-install-prompt"
            type="outlined"
            clickable
            @click="openPWADocs"
        >
            <div class="announcement-content">
                <s-icon>install_mobile</s-icon>
                <span>想将 SaltNet 安装为应用吗？点击查看教程</span>
            </div>
        </s-card>
    </div>
    <div class="page-content">
        <div class="header-content">
            <div @click="meow">
                <img src="/favicon.png" alt="Favicon" class="favicon-image favicon" />
            </div>
            <h1 class="project-title">SaltNet</h1>
        </div>
        <s-tooltip content="点击更新成绩" placement="bottom">
            <s-card
                type="filled"
                style="width: 100%; max-width: 600px; margin-bottom: 24px"
                :clickable="!!shared.users[0]"
                @click="shared.users[0] && updateUser(shared.users[0], true)"
            >
                <div style="padding: 20px; text-align: center">
                    <h2 class="welcome-text">欢迎，{{ getUserDisplayName(shared.users[0]) }}！</h2>

                    <div v-if="shared.users[0]" class="rating-container">
                        <RatingPlate
                            :ra="shared.users[0].data.rating as number"
                            :small="false"
                            class="large-rating"
                        />
                    </div>
                    <div v-else class="loading-text">
                        <s-chip variant="assist" @click="router.push('/users')">
                            请在
                            <a href="javascript:void(0)">用户</a>
                            中绑定并更新用户
                        </s-chip>
                    </div>
                </div>
            </s-card>
        </s-tooltip>

        <!-- 友链导航 -->
        <div class="links-section">
            <a
                href="https://www.diving-fish.com/maimaidx/prober/"
                target="_blank"
                class="link-wrapper"
            >
                <s-card type="outlined" clickable class="link-card">
                    <div class="link-content">
                        <s-icon>set_meal</s-icon>
                        <div class="link-text">
                            <h4 class="link-title">水鱼查分器</h4>
                            <p class="link-description">本站使用的成绩同步网站</p>
                        </div>
                    </div>
                </s-card>
            </a>

            <a href="https://nearcade.phi.zone/" target="_blank" class="link-wrapper">
                <s-card type="outlined" clickable class="link-card">
                    <div class="link-content">
                        <s-icon>map</s-icon>
                        <div class="link-text">
                            <h4 class="link-title">nearcade</h4>
                            <p class="link-description">找找附近的机厅</p>
                        </div>
                    </div>
                </s-card>
            </a>
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
        width: 120px;
        height: 120px;
        margin-bottom: 15px;
    }

    .project-title {
        margin-top: 0;
        margin-bottom: 0;
    }

    .page-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: calc(100vh - 64px - 6rem);
        width: 100%;
        padding: 20px;
        padding-top: calc(20px + var(--announcement-height, 0px));
        box-sizing: border-box;
    }

    .announcement-list {
        position: fixed;
        left: calc(0.5rem + var(--content-left-padding));
        right: 0.5rem;
        top: 0.5rem;
        z-index: 10;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        --announcement-height: auto;
    }

    .announcement-item {
        border-radius: 8px;
    }

    .announcement-content {
        display: flex;
        align-items: center;
        padding: 12px 16px;
        gap: 12px;
    }

    .announcement-content s-icon {
        font-size: 20px;
        flex-shrink: 0;
    }

    .announcement-content span {
        flex: 1;
    }

    .pwa-install-prompt {
        display: block;

        @media (display-mode: standalone) {
            display: none;
        }
    }

    .welcome-text {
        margin-bottom: 16px;
        font-size: 1.5rem;
        font-weight: 500;
    }

    .rating-container {
        display: flex;
        justify-content: center;
        margin: 25px 0;
    }

    .large-rating {
        transform: scale(1.2);
    }

    .loading-text {
        margin: 25px 0;
        font-size: 1.1rem;
    }

    .loading-text a {
        color: var(--primary-color, #1976d2);
        text-decoration: underline;
    }
    .loading-text a:hover {
        color: var(--primary-color-hover, #1565c0);
    }

    s-button {
        margin: 0;
    }
    s-card {
        text-align: center;
    }

    .links-section {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        width: 100%;
        max-width: 600px;
    }

    @media (max-width: 460px) {
        .links-section {
            grid-template-columns: 1fr;
            gap: unset;
        }
    }

    .link-wrapper {
        text-decoration: none;
        color: inherit;
    }

    .link-card {
        width: 100%;
    }

    .link-content {
        display: flex;
        flex-direction: row;
        align-items: center;
        height: 100%;
        padding: 16px;
        gap: 16px;
    }

    .link-content s-icon {
        font-size: 24px;
        flex-shrink: 0;
    }

    .link-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        text-align: left;
    }

    .link-title {
        font-size: 14px;
        font-weight: 500;
        line-height: 1.2;
        margin: 0;
    }

    .link-description {
        font-size: 12px;
        line-height: 1.2;
        margin: 0;
        color: var(--text-secondary, #666);
    }
</style>
