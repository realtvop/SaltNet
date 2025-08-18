<script setup lang="ts">
    const buildTime = window.spec?.currentVersionBuildTime;

    function openGitHub() {
        window.open("https://github.com/realtvop/SaltNet", "_blank");
    }
</script>

<template>
    <div class="page-content">
        <div class="header-content">
            <img src="/favicon.png" alt="Favicon" class="favicon-image favicon" />
            <h1 class="project-title">SaltNet</h1>
        </div>
        <s-card type="filled" style="width: 100%; max-width: 600px; margin-bottom: 24px">
            <div style="padding: 20px; text-align: center">
                <h2 class="welcome-text">
                    舞萌 DX 查分器
                    <br />
                    <div class="build-time-text">
                        当前版本构建时间:
                        {{
                            buildTime === "%buildTime%"
                                ? "开发版本"
                                : new Date(Number(buildTime)).toLocaleString()
                        }}
                    </div>
                    <br />
                    Made with ❤️ by realtvop
                </h2>
            </div>
        </s-card>

        <div class="links-section">
            <a
                href="https://docs.salt.realtvop.top/basis/intro/"
                target="_blank"
                class="link-wrapper"
            >
                <s-card type="outlined" clickable class="link-card">
                    <div class="link-content">
                        <s-icon>help_center</s-icon>
                        <div class="link-text">
                            <h4 class="link-title">SaltNet 帮助</h4>
                            <p class="link-description">SaltNet 使用帮助</p>
                        </div>
                    </div>
                </s-card>
            </a>

            <a href="https://qm.qq.com/q/mwhqbv7FpQ" target="_blank" class="link-wrapper">
                <s-card type="outlined" clickable class="link-card">
                    <div class="link-content">
                        <s-icon>chat</s-icon>
                        <div class="link-text">
                            <h4 class="link-title">QQ 用户群</h4>
                            <p class="link-description">638052667</p>
                        </div>
                    </div>
                </s-card>
            </a>
        </div>

        <div class="github-footer">
            <s-chip variant="outlined" @click="openGitHub">
                <s-icon>code</s-icon>
                realtvop/SaltNet
            </s-chip>
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
        min-height: calc(
            100vh - 64px - 40px - 6rem
        ); /* Adjust based on app bar and potential footer/padding */
        width: 100%;
        padding: 20px;
        box-sizing: border-box;
    }

    .welcome-text {
        margin-bottom: 16px;
        font-size: 1.5rem;
        font-weight: 500;
    }

    .build-time-text {
        font-size: 1rem;
        font-weight: normal;
        opacity: 0.8;
    }

    .rating-container {
        display: flex;
        justify-content: center;
        margin: 25px 0;
    }

    .large-rating {
        transform: scale(1.5);
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

    .github-footer {
        margin-top: 10px;
        text-align: center;
        width: 100%;
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
        width: 100%;
        max-width: 600px;
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
