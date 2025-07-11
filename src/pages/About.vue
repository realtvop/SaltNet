<script setup lang="ts">
    const buildTime = window.spec?.currentVersionBuildTime;
</script>

<template>
    <div class="page-content">
        <div class="header-content">
            <img src="/favicon.png" alt="Favicon" class="favicon-image favicon" />
            <h1 variant="display-large" class="project-title">SaltNet</h1>
        </div>
        <mdui-card variant="filled" style="width: 100%; max-width: 600px; margin-bottom: 24px">
            <div style="padding: 20px; text-align: center">
                <mdui-typography variant="headline-medium" class="welcome-text">
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
                </mdui-typography>
            </div>
        </mdui-card>

        <a href="https://docs.salt.realtvop.top/basis/intro/" target="_blank" class="link-wrapper">
            <mdui-card variant="outlined" clickable class="link-card">
                <div class="link-content">
                    <mdui-icon name="help_center"></mdui-icon>
                    <div class="link-text">
                        <mdui-typography variant="title-medium">SaltNet 帮助</mdui-typography>
                        <mdui-typography
                            variant="body-small"
                            style="color: var(--mdui-color-on-surface-variant)"
                        >
                            SaltNet 使用帮助
                        </mdui-typography>
                    </div>
                </div>
            </mdui-card>
        </a>

        <div class="github-footer">
            <mdui-chip
                variant="outlined"
                icon="code"
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
        min-height: calc(
            100vh - 64px - 40px - 6rem
        ); /* Adjust based on app bar and potential footer/padding */
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
        margin-top: 10px;
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
