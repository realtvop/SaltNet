<script setup lang="ts">
    import type { Chart } from "@/components/data/music/type";
    import type { DivingFishMusicChart } from "@/components/integrations/diving-fish/type";
    import B50ToRender from "@/components/rendering/b50.vue";
    import { useRoute } from "vue-router";
    import { ref, onMounted } from "vue";

    const route = useRoute();

    const sd = ref<Chart[]>([]);
    const dx = ref<Chart[]>([]);
    const playerName = ref<string>((route.query.n as string) || "wmc");
    const playerSecondaryName = ref<string | null>((route.query.o as string) || null);
    const playerRating = ref<number | null>(
        route.query.r ? parseInt(route.query.r as string) : null
    );
    const isLoading = ref<boolean>(true);

    function dfToSimpChart(ori: DivingFishMusicChart): Chart {
        return {
            score: {
                rankRate: ori.rate,
                achievements: ori.achievements,
                comboStatus: ori.fc,
                syncStatus: ori.fs,
                deluxeRating: ori.ra,
            },
            info: {
                grade: ori.level_index,
                constant: ori.ds,
            },
            music: {
                info: {
                    id: ori.song_id,
                    title: ori.title,
                    type: ori.type,
                },
            },
        } as Chart;
    }

    async function fetchB50FromQQ(qq: string) {
        isLoading.value = true;
        try {
            const apiUrl = import.meta.env.VITE_API_URL || "";
            const fallbackUrl = import.meta.env.VITE_API_FALLBACK_URL || "";

            let response: Response;
            try {
                response = await fetch(`${apiUrl}/updateUserFromDFByQQ`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ qq }),
                });
            } catch {
                response = await fetch(`${fallbackUrl}/updateUserFromDFByQQ`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ qq }),
                });
            }

            if (!response.ok) {
                throw new Error(`Failed to fetch data: ${response.status}`);
            }

            const data = await response.json();

            playerName.value = data.userName || "Unknown";
            playerRating.value = data.rating || null;

            if (data.b50) {
                dx.value = (data.b50.dx || []).map(dfToSimpChart);
                sd.value = (data.b50.sd || []).map(dfToSimpChart);
            }
        } catch (error) {
            console.error("Error fetching B50 from QQ:", error);
        } finally {
            isLoading.value = false;
        }
    }

    onMounted(async () => {
        const fromDFQQ = route.query.fromDFQQ as string;

        if (fromDFQQ) {
            await fetchB50FromQQ(fromDFQQ);
        } else {
            const sdo = JSON.parse((route.query.s as string) || "[]");
            const dxo = JSON.parse((route.query.d as string) || "[]");

            if (dxo) {
                for (const chart of dxo as DivingFishMusicChart[]) {
                    dx.value.push(dfToSimpChart(chart));
                }
            }
            if (sdo) {
                for (const chart of sdo as DivingFishMusicChart[]) {
                    sd.value.push(dfToSimpChart(chart));
                }
            }

            isLoading.value = false;
        }
    });
</script>

<template>
    <div
        v-if="isLoading"
        style="display: flex; justify-content: center; align-items: center; height: 100vh"
    >
        <mdui-circular-progress></mdui-circular-progress>
    </div>
    <B50ToRender
        v-else
        :b50-sd-charts="sd"
        :b50-dx-charts="dx"
        :player-name="playerName"
        :player-secondary-name="playerSecondaryName"
        :player-rating="playerRating"
        style="margin-left: -80px"
    />
</template>
