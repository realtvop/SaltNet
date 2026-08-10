<script setup lang="ts">
    import { computed, ref, watch } from "vue";
    import { copyTextToClipboard } from "@/components/app/utils";
    import { markDialogClosed, markDialogOpen } from "@/components/app/router";
    import { useShared } from "@/components/app/shared";
    import ChartInfoDialog from "@/components/data/chart/ChartInfo.vue";
    import type { Chart } from "@/components/data/music/type";
    import { getCollectionImageURL } from "@/components/integrations/assets";
    import PlateProgress from "./PlateProgress.vue";
    import {
        type Collection,
        type CollectionRequired,
        CollectionKind,
        type Plate,
        type Title,
        TitleColor,
    } from "./type";
    import { isPlateScoreEvaluable } from "./versionPlate";

    const props = defineProps<{
        open: boolean;
        collection: Collection | null;
    }>();
    const emit = defineEmits<{ (event: "update:open", value: boolean): void }>();

    const shared = useShared();
    const dialogRef = ref<any>(null);
    const expandedRequirement = ref<number | null>(null);
    const chartInfoDialog = ref<{ open: boolean; chart: Chart | null }>({
        open: false,
        chart: null,
    });

    const currentUser = computed(() => shared.users[0] ?? null);
    const collectionTypeName = computed(() => {
        switch (props.collection?.type) {
            case CollectionKind.Title:
                return "称号";
            case CollectionKind.Icon:
                return "头像";
            case CollectionKind.Plate:
                return "姓名框";
            case CollectionKind.Frame:
                return "背景";
            case CollectionKind.Character:
                return "旅行伙伴";
            case CollectionKind.Partner:
                return "搭档";
            default:
                return "收藏品";
        }
    });
    const imageUrl = computed(() => {
        if (!props.collection) return "";
        const typePaths: Partial<Record<CollectionKind, string>> = {
            [CollectionKind.Icon]: "icon",
            [CollectionKind.Plate]: "plate",
            [CollectionKind.Frame]: "frame",
            [CollectionKind.Character]: "character",
            [CollectionKind.Partner]: "partner",
        };
        const path = typePaths[props.collection.type];
        return path ? getCollectionImageURL(path, props.collection.id) : "";
    });
    const plateWithProgress = computed<Plate | null>(() => {
        if (props.collection?.type !== CollectionKind.Plate) return null;
        const plate = props.collection as Plate;
        return isPlateScoreEvaluable(plate) ? plate : null;
    });

    const difficultyNames = ["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"];

    function formatRequirementValue(value: string): string {
        return value.toUpperCase().replace(/P$/, "+").replace("FSD", "FSDX");
    }

    function requirementLabels(requirement: CollectionRequired): string[] {
        const difficulties = requirement.difficulties ?? [];
        const labels = [
            difficulties.length
                ? difficulties.map(index => difficultyNames[index] ?? index.toString()).join(" / ")
                : "任意难度",
        ];
        if (requirement.rate) labels.push(`RANK ${formatRequirementValue(requirement.rate)}`);
        if (requirement.fc) labels.push(formatRequirementValue(requirement.fc));
        if (requirement.fs) labels.push(formatRequirementValue(requirement.fs));
        return labels;
    }

    function titleColorClass(color: TitleColor): string {
        return `title-color-${color.toLowerCase()}`;
    }

    function handleClose(event: Event): void {
        markDialogClosed(event);
        emit("update:open", false);
        expandedRequirement.value = null;
        if (dialogRef.value) dialogRef.value.scrollTop = 0;
    }

    function openChartInfo(chart: Chart): void {
        chartInfoDialog.value = { open: true, chart };
    }

    watch(
        () => props.collection?.id,
        () => {
            expandedRequirement.value = null;
        }
    );
</script>

<template>
    <mdui-dialog
        ref="dialogRef"
        close-on-esc
        close-on-overlay-click
        :open="open"
        :fullscreen="shared.isSmallScreen"
        @open.self="markDialogOpen"
        @close.self="handleClose"
    >
        <mdui-top-app-bar slot="header">
            <mdui-button-icon
                :icon="shared.isSmallScreen ? 'arrow_back' : 'close'"
                @click="dialogRef.open = false"
            ></mdui-button-icon>
            <mdui-top-app-bar-title
                class="dialog-title"
                @click="copyTextToClipboard(collection?.name ?? '')"
            >
                {{ collection?.name ?? "收藏品详情" }}
            </mdui-top-app-bar-title>
        </mdui-top-app-bar>

        <div v-if="collection" class="collection-detail">
            <div class="collection-hero">
                <img
                    v-if="imageUrl"
                    :src="imageUrl"
                    :alt="collection.name"
                    class="collection-image"
                    :class="{
                        square:
                            collection.type === CollectionKind.Icon ||
                            collection.type === CollectionKind.Character ||
                            collection.type === CollectionKind.Partner,
                        plate: collection.type === CollectionKind.Plate,
                        frame: collection.type === CollectionKind.Frame,
                    }"
                    crossorigin="anonymous"
                />
                <div
                    v-else-if="collection.type === CollectionKind.Title"
                    class="title-preview"
                    :class="titleColorClass((collection as Title).color)"
                >
                    {{ collection.name }}
                </div>

                <div class="collection-summary">
                    <h2>{{ collection.name }}</h2>
                    <div class="metadata-chips">
                        <mdui-chip>{{ collectionTypeName }}</mdui-chip>
                        <mdui-chip @click="copyTextToClipboard(collection.id.toString())">
                            #{{ collection.id }}
                        </mdui-chip>
                        <mdui-chip v-if="collection.genre">{{ collection.genre }}</mdui-chip>
                    </div>
                    <p v-if="collection.description" class="description">
                        {{ collection.description }}
                    </p>
                </div>
            </div>

            <section v-if="collection.required?.length" class="requirements">
                <h3>获取条件</h3>
                <mdui-card
                    v-for="(requirement, index) in collection.required"
                    :key="index"
                    class="requirement-card"
                    variant="filled"
                >
                    <button
                        type="button"
                        class="requirement-header"
                        @click="expandedRequirement = expandedRequirement === index ? null : index"
                    >
                        <span class="requirement-labels">
                            <mdui-chip v-for="label in requirementLabels(requirement)" :key="label">
                                {{ label }}
                            </mdui-chip>
                        </span>
                        <span class="song-count">
                            {{ requirement.songs?.length ?? 0 }} 首
                            <mdui-icon
                                :name="
                                    expandedRequirement === index
                                        ? 'keyboard_arrow_up'
                                        : 'keyboard_arrow_down'
                                "
                            ></mdui-icon>
                        </span>
                    </button>
                    <div v-if="expandedRequirement === index" class="required-songs">
                        <div
                            v-for="song in requirement.songs ?? []"
                            :key="`${song.type}-${song.id}`"
                            class="required-song"
                        >
                            <span class="song-title">{{ song.title }}</span>
                            <span class="song-type" :data-type="song.type">
                                {{ song.type === "standard" ? "SD" : song.type.toUpperCase() }}
                            </span>
                            <span class="song-id">#{{ song.id }}</span>
                        </div>
                    </div>
                </mdui-card>
            </section>
            <section v-else class="requirements-empty">暂无结构化获取条件</section>

            <PlateProgress
                v-if="plateWithProgress"
                :plate="plateWithProgress"
                :user="currentUser"
                @open-chart="openChartInfo"
            />
        </div>
    </mdui-dialog>

    <ChartInfoDialog
        v-model:open="chartInfoDialog.open"
        :chart="chartInfoDialog.chart"
        target-user-id="0"
    />
