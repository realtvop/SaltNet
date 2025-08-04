<script setup lang="ts">
    import { defineProps } from "vue";

    import plates from "@/assets/plates.json";

    const props = defineProps<{
        ra: number;
    }>();
</script>

<template>
    <svg xmlns="http://www.w3.org/2000/svg" width="100px" height="20px">
        <image
            :href="plates[getPlateId(props.ra) as keyof typeof plates]"
            x="0"
            y="0"
            height="1.2em"
        />
        <text
            v-for="i in 5"
            :key="i"
            :x="`${5.2 + (i - 1) * 0.8}em`"
            y="1.3em"
            text-anchor="middle"
            font-family="Roboto"
            font-size="0.6em"
            font-weight="bold"
            transform="scale(1, 1.1)"
            fill="#FCD41B"
        >
            {{ props.ra.toString()[props.ra.toString().length - (6 - i)] ?? "" }}
        </text>
    </svg>
</template>

<script lang="ts">
    export function getPlateId(rating: number): string {
        const levels = [1000, 2000, 4000, 7000, 10000, 12000, 13000, 14000, 14500, 15000];

        if (rating < levels[0]) return "01";
        if (rating >= levels[9]) return "11";

        const plateIndex = levels.findIndex(
            (threshold, i) => rating >= threshold && rating < levels[i + 1]
        );

        return plateIndex >= 0 ? (plateIndex + 2).toString().padStart(2, "0") : "00";
    }
</script>

<style scoped>
    svg {
        margin-left: 5px;
        transform: scale(1.25);
        transform-origin: left left;
    }
</style>
