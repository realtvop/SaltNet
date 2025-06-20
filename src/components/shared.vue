<script lang="ts">
    import { defineStore } from "pinia";
    import { ref, watch, toRaw } from "vue";
    import localForage from "localforage";

    import type { ChartsSortCached, User } from "@/types/user";

    // MARK: shared
    export const useShared = defineStore("shared", () => {
        const users = ref<User[]>([]);
        const chartsSort = ref<ChartsSortCached | null>(null);

        localForage.getItem<User[]>("users").then(v => {
            if (Array.isArray(v)) users.value = v;
        });
        localForage.getItem<ChartsSortCached>("chartsSortCached").then(v => {
            if (v) chartsSort.value = v;
        });

        watch(
            users,
            newUsers => {
                if (!newUsers) return;
                localForage.setItem("users", toRaw(newUsers)).catch(err => {
                    console.error("Failed to save users:", err);
                });
            },
            { deep: true }
        );
        watch(chartsSort, newChartsSort => {
            if (!newChartsSort) return;
            localForage.setItem("chartsSortCached", toRaw(newChartsSort)).catch(err => {
                console.error("Failed to save charts sort:", err);
            });
        });

        return { users, chartsSort };
    });
</script>
