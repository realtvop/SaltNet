import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import localForage from 'localforage';

import type { User } from "@/types/user";

// MARK: shared
export const useShared = defineStore('shared', () => {
    const users = ref<User[]>([]);

    localForage.getItem<User[]>("users").then(v => {
        if (Array.isArray(v)) users.value = v;
    });

    watch(users, (newUsers, oldUsers) => {
        if (newUsers !== oldUsers) {
            localForage.setItem("users", JSON.parse(JSON.stringify(newUsers))).catch(err => {
                console.error("Failed to save users:", err);
            });
        }
    }, { deep: true, });

    return { users };
});