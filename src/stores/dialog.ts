import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Dialog } from "mdui";

const DIALOG_HISTORY_STATE_KEY = "__saltnetDialog";

type DialogElement = Element & { open: boolean };

interface DialogEntry {
    id: string;
    element: DialogElement;
    closed: boolean;
    backTimer: number | null;
}

interface DialogHistoryState {
    id: string;
}

function getDialogElement(evtOrEle: Element | Event | Dialog): DialogElement | null {
    const element =
        evtOrEle instanceof Element ? evtOrEle : ((evtOrEle as Event).target as Element | null);

    return element?.localName === "mdui-dialog" ? (element as DialogElement) : null;
}

function getCurrentDialogHistoryId(): string | null {
    const state = history.state as Record<string, unknown> | null;
    const dialogState = state?.[DIALOG_HISTORY_STATE_KEY] as DialogHistoryState | undefined;
    return dialogState?.id ?? null;
}

function getMergedHistoryState(dialogId: string): Record<string, unknown> {
    const currentState = history.state;
    const baseState =
        currentState && typeof currentState === "object"
            ? (currentState as Record<string, unknown>)
            : {};

    return {
        ...baseState,
        [DIALOG_HISTORY_STATE_KEY]: { id: dialogId } satisfies DialogHistoryState,
    };
}

export const useDialogStore = defineStore("dialog", () => {
    const entries: DialogEntry[] = [];
    const openCount = ref(0);
    let nextDialogId = 0;

    const currentDialogHistoryId = computed(() => getCurrentDialogHistoryId());

    function syncOpenCount() {
        openCount.value = entries.filter(entry => !entry.closed).length;
    }

    function removeEntry(entry: DialogEntry) {
        const index = entries.indexOf(entry);
        if (index !== -1) entries.splice(index, 1);
        if (entry.backTimer !== null) window.clearTimeout(entry.backTimer);
        syncOpenCount();
    }

    function markOpen(evtOrEle: Element | Event | Dialog) {
        const element = getDialogElement(evtOrEle);
        if (!element) return;

        const existingEntry = entries.find(entry => entry.element === element);
        if (existingEntry) {
            existingEntry.closed = false;
            if (existingEntry.backTimer !== null) {
                window.clearTimeout(existingEntry.backTimer);
                existingEntry.backTimer = null;
            }
            syncOpenCount();
            return;
        }

        const entry: DialogEntry = {
            id: `dialog-${Date.now()}-${nextDialogId++}`,
            element,
            closed: false,
            backTimer: null,
        };
        entries.push(entry);
        syncOpenCount();

        history.pushState(getMergedHistoryState(entry.id), "", window.location.href);
    }

    function markClosed(evtOrEle: Element | Event | Dialog) {
        const element = getDialogElement(evtOrEle);
        if (!element) return;

        const entry = entries.find(item => item.element === element);
        if (!entry) return;

        entry.closed = true;
        syncOpenCount();

        if (entry.backTimer !== null) window.clearTimeout(entry.backTimer);
        entry.backTimer = window.setTimeout(() => {
            entry.backTimer = null;

            // 关闭动画期间被重新打开时，保留当前历史项。
            if (!entry.closed) return;

            if (getCurrentDialogHistoryId() === entry.id) {
                history.back();
            } else {
                removeEntry(entry);
            }
        }, 0);
    }

    function handlePopstate(): boolean {
        const destinationDialogId = getCurrentDialogHistoryId();
        let handled = false;

        while (entries.length && entries[entries.length - 1].id !== destinationDialogId) {
            const entry = entries.pop()!;
            handled = true;

            if (entry.backTimer !== null) window.clearTimeout(entry.backTimer);
            entry.backTimer = null;

            if (!entry.closed && entry.element.open) {
                entry.closed = true;
                entry.element.open = false;
            }
        }

        syncOpenCount();
        return handled;
    }

    function syncWithDOM() {
        const openDialogs = new Set(document.querySelectorAll<DialogElement>("mdui-dialog[open]"));
        entries.forEach(entry => {
            entry.closed = !openDialogs.has(entry.element);
        });
        syncOpenCount();
    }

    function reset() {
        entries.forEach(entry => {
            if (entry.backTimer !== null) window.clearTimeout(entry.backTimer);
        });
        entries.length = 0;
        openCount.value = 0;
        nextDialogId = 0;
    }

    return {
        openCount,
        currentDialogHistoryId,
        markOpen,
        markClosed,
        handlePopstate,
        syncWithDOM,
        reset,
    };
});
