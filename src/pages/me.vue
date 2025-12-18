<script setup lang="ts">
    import { ref, computed } from "vue";
    import { useRouter } from "vue-router";
    import { useShared } from "@/components/app/shared";
    import { markDialogOpen, markDialogClosed } from "@/components/app/router.vue";
    import { confirm } from "mdui";
    import {
        logoutSaltNet,
        updateSaltNetRegion,
        changePassword,
        bindEmail,
        changeEmail,
    } from "@/components/data/user/database/api";
    import type { MaimaidxRegion } from "@/components/data/user/database/type";

    const shared = useShared();
    const router = useRouter();

    // Region labels
    const regionLabels: Record<MaimaidxRegion, string> = {
        jp: "日服",
        cn: "国服",
        ex: "国际服",
    };

    // Dialog states
    const isEmailDialogOpen = ref(false);
    const isPasswordDialogOpen = ref(false);

    // Form data
    const emailForm = ref({
        email: "",
        password: "",
    });
    const passwordForm = ref({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });

    // Computed
    const hasEmail = computed(() => !!shared.saltNetAccount?.email);

    // Handlers
    function handleLogout() {
        if (!shared.saltNetAccount) return;
        confirm({
            headline: "确认退出登录？",
            confirmText: "退出",
            cancelText: "取消",
            closeOnEsc: true,
            closeOnOverlayClick: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
            onConfirm: async () => {
                await logoutSaltNet(shared.saltNetAccount!.sessionToken);
                shared.saltNetAccount = null;
                router.push("/users");
            },
        });
    }

    async function handleRegionChange(event: Event) {
        const target = event.target as HTMLSelectElement;
        const region = target.value as MaimaidxRegion;
        if (!shared.saltNetAccount) return;
        const success = await updateSaltNetRegion(shared.saltNetAccount.sessionToken, region);
        if (success) {
            shared.saltNetAccount.maimaidxRegion = region;
        }
    }

    function openEmailDialog() {
        emailForm.value = { email: "", password: "" };
        isEmailDialogOpen.value = true;
    }

    function openPasswordDialog() {
        passwordForm.value = { currentPassword: "", newPassword: "", confirmPassword: "" };
        isPasswordDialogOpen.value = true;
    }

    async function handleEmailSubmit() {
        if (!shared.saltNetAccount) return;

        if (hasEmail.value) {
            // Change email - requires password
            if (!emailForm.value.password) return;
            const success = await changeEmail(
                shared.saltNetAccount.sessionToken,
                emailForm.value.email,
                emailForm.value.password
            );
            if (success) isEmailDialogOpen.value = false;
        } else {
            // Bind email
            const success = await bindEmail(
                shared.saltNetAccount.sessionToken,
                emailForm.value.email
            );
            if (success) isEmailDialogOpen.value = false;
        }
    }

    async function handlePasswordSubmit() {
        if (!shared.saltNetAccount) return;
        if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
            return;
        }
        const success = await changePassword(
            shared.saltNetAccount.sessionToken,
            passwordForm.value.currentPassword,
            passwordForm.value.newPassword
        );
        if (success) isPasswordDialogOpen.value = false;
    }
</script>

