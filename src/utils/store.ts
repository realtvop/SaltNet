import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import localForage from 'localforage';

import type { User } from "@/types/user";

export const useUsersStore = defineStore('users', () => {
    const users = ref<User[]>([]);

    watch(users, (newUsers) => {
        console.log("Users updated:", newUsers);
    });

    localForage.getItem<User[]>("users").then(v => {
        if (Array.isArray(v)) users.value = v;
    });

    return { users };
});
