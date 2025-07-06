<script setup lang="ts">
    import RatingPlate from "@/components/user/RatingPlate.vue";
    import { useRouter } from "vue-router";
    import { useShared } from "@/utils/shared";
    import { updateUser } from "@/utils/user";

    const router = useRouter();
    const shared = useShared();

    function reloadPage() {
        window.location.reload();
    }
</script>

<template>
    <mdui-list class="announcement-list">
        <mdui-list-item nonclickable rounded active icon="update" v-if="shared.isUpdated">
            更新完成！刷新生效
            <mdui-button slot="end-icon" variant="text" style="margin-right: -1rem" @click="reloadPage">
                立即刷新
            </mdui-button>
        </mdui-list-item>
        <mdui-list-item
            class="pwa-install-prompt"
            rounded
            icon="install_mobile"
            href="https://docs.salt.realtvop.top/basis/pwa/"
            target="_blank"
        >
            想将 SaltNet 安装为应用吗？点击查看教程
        </mdui-list-item>
    </mdui-list>
    <div class="page-content">
        <div class="header-content">
            <img src="/favicon.png" alt="Favicon" class="favicon-image" />
            <h1 variant="display-large" class="project-title">SaltNet</h1>
        </div>
        <mdui-tooltip content="点击更新成绩" placement="bottom">
            <mdui-card
                variant="filled"
                style="width: 100%; max-width: 600px; margin-bottom: 24px"
                :clickable="shared.users[0]"
                @click="shared.users[0] && updateUser(shared.users[0])"
            >
                <div style="padding: 20px; text-align: center">
                    <mdui-typography variant="headline-medium" class="welcome-text">
                        欢迎，{{
                            shared.users[0]
                                ? shared.users[0].divingFish.name ||
                                  shared.users[0].inGame.name ||
                                  "wmc"
                                : "wmc"
                        }}
                    </mdui-typography>

                    <div v-if="shared.users[0]" class="rating-container">
                        <RatingPlate
                            :ra="shared.users[0].data.rating as number"
                            :small="false"
                            class="large-rating"
                        />
                    </div>
                    <div v-else class="loading-text">
                        <mdui-chip variant="assist" @click="router.push('/users')">
                            请在
                            <a href="javascript:void(0)">用户</a>
                            中绑定并更新用户
                        </mdui-chip>
                    </div>
                </div>
            </mdui-card>
        </mdui-tooltip>

        <!-- 友链导航 -->
        <div class="links-section">
            <a
                href="https://www.diving-fish.com/maimaidx/prober/"
                target="_blank"
                class="link-wrapper"
            >
                <mdui-card variant="outlined" clickable class="link-card">
                    <div class="link-content">
                        <mdui-icon name="set_meal"></mdui-icon>
                        <div class="link-text">
                            <mdui-typography variant="title-medium">水鱼查分器</mdui-typography>
                            <mdui-typography
                                variant="body-small"
                                style="color: var(--mdui-color-on-surface-variant)"
                            >
                                本站使用的成绩同步网站
                            </mdui-typography>
                        </div>
                    </div>
                </mdui-card>
            </a>

            <a href="https://nearcade.phi.zone/" target="_blank" class="link-wrapper">
                <mdui-card variant="outlined" clickable class="link-card">
                    <div class="link-content">
                        <mdui-icon name="map"></mdui-icon>
                        <div class="link-text">
                            <mdui-typography variant="title-medium">nearcade</mdui-typography>
                            <mdui-typography
                                variant="body-small"
                                style="color: var(--mdui-color-on-surface-variant)"
                            >
                                找找附近的机厅
                            </mdui-typography>
                        </div>
                    </div>
                </mdui-card>
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
        /* top: 64px; */
        left: var(--content-left-padding);
        right: 0;
        width: calc(100% - var(--content-left-padding));
        z-index: 10;
        background-color: var(--mdui-color-surface);
        border-bottom: 1px solid var(--mdui-color-outline-variant);
        --announcement-height: auto;
    }

    .pwa-install-prompt {
        display: block;

        @media (display-mode: standalone) {
            display: none;
        }
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
        margin: 25px 0;
        font-size: 1.1rem;
    }

    .loading-text a {
        color: var(--mdui-color-primary);
        text-decoration: underline;
    }
    .loading-text a:hover {
        color: var(--mdui-color-primary-hover);
    }

    mdui-button {
        margin: 0;
    }
    mdui-card {
        text-align: center;
    }

    .links-section {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        width: 100%;
        max-width: 600px;
        margin-top: 24px;
    }

    @media (max-width: 460px) {
        .links-section {
            grid-template-columns: 1fr;
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

    .link-content mdui-icon {
        font-size: 24px;
        flex-shrink: 0;
    }

    .link-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        text-align: left;
    }

    .link-text mdui-typography[variant="title-medium"] {
        font-size: 14px;
        font-weight: 500;
        line-height: 1.2;
    }

    .link-text mdui-typography[variant="body-small"] {
        font-size: 12px;
        line-height: 1.2;
    }
</style>
