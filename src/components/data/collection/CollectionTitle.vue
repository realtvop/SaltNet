<script setup lang="ts">
    import type { Title } from "./type";
    import { TitleColor } from "./type";

    defineProps<{
        title: Title;
    }>();

    function colorClass(color: TitleColor): string {
        switch (color) {
            case TitleColor.Bronze:
                return "title-color-bronze";
            case TitleColor.Silver:
                return "title-color-silver";
            case TitleColor.Gold:
                return "title-color-gold";
            case TitleColor.Rainbow:
                return "title-color-rainbow";
            default:
                return "title-color-normal";
        }
    }
</script>

<template>
    <div class="title-color-wrapper">
        <div class="title-color-indicator" :class="colorClass(title.color)"></div>
        <h3 class="title-name">{{ title.name }}</h3>
    </div>
</template>

<style scoped>
    .title-color-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: fit-content;
        min-width: 120px;
        min-height: 24px;
        max-width: 100%;
    }

    .title-color-indicator {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 1;
        width: 100%;
        height: 100%;
        border-radius: 30px;
    }

    .title-name {
        position: relative;
        z-index: 2;
        display: inline-block;
        max-width: 100%;
        margin: 0;
        padding: 3px 20px;
        overflow: hidden;
        color: rgba(0, 0, 0, 0.87);
        font-size: 16px;
        font-weight: 500;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .title-color-normal {
        background-color: #eaeaea;
    }

    .title-color-bronze {
        background: #f69b6c;
        box-shadow: 0 2px 4px rgba(205, 127, 50, 0.3);
    }

    .title-color-silver {
        background: #e2e3f4;
        box-shadow: 0 2px 4px rgba(192, 192, 192, 0.3);
    }

    .title-color-gold {
        background: #fbcd0d;
        box-shadow: 0 2px 4px rgba(255, 215, 0, 0.3);
    }

    .title-color-rainbow {
        background: repeating-linear-gradient(
            135deg,
            #f86f56,
            #f86f56 20px,
            #fcd562 20px,
            #fcd562 40px,
            #feef6f 40px,
            #feef6f 60px,
            #c1f640 60px,
            #c1f640 80px,
            #86def9 80px,
            #86def9 100px
        );
        box-shadow: 0 2px 8px rgba(255, 255, 255, 0.4);
    }
</style>
