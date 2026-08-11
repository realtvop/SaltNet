<script setup lang="ts">
    import { computed, ref } from "vue";
    import { copyTextToClipboard } from "@/components/app/utils";
    import { markDialogClosed, markDialogOpen } from "@/components/app/router";
    import { useShared } from "@/components/app/shared";
    import ChartInfoDialog from "@/components/data/chart/ChartInfo.vue";
    import type { Chart } from "@/components/data/music/type";
    import { getCollectionImageURL } from "@/components/integrations/assets";
    import CollectionProgress from "./CollectionProgress.vue";
    import CollectionTitle from "./CollectionTitle.vue";
    import { type Collection, type CollectionRequired, CollectionKind, type Title } from "./type";
    import { isCollectionScoreEvaluable } from "./versionPlate";

    const props = defineProps<{
        open: boolean;
        collection: Collection | null;
    }>();
    const emit = defineEmits<{ (event: "update:open", value: boolean): void }>();

    const shared = useShared();
    const dialogRef = ref<any>(null);
    const chartInfoDialog = ref<{ open: boolean; chart: Chart | null }>({
        open: false,
        chart: null,
    });

    const currentUser = computed(() => shared.users[0] ?? null);
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
    const collectionWithProgress = computed<Collection | null>(() => {
        const collection = props.collection;
        return collection && isCollectionScoreEvaluable(collection) ? collection : null;
    });

    const difficultyNames = ["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"];

    function formatRequirementValue(value: string): string {
        const normalized = value.toUpperCase();
        if (normalized === "AP") return normalized;
        return normalized.replace(/P$/, "+").replace("FSD", "FSDX");
    }

    function difficultyPresentation(requirement: CollectionRequired): {
        summary: string;
        details?: string;
    } {
        const difficulties = requirement.difficulties ?? [];
        if (!difficulties.length) return { summary: "任意一个难度" };

        const names = difficulties.map(index => difficultyNames[index] ?? index.toString());
        if (names.length === 1) return { summary: names[0] };
        return { summary: "全部指定难度", details: names.join(" · ") };
    }

    function scoreTargetValues(requirement: CollectionRequired): string[] {
        const targets: string[] = [];
        if (requirement.rate) {
            targets.push(`RANK ${formatRequirementValue(requirement.rate)}`);
        }
        if (requirement.fc) {
            targets.push(formatRequirementValue(requirement.fc));
        }
        if (requirement.fs) {
            targets.push(formatRequirementValue(requirement.fs));
        }
        return targets;
    }

    function requirementTitle(
        requirement: CollectionRequired,
        index: number,
        total: number
    ): string {
        const summary = [
            difficultyPresentation(requirement).summary,
            ...scoreTargetValues(requirement),
        ].join(" · ");
        return total > 1 ? `第 ${index + 1} 组：${summary}` : summary;
    }

    function handleClose(event: Event): void {
        markDialogClosed(event);
        emit("update:open", false);
        if (dialogRef.value) dialogRef.value.scrollTop = 0;
    }

    function openChartInfo(chart: Chart): void {
        chartInfoDialog.value = { open: true, chart };
    }
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
                <CollectionTitle
                    v-else-if="collection.type === CollectionKind.Title"
                    :title="collection as Title"
                    class="clickable"
                    @click="copyTextToClipboard(collection.name)"
                />

                <div class="collection-summary">
                    <div
                        class="collection-info-item clickable"
                        @click="copyTextToClipboard(collection.id.toString())"
                    >
                        <mdui-icon name="numbers" class="info-icon"></mdui-icon>
                        <span class="info-text">{{ collection.id }}</span>
                    </div>
                    <div v-if="collection.genre" class="collection-info-item">
                        <mdui-icon name="category" class="info-icon"></mdui-icon>
                        <span class="info-text">{{ collection.genre }}</span>
                    </div>
                </div>
            </div>

            <section v-if="collection.required?.length" class="requirements">
                <h3>{{ collectionWithProgress ? "获取条件与成绩进度" : "获取条件" }}</h3>
                <CollectionProgress
                    v-if="collectionWithProgress"
                    :collection="collectionWithProgress"
                    :user="currentUser"
                    @open-chart="openChartInfo"
                >
                    <template #condition>
                        <div class="condition-summaries">
                            <div
                                v-for="(requirement, index) in collection.required"
                                :key="index"
                                class="condition-summary"
                            >
                                <div class="condition-title">
                                    {{
                                        requirementTitle(
                                            requirement,
                                            index,
                                            collection.required.length
                                        )
                                    }}
                                </div>
                                <div
                                    v-if="difficultyPresentation(requirement).details"
                                    class="condition-caption"
                                >
                                    {{ difficultyPresentation(requirement).details }}
                                </div>
                            </div>
                        </div>
                    </template>
                </CollectionProgress>
                <div v-else class="condition-summaries standalone">
                    <div
                        v-for="(requirement, index) in collection.required"
                        :key="index"
                        class="condition-summary"
                    >
                        <div class="condition-title">
                            {{ requirementTitle(requirement, index, collection.required.length) }}
                        </div>
                        <div
                            v-if="difficultyPresentation(requirement).details"
                            class="condition-caption"
                        >
                            {{ difficultyPresentation(requirement).details }}
                        </div>
                    </div>
                </div>
            </section>
            <section v-else class="requirements-empty">暂无结构化获取条件</section>
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
        width: min(760px, 100%);
        margin: 0 auto;
        padding: 4px 2px 16px;
        box-sizing: border-box;
    }

    .collection-hero {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .collection-image {
        display: block;
        max-width: 300px;
        max-height: 140px;
        object-fit: contain;
        flex: 0 1 48%;
    }

    .collection-image.square {
        width: min(140px, 30vw);
        aspect-ratio: 1;
    }

    .collection-image.plate {
        width: min(300px, 42vw);
    }

    .collection-image.frame {
        width: min(300px, 42vw);
    }

    .collection-summary {
        min-width: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-top: 8px;
    }

    .collection-info-item {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: 0.95rem;
        line-height: 1.4;
    }

    .collection-info-item.clickable {
        cursor: pointer;
        transition: color 0.2s ease;
    }

    .collection-info-item.clickable:hover {
        color: rgb(var(--mdui-color-primary));
    }

    .info-icon {
        flex-shrink: 0;
        color: rgb(var(--mdui-color-primary));
        font-size: 1.25rem;
    }

    .info-text {
        overflow-wrap: anywhere;
        white-space: normal;
        word-break: break-word;
    }

    .requirements {
        margin-top: 16px;
    }

    .requirements h3 {
        margin: 0 0 8px;
        font-size: 1rem;
    }

    .condition-summaries {
        min-width: 0;
    }

    .condition-summaries.standalone {
        padding: 4px;
    }

    .condition-summary + .condition-summary {
        margin-top: 6px;
    }

    .condition-title {
        font-size: 0.9rem;
        font-weight: 600;
        overflow-wrap: anywhere;
    }

    .condition-caption {
        margin-top: 2px;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: 0.75rem;
        line-height: 1.3;
        overflow-wrap: anywhere;
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
            gap: 10px;
        }

        .collection-image,
        .collection-image.square,
        .collection-image.plate,
        .collection-image.frame {
            width: 100%;
            max-width: 100%;
            max-height: 160px;
            margin: 0 auto;
        }

        .collection-summary {
            width: 100%;
            gap: 6px;
            padding-top: 0;
        }

        .collection-info-item {
            gap: 6px;
            font-size: 0.85rem;
        }

        .info-icon {
            font-size: 1.1rem;
        }
    }
</style>