<template>
    <div class="me-page" v-if="shared.saltNetAccount">
        <mdui-card variant="filled" class="profile-card">
            <div class="profile-header">
                <mdui-icon name="account_circle" class="avatar-icon"></mdui-icon>
                <div class="profile-info">
                    <h2>{{ shared.saltNetAccount.username }}</h2>
                    <span class="email-text">
                        {{ shared.saltNetAccount.email || "未绑定邮箱" }}
                    </span>
                </div>
            </div>
        </mdui-card>

        <mdui-card variant="outlined" class="settings-card">
            <h3>账户设置</h3>

            <mdui-list>
                <mdui-list-item @click="openEmailDialog">
                    <mdui-icon slot="icon" name="email"></mdui-icon>
                    {{ hasEmail ? "修改邮箱" : "绑定邮箱" }}
                    <mdui-icon slot="end-icon" name="chevron_right"></mdui-icon>
                </mdui-list-item>

                <mdui-list-item
                    @click="openPasswordDialog"
                    :disabled="!hasEmail"
                >
                    <mdui-icon slot="icon" name="lock"></mdui-icon>
                    修改密码
                    <span v-if="!hasEmail" class="hint-text">（需先绑定邮箱）</span>
                    <mdui-icon slot="end-icon" name="chevron_right"></mdui-icon>
                </mdui-list-item>

                <mdui-list-item>
                    <mdui-icon slot="icon" name="public"></mdui-icon>
                    <div class="region-select-container">
                        <span>区域</span>
                        <mdui-select
                            :value="shared.saltNetAccount?.maimaidxRegion || 'ex'"
                            @change="handleRegionChange"
                            class="region-select"
                        >
                            <mdui-menu-item
                                v-for="(label, value) in regionLabels"
                                :key="value"
                                :value="value"
                            >
                                {{ label }}
                            </mdui-menu-item>
                        </mdui-select>
                    </div>
                </mdui-list-item>
            </mdui-list>
        </mdui-card>

        <div class="logout-container">
            <mdui-button variant="outlined" @click="handleLogout" full-width>
                退出登录
            </mdui-button>
        </div>

        <!-- Email Dialog -->
        <mdui-dialog
            :open="isEmailDialogOpen"
            @open="markDialogOpen"
            @closed="isEmailDialogOpen = false; markDialogClosed($event)"
            close-on-overlay-click
            close-on-esc
        >
            <span slot="headline">{{ hasEmail ? "修改邮箱" : "绑定邮箱" }}</span>
            <div slot="description" class="dialog-form">
                <mdui-text-field
                    label="邮箱地址"
                    type="email"
                    v-model="emailForm.email"
                ></mdui-text-field>
                <mdui-text-field
                    v-if="hasEmail"
                    label="当前密码"
                    type="password"
                    toggle-password
                    v-model="emailForm.password"
                ></mdui-text-field>
            </div>
            <mdui-button slot="action" variant="text" @click="isEmailDialogOpen = false">
                取消
            </mdui-button>
            <mdui-button slot="action" @click="handleEmailSubmit">确认</mdui-button>
        </mdui-dialog>

        <!-- Password Dialog -->
        <mdui-dialog
            :open="isPasswordDialogOpen"
            @open="markDialogOpen"
            @closed="isPasswordDialogOpen = false; markDialogClosed($event)"
            close-on-overlay-click
            close-on-esc
        >
            <span slot="headline">修改密码</span>
            <div slot="description" class="dialog-form">
                <mdui-text-field
                    label="当前密码"
                    type="password"
                    toggle-password
                    v-model="passwordForm.currentPassword"
                ></mdui-text-field>
                <mdui-text-field
                    label="新密码"
                    type="password"
                    toggle-password
                    v-model="passwordForm.newPassword"
                ></mdui-text-field>
                <mdui-text-field
                    label="确认新密码"
                    type="password"
                    toggle-password
                    v-model="passwordForm.confirmPassword"
                    :helper="passwordForm.newPassword !== passwordForm.confirmPassword ? '密码不匹配' : ''"
                ></mdui-text-field>
            </div>
            <mdui-button slot="action" variant="text" @click="isPasswordDialogOpen = false">
                取消
            </mdui-button>
            <mdui-button
                slot="action"
                @click="handlePasswordSubmit"
                :disabled="passwordForm.newPassword !== passwordForm.confirmPassword"
            >
                确认
            </mdui-button>
        </mdui-dialog>
    </div>

    <!-- Not logged in state -->
    <div class="me-page not-logged-in" v-else>
        <mdui-card variant="filled" class="login-prompt-card">
            <mdui-icon name="account_circle" class="large-icon"></mdui-icon>
            <h2>未登录</h2>
            <p>请先登录 SaltNet 账户</p>
            <mdui-button @click="router.push('/users')">前往登录</mdui-button>
        </mdui-card>
    </div>
</template>

<style scoped>
    .me-page {
        display: flex;
        flex-direction: column;
        gap: 16px;
        max-width: 600px;
        margin: 0 auto;
    }

    .profile-card {
        padding: 24px;
    }

    .profile-header {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .avatar-icon {
        font-size: 64px;
        color: var(--mdui-color-primary);
    }

    .profile-info {
        display: flex;
        flex-direction: column;
    }

    .profile-info h2 {
        margin: 0;
        font-size: 1.5rem;
    }

    .email-text {
        color: var(--mdui-color-on-surface-variant);
        font-size: 0.9rem;
    }

    .settings-card {
        padding: 16px;
    }

    .settings-card h3 {
        margin: 0 0 8px 8px;
        font-size: 1rem;
        color: var(--mdui-color-on-surface-variant);
    }

    .hint-text {
        font-size: 0.8rem;
        color: var(--mdui-color-on-surface-variant);
        margin-left: 8px;
    }

    .region-select-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
    }

    .region-select {
        min-width: 120px;
    }

    .logout-container {
        margin-top: 16px;
    }

    .dialog-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding-top: 16px;
    }

    .not-logged-in {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 50vh;
    }

    .login-prompt-card {
        padding: 48px;
        text-align: center;
    }

    .large-icon {
        font-size: 80px;
        color: var(--mdui-color-on-surface-variant);
    }

    .login-prompt-card h2 {
        margin: 16px 0 8px;
    }

    .login-prompt-card p {
        color: var(--mdui-color-on-surface-variant);
        margin-bottom: 24px;
    }
</style>
