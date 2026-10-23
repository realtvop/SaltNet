<script setup lang="ts">
    import { onMounted, ref, watch } from "vue";
    import { useRouter } from "vue-router";
    import { snackbar, type TextField } from "mdui";
    import { markDialogClosed, markDialogOpen } from "@/components/app/router";
    import { useDialogStore } from "@/stores/dialog";
    import { handleLXNSOAuthCallback, LXNSOAuthRecoveryError } from "./oauth";
    import {
        getLXNSOAuthTransaction,
        clearCapturedLXNSOAuthCallback,
        getPendingLXNSOAuthCallback,
        parseLXNSOAuthCallback,
        type LXNSOAuthCallback,
    } from "./oauthSession";

    const props = withDefaults(
        defineProps<{
            modelValue?: boolean;
            callback?: LXNSOAuthCallback | null;
            resumePending?: boolean;
        }>(),
        { modelValue: false, callback: null, resumePending: false }
    );
    const emit = defineEmits<{
        "update:modelValue": [value: boolean];
        complete: [];
    }>();
    const router = useRouter();
    const visible = ref(props.modelValue);
    const processing = ref(false);
    const manual = ref(!props.callback);
    const needsTransfer = ref(false);
    const canRetry = ref(false);
    const returnUrl = ref("");
    const errorMessage = ref("");
    let currentCallback: LXNSOAuthCallback | null = null;

    watch(
        () => props.modelValue,
        value => {
            visible.value = value;
        }
    );

    function close(event: Event) {
        markDialogClosed(event);
        if (currentCallback) clearCapturedLXNSOAuthCallback(currentCallback.state);
        visible.value = false;
        emit("update:modelValue", false);
    }

    async function complete(callback?: LXNSOAuthCallback) {
        if (processing.value) return;
        visible.value = true;
        canRetry.value = false;
        needsTransfer.value = false;
        errorMessage.value = "";
        try {
            currentCallback = callback ?? parseLXNSOAuthCallback(returnUrl.value.trim());
            returnUrl.value = currentCallback.url;
            processing.value = true;
            await handleLXNSOAuthCallback(currentCallback);
            visible.value = false;
            emit("update:modelValue", false);
            emit("complete");
        } catch (error) {
            errorMessage.value = error instanceof Error ? error.message : "落雪绑定失败，请重试";
            needsTransfer.value = error instanceof LXNSOAuthRecoveryError && !manual.value;
            if (currentCallback) {
                try {
                    canRetry.value = Boolean(getLXNSOAuthTransaction(currentCallback.state));
                } catch {
                    // The user can still copy the return URL when storage is unavailable.
                    needsTransfer.value = !manual.value;
                }
            }
        } finally {
            processing.value = false;
        }
    }

    async function copyReturnUrl() {
        try {
            await navigator.clipboard.writeText(returnUrl.value);
            snackbar({ message: "已复制，请返回原 SaltNet 窗口继续授权", autoCloseDelay: 2000 });
        } catch {
            snackbar({ message: "请长按下方链接选择并复制", autoCloseDelay: 2000 });
        }
    }

    onMounted(async () => {
        if (!props.callback && !props.resumePending) return;
        await router.isReady();
        await useDialogStore().waitForInitialHistory();
        let callback = props.callback;
        if (!callback) {
            try {
                callback = getPendingLXNSOAuthCallback();
            } catch {
                return;
            }
        }
        if (callback) {
            manual.value = false;
            void complete(callback);
        }
    });
</script>

<template>
    <mdui-dialog
        headline="落雪授权"
        :open="visible"
        :close-on-esc="!processing"
        @open.self="markDialogOpen"
        @close.self="close"
    >
        <p v-if="processing">正在完成落雪绑定，请稍候……</p>
        <template v-else>
            <p v-if="needsTransfer">
                请复制下方回调链接，返回发起授权的 SaltNet
                应用或窗口，在用户绑定的落雪页面点击“继续落雪授权”，粘贴链接完成绑定。
            </p>
            <p v-else-if="errorMessage">{{ errorMessage }}</p>
            <p v-else>请粘贴授权完成后的完整回调链接，继续绑定。</p>
            <mdui-text-field
                v-if="manual || needsTransfer"
                label="授权回调链接"
                :value="returnUrl"
                :readonly="needsTransfer"
                @input="returnUrl = ($event.target as TextField).value"
                @click="needsTransfer && ($event.target as TextField).select()"
                autocapitalize="off"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
            ></mdui-text-field>
        </template>
        <mdui-button slot="action" variant="text" :disabled="processing" @click="visible = false">
            关闭
        </mdui-button>
        <mdui-button slot="action" v-if="needsTransfer" @click="copyReturnUrl">
            复制回调链接
        </mdui-button>
        <mdui-button
            slot="action"
            v-else-if="manual || canRetry"
            :disabled="processing"
            @click="complete(manual ? undefined : currentCallback!)"
        >
            {{ manual ? "完成绑定" : "重试" }}
        </mdui-button>
    </mdui-dialog>
</template>
