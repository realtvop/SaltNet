import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { Dialog } from "mdui";

export const useDialogStore = defineStore("dialog", () => {
    // 状态：当前打开的 dialog 数量
    const openCount = ref(0);
    // 上一次的 hash 值
    const previousHash = ref("");
    // 待处理的后退操作数
    const pendingBacks = ref(0);

    // 计算属性
    const currentDialogHashCount = computed(() => {
        return (window.location.hash.match(/#dialog/g) || []).length;
    });

    // 标记 dialog 打开
    function markOpen(evtOrEle: Element | Event | Dialog) {
        const element =
            evtOrEle instanceof Element ? evtOrEle : ((evtOrEle as Event).target as Element);
        if (element.localName !== "mdui-dialog") return;

        openCount.value++;

        const currentHash = window.location.hash;
        const newHash = currentHash ? `${currentHash}#dialog` : "#dialog";
        history.pushState({ isDialogHistory: true }, "", newHash);
        previousHash.value = newHash;
    }

    // 标记 dialog 关闭
    function markClosed(evtOrEle: Element | Event | Dialog) {
        const element =
            evtOrEle instanceof Element ? evtOrEle : ((evtOrEle as Event).target as Element);
        if (element.localName !== "mdui-dialog") return;

        openCount.value = Math.max(0, openCount.value - 1);

        const currentHash = window.location.hash;
        if (currentHash.endsWith("#dialog")) {
            // 使用 setTimeout 确保 DOM 已更新
            setTimeout(() => {
                const dialogHashCount = (window.location.hash.match(/#dialog/g) || []).length;
                const effectiveHashCount = dialogHashCount - pendingBacks.value;

                // 如果打开的对话框数量少于 hash 中的 #dialog 数量，则回退
                if (openCount.value < effectiveHashCount) {
                    pendingBacks.value++;
                    history.back();
                }
            }, 0);
        }
    }

    // 处理 popstate 事件中的 dialog 逻辑
    function handlePopstate(): boolean {
        const currentHash = window.location.hash;

        if (pendingBacks.value > 0) {
            pendingBacks.value--;
        }

        // 处理 dialog hash
        if (previousHash.value.endsWith("#dialog")) {
            const dialogHashLength = (previousHash.value.match(/#dialog/g) || []).length;
            const actualOpenCount = document.querySelectorAll("mdui-dialog[open]").length;

            if (actualOpenCount >= dialogHashLength) {
                const dialogs = document.querySelectorAll("mdui-dialog[open]");
                const topDialog = dialogs.length > 0 ? dialogs[dialogs.length - 1] : null;
                if (topDialog) {
                    (topDialog as any).open = false;
                }
            }
            previousHash.value = currentHash;
            return true; // 已处理
        }

        // 清理意外的 #dialog hash
        if (currentHash.endsWith("#dialog")) {
            history.replaceState(
                null,
                "",
                currentHash.replace(/#dialog$/, "") ||
                    window.location.pathname + window.location.search
            );
        }

        previousHash.value = currentHash;
        return false; // 未处理，交给路由处理
    }

    // 同步实际 DOM 状态
    function syncWithDOM() {
        openCount.value = document.querySelectorAll("mdui-dialog[open]").length;
    }

    function reset() {
        openCount.value = 0;
        previousHash.value = "";
        pendingBacks.value = 0;
    }

    return {
        // State
        openCount,
        previousHash,
        pendingBacks,

        // Getters
        currentDialogHashCount,

        // Actions
        markOpen,
        markClosed,
        handlePopstate,
        syncWithDOM,
        reset,
    };
});
