<script setup lang="ts">
    import { onMounted, ref } from "vue";
    import { useRouter } from "vue-router";
    import { snackbar } from "mdui";
    import { useShared } from "@/components/app/shared";
    import { handleOAuthCallback, getSaltNetUser } from "@/components/data/user/database";

    const router = useRouter();
    const shared = useShared();
    const status = ref<"loading" | "success" | "error">("loading");
    const message = ref("");

    onMounted(async () => {
        const result = handleOAuthCallback();

        if (!result.success) {
            status.value = "error";
            message.value = getErrorMessage(result.error || "unknown_error");
            return;
        }

        // Handle bind success
        if (result.action === "bind") {
            status.value = "success";
            message.value = "绑定成功！";
            snackbar({ message: "第三方账号绑定成功", autoCloseDelay: 2000 });
            // Clear URL params and redirect to profile page
            setTimeout(() => {
                window.history.replaceState({}, "", window.location.pathname);
                router.push("/me");
            }, 1500);
            return;
        }

        // Handle login success
        if (result.data) {
            // Fetch complete user info
            const userInfo = await getSaltNetUser(result.data.sessionToken);
            if (userInfo) {
                result.data.id = userInfo.id;
                result.data.email = userInfo.email;
                result.data.maimaidxRegion = userInfo.maimaidxRegion;
            }

            shared.saltNetAccount = result.data;
            status.value = "success";
            message.value = result.isNew ? "注册成功！" : "登录成功！";
            snackbar({
                message: result.isNew ? "OAuth 注册成功！" : "OAuth 登录成功！",
                autoCloseDelay: 2000,
            });

            // Clear URL params and redirect
            setTimeout(() => {
                window.history.replaceState({}, "", window.location.pathname);
                router.push("/users");
            }, 1500);
        }
    });

    function getErrorMessage(error: string): string {
        const errorMessages: Record<string, string> = {
            access_denied: "授权被拒绝",
            invalid_state: "请求无效，请重试",
            oauth_failed: "OAuth 认证失败",
            link_exists: "该第三方账号已绑定其他用户",
            already_linked: "您已绑定该第三方账号",
            invalid_callback: "回调参数无效",
            unknown_error: "未知错误",
        };
        return errorMessages[error] || error;
    }
</script>

<template>
    <div class="oauth-callback-page">
        <mdui-card variant="filled" class="callback-card">
            <template v-if="status === 'loading'">
                <mdui-circular-progress></mdui-circular-progress>
                <p>正在处理登录...</p>
            </template>

            <template v-else-if="status === 'success'">
                <mdui-icon name="check_circle" class="success-icon"></mdui-icon>
                <h2>{{ message }}</h2>
                <p>正在跳转...</p>
            </template>

            <template v-else>
                <mdui-icon name="error" class="error-icon"></mdui-icon>
                <h2>登录失败</h2>
                <p>{{ message }}</p>
                <mdui-button @click="router.push('/users')">返回登录页</mdui-button>
            </template>
        </mdui-card>
    </div>
</template>

<style scoped>
    .oauth-callback-page {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 60vh;
    }

    .callback-card {
        padding: 48px;
        text-align: center;
        min-width: 300px;
    }

    .callback-card h2 {
        margin: 16px 0 8px;
    }

    .callback-card p {
        color: var(--mdui-color-on-surface-variant);
        margin-bottom: 16px;
    }

    .success-icon {
        font-size: 64px;
        color: var(--mdui-color-primary);
    }

    .error-icon {
        font-size: 64px;
        color: var(--mdui-color-error);
    }
</style>
