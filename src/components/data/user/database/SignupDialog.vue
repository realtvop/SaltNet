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
            <mdui-button-icon icon="close" @click="handleClose"></mdui-button-icon>
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
            ></mdui-text-field>

            <mdui-text-field
                label="邮箱"
                type="email"
                :value="email"
                @input="email = $event.target.value || ''"
                autocomplete="email"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                clearable
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
            ></mdui-text-field>

            <mdui-button fullwidth>注册</mdui-button>
        </div>
    </mdui-dialog>
</template>

<script setup lang="ts">
    import { defineEmits, defineProps, nextTick, ref, watch } from "vue";
    import { markDialogOpen, markDialogClosed } from "@/components/app/router.vue";

    const props = defineProps<{ modelValue: boolean }>();
    const emit = defineEmits<{
        (event: "update:modelValue", value: boolean): void;
    }>();

    const dialogRef = ref<any>(null);
    const open = ref(false);

    const userName = ref("");
    const password = ref("");
    const email = ref("");

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
        emit("update:modelValue", false);
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
