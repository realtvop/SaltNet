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
            <mdui-top-app-bar-title>注册 SaltNet</mdui-top-app-bar-title>
        </mdui-top-app-bar>

        <div class="dialog-body">
            <mdui-text-field
                label="用户名"
                :value="userName"
                @input="userName = $event.target.value || ''"
                autocomplete="username"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                required
                clearable
                :disabled="isLoading"
            ></mdui-text-field>

            <mdui-text-field
                label="邮箱（选填）"
                type="email"
                :value="email"
                @input="email = $event.target.value || ''"
                autocomplete="email"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                clearable
                :disabled="isLoading"
            ></mdui-text-field>

            <mdui-text-field
                label="密码"
                type="password"
                :value="password"
                @input="password = $event.target.value || ''"
                autocomplete="new-password"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                toggle-password-visibility
                required
                :disabled="isLoading"
                helper="8-32 个字符，需包含大小写字母和数字"
                @keydown.enter="handleRegister"
            ></mdui-text-field>

            <mdui-button full-width @click="handleRegister" :loading="isLoading" :disabled="!canSubmit">
                注册
            </mdui-button>
        </div>
    </mdui-dialog>
</template>

<script setup lang="ts">
    import { computed, nextTick, ref, watch } from "vue";
    import { markDialogOpen, markDialogClosed } from "@/components/app/router.vue";
    import { registerSaltNet } from "./api";
    import type { SaltNetDatabaseLogin } from "./type";

    const props = defineProps<{ modelValue: boolean }>();
    const emit = defineEmits<{
        (event: "update:modelValue", value: boolean): void;
        (event: "register-success", data: SaltNetDatabaseLogin): void;
    }>();

    const dialogRef = ref<any>(null);
    const open = ref(false);

    const userName = ref("");
    const password = ref("");
    const email = ref("");
    const isLoading = ref(false);

    const canSubmit = computed(() => {
        return userName.value.trim().length >= 2 && password.value.length >= 8 && !isLoading.value;
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

    const handleRegister = async () => {
        if (!canSubmit.value) return;
        
        isLoading.value = true;
        
        try {
            const result = await registerSaltNet(
                userName.value.trim(),
                password.value,
                email.value.trim() || undefined
            );
            
            if (result) {
                emit("register-success", result);
                // Clear form
                userName.value = "";
                password.value = "";
                email.value = "";
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
