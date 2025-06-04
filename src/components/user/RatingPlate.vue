<script setup lang="ts">
    import { defineProps } from "vue";

    import plates from "@/assets/plates";
    import { getPlateId } from "@/utils/genPlate";

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
            :x="`${4.9 + (i - 1) * 0.8}em`"
            y="1.45em"
            font-family="Monaco, 'JetBrains Mono', Monospaced, monospace"
            font-size="0.6em"
            fill="#FCD41B"
        >
            {{ props.ra.toString()[props.ra.toString().length - (6 - i)] ?? "" }}
        </text>
    </svg>
</template>

<style scoped>
    svg {
        margin-left: 5px;
        transform: scale(1.25);
        transform-origin: left left;
    }
</style>