</template>

<style scoped>
    .dialog-title {
        cursor: pointer;
    }

    .collection-detail {
        width: min(900px, 100%);
        margin: 0 auto;
        padding: 12px 4px 24px;
        box-sizing: border-box;
    }

    .collection-hero {
        display: flex;
        align-items: center;
        gap: 24px;
    }

    .collection-image {
        display: block;
        max-width: 360px;
        max-height: 220px;
        object-fit: contain;
        flex: 0 1 42%;
    }

    .collection-image.square {
        width: min(220px, 35vw);
        aspect-ratio: 1;
    }

    .collection-image.plate {
        width: min(360px, 45vw);
    }

    .collection-image.frame {
        width: min(360px, 45vw);
    }

    .title-preview {
        min-width: 240px;
        padding: 16px 24px;
        border-radius: var(--mdui-shape-corner-medium);
        text-align: center;
        font-size: 1.25rem;
        font-weight: 700;
        box-sizing: border-box;
    }

    .title-color-normal {
        background: #e7e7e7;
        color: #262626;
    }

    .title-color-bronze {
        background: linear-gradient(135deg, #8d5637, #d59a68);
        color: white;
    }

    .title-color-silver {
        background: linear-gradient(135deg, #9ca3af, #f3f4f6);
        color: #262626;
    }

    .title-color-gold {
        background: linear-gradient(135deg, #c28d00, #ffe27a);
        color: #3d2d00;
    }

    .title-color-rainbow {
        background: linear-gradient(120deg, #ff8a8a, #ffe66d, #86efac, #7dd3fc, #c4b5fd);
        color: #262626;
    }

    .collection-summary {
        min-width: 0;
        flex: 1;
    }

    .collection-summary h2 {
        margin: 0 0 12px;
        overflow-wrap: anywhere;
    }

    .metadata-chips,
    .requirement-labels {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .description {
        margin: 14px 0 0;
        color: rgb(var(--mdui-color-on-surface-variant));
        line-height: 1.6;
    }

    .requirements {
        margin-top: 24px;
    }

    .requirements h3 {
        margin: 0 0 10px;
    }

    .requirement-card + .requirement-card {
        margin-top: 8px;
    }

    .requirement-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        padding: 12px 14px;
        border: 0;
        color: inherit;
        background: transparent;
        cursor: pointer;
        text-align: left;
    }

    .song-count {
        display: flex;
        align-items: center;
        white-space: nowrap;
        color: rgb(var(--mdui-color-on-surface-variant));
    }

    .required-songs {
        max-height: 360px;
        padding: 0 14px 12px;
        overflow: auto;
    }

    .required-song {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
        border-top: 1px solid rgb(var(--mdui-color-outline-variant));
    }

    .song-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .song-type {
        padding: 2px 7px;
        border-radius: 10px;
        color: white;
        background: var(--chart-type-sd-color, #4caf50);
        font-size: 0.7rem;
        font-weight: 700;
    }

    .song-type[data-type="dx"] {
        background: var(--chart-type-dx-color, #ff9800);
    }

    .song-id {
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: 0.8rem;
    }

    .requirements-empty {
        margin-top: 24px;
        padding: 16px;
        border-radius: var(--mdui-shape-corner-medium);
        color: rgb(var(--mdui-color-on-surface-variant));
        background: rgb(var(--mdui-color-surface-container));
    }

    @media (max-width: 560px) {
        .collection-detail {
            padding-inline: 0;
        }

        .collection-hero {
            align-items: stretch;
            flex-direction: column;
            gap: 16px;
        }

        .collection-image,
        .collection-image.square,
        .collection-image.plate,
        .collection-image.frame {
            width: 100%;
            max-width: 100%;
            max-height: 240px;
            margin: 0 auto;
        }

        .title-preview {
            min-width: 0;
            width: 100%;
        }
    }
</style>
