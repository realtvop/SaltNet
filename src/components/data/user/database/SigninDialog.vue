<template>
    <mdui-dialog
        ref="dialogRef"
        :open="open"
        headline=""
        description=""
        @open="markDialogOpen"
        @close="handleClose"
        close-on-esc
    >
        <mdui-top-app-bar slot="header">
            <mdui-button-icon icon="close" @click="requestClose"></mdui-button-icon>
            <mdui-top-app-bar-title>登录 SaltNet</mdui-top-app-bar-title>
        </mdui-top-app-bar>

        <div class="dialog-body">
            <mdui-text-field
                label="邮箱或用户名"
                :value="identifier"
                @input="identifier = $event.target.value || ''"
                autocomplete="username"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                required
                clearable
                :disabled="isLoading"
            ></mdui-text-field>

            <mdui-text-field
                label="密码"
                type="password"
                :value="password"
                @input="password = $event.target.value || ''"
                autocomplete="current-password"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                toggle-password-visibility
                required
                :disabled="isLoading"
                @keydown.enter="handleLogin"
            ></mdui-text-field>

            <mdui-button full-width @click="handleLogin" :loading="isLoading" :disabled="!canSubmit">
                登录
            </mdui-button>
        </div>
    </mdui-dialog>
</template>

<script setup lang="ts">
    import { computed, nextTick, ref, watch } from "vue";
    import { markDialogOpen, markDialogClosed } from "@/components/app/router.vue";
    import { loginSaltNet } from "./api";
    import type { SaltNetDatabaseLogin } from "./type";

    const props = defineProps<{ modelValue: boolean }>();
    const emit = defineEmits<{
        (event: "update:modelValue", value: boolean): void;
        (event: "login-success", data: SaltNetDatabaseLogin): void;
    }>();

    const dialogRef = ref<any>(null);
    const open = ref(false);

    const identifier = ref("");
    const password = ref("");
    const isLoading = ref(false);

    const canSubmit = computed(() => {
        return identifier.value.trim().length > 0 && password.value.length > 0 && !isLoading.value;
    });

    watch(
        () => props.modelValue,
        async newValue => {
            open.value = newValue;
            await nextTick();
            if (dialogRef.value) dialogRef.value.open = newValue;
        },
        { immediate: true }
    );

    const handleClose = () => {
        markDialogClosed(dialogRef.value);
        if (open.value) emit("update:modelValue", false);
    };

    const requestClose = () => {
        emit("update:modelValue", false);
    };

    const handleLogin = async () => {
        if (!canSubmit.value) return;
        
        isLoading.value = true;
        
        try {
            const result = await loginSaltNet(identifier.value.trim(), password.value);
            
            if (result) {
                emit("login-success", result);
                // Clear form
                identifier.value = "";
                password.value = "";
                requestClose();
            }
        } finally {
            isLoading.value = false;
        }
    };
</script>

<style scoped>
    .dialog-body {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    mdui-text-field {
        width: 100%;
    }
</style>
