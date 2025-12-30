<script setup lang="ts">
    import { ref, computed, watch } from "vue";
    import {
        icons,
        plates,
        frames,
        titles,
        characters,
        genres,
        partners,
    } from "@/components/data/collection";
    import { CollectionKind, type Collection, TitleColor } from "@/components/data/collection/type";
    import { useShared } from "@/components/app/shared";
    import { copyTextToClipboard } from "@/components/app/utils";
    import { useVirtualScroll, handleSelectChange } from "@/utils";
    import { getCollectionImageURL } from "@/components/integrations/assets";

    const Category = {
        Title: "称号",
        Icon: "头像",
        Plate: "姓名框",
        Frame: "背景",
        Character: "旅行伙伴",
        Partner: "搭档",
    } as const;

    type CategoryType = (typeof Category)[keyof typeof Category];

    const { users } = useShared();
    const query = ref<string>("");
    const category = ref<CategoryType>(Category.Title);
    const filter = ref<string>("all");

    function handleCategoryChange(e: Event) {
        const target = e.target as HTMLElement & { value: string };
        category.value = target.value as CategoryType;
    }

    const ownedCollections = computed<Record<number, number[]>>(() => {
        if (!users || !users[0] || !users[0].data.items)
            return { 1: [], 2: [], 3: [], 9: [], 10: [], 11: [] };

        const owned: Record<number, number[]> = { 1: [], 2: [], 3: [], 9: [], 10: [], 11: [] };
        for (const collection of users[0].data.items[1]) owned[1].push(collection.itemId);
        for (const collection of users[0].data.items[2]) owned[2].push(collection.itemId);
        for (const collection of users[0].data.items[3]) owned[3].push(collection.itemId);
        if (users[0].data.items[9]) {
            for (const collection of users[0].data.items[9]) owned[9].push(collection.itemId);
        }
        if (users[0].data.items[10]) {
            for (const collection of users[0].data.items[10]) owned[10].push(collection.itemId);
        }
        if (users[0].data.items[11]) {
            for (const collection of users[0].data.items[11]) owned[11].push(collection.itemId);
        }

        return owned;
    });

    // 获取当前分类下的可用类别
    const genreKeyMap: Record<CategoryType, keyof typeof genres | "partners"> = {
        [Category.Title]: "titles",
        [Category.Icon]: "icons",
        [Category.Plate]: "plates",
        [Category.Frame]: "frames",
        [Category.Character]: "characters",
        [Category.Partner]: "partners",
    };

    const availableGenres = computed<string[]>(() => {
        const key = genreKeyMap[category.value];
        if (key === "partners") return [];
        return genres[key] || [];
    });

    // 获取当前分类下的所有数据
    const collections = computed<Collection[]>(() => {
        switch (category.value) {
            case Category.Title:
                return titles;
            case Category.Icon:
                return icons;
            case Category.Plate:
                return plates;
            case Category.Frame:
                return frames;
            case Category.Character:
                // 将characters转换为Collection格式，并添加用户数据
                return characters.map(character => {
                    const userCharacter = users?.[0]?.data?.characters?.find(
                        uc => uc.characterId === character.id
                    );
                    return {
                        type: CollectionKind.Character,
                        id: character.id,
                        name: character.name,
                        genre: character.genre || "",
                        description: (character as any).genre || "",
                        userCharacter,
                    };
                });
            case Category.Partner:
                return partners;
            default:
                return [];
        }
    });

    // 过滤后的收藏品列表
    const filteredCollections = computed<Collection[]>(() => {
        let result = collections.value;

        // 根据搜索关键词过滤
        if (query.value) {
            const lowerQuery = query.value.toLowerCase();
            result = result.filter(
                item =>
                    item.name.toLowerCase().includes(lowerQuery) ||
                    getCategoryName(item.type).toLowerCase().includes(lowerQuery) ||
                    item.description.toLowerCase().includes(lowerQuery) ||
                    item.id.toString().includes(query.value)
            );
        }

        // 根据筛选器过滤（包括拥有状态和类别）
        if (filter.value !== "all") {
            if (filter.value === "owned" || filter.value === "missing") {
                // 拥有状态筛选
                result = result.filter(item => {
                    const isOwned = isCollectionOwned(item);
                    return filter.value === "owned" ? isOwned : !isOwned;
                });
            } else {
                // 类别筛选
                result = result.filter(item => {
                    const itemGenre = item.genre || (item as any).genre;
                    return itemGenre === filter.value;
                });
            }
        }

        return result;
    });

    // 使用虚拟滚动组合式函数
    const getCollectionGridConfig = () => {
        const width = window.innerWidth;
        let columns = 1;
        if (width >= 1200) columns = 4;
        else if (width >= 900) columns = 3;
        else if (width >= 600) columns = 2;
        else columns = 1;

        const rowsPerPage = Math.max(Math.floor(window.innerHeight / 200), 2);
        return { columns, cardHeight: rowsPerPage };
    };

    const {
        visibleItemsCount,
        maxVisibleItems,
        itemsToRender,
        loadMore,
        resetScroll,
        getLoadSize,
    } = useVirtualScroll({
        items: filteredCollections,
        getGridConfig: getCollectionGridConfig,
    });

    // 监听分类变化，重置虚拟滚动并滚动到顶部
    watch(category, () => {
        resetScroll();
        if (!["all", "owned", "missing"].includes(filter.value)) filter.value = "all";
    });

    // 监听搜索变化，重置虚拟滚动
    watch(query, () => {
        visibleItemsCount.value = getLoadSize();
    });

    // 监听筛选器变化，重置虚拟滚动
    watch(filter, () => {
        resetScroll();
    });

    // 根据称号颜色获取CSS类名
    const getTitleColorClass = (color: TitleColor) => {
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
    };

    // 根据收藏品类型获取图片URL
    const COLLECTION_TYPE_MAP: Record<CollectionKind, string> = {
        [CollectionKind.Icon]: "icon",
        [CollectionKind.Plate]: "plate",
        [CollectionKind.Frame]: "frame",
        [CollectionKind.Character]: "character",
        [CollectionKind.Partner]: "partner",
        [CollectionKind.Title]: "",
    };

    const getImageUrl = (collection: Collection) => {
        const typePath = COLLECTION_TYPE_MAP[collection.type];
        if (!typePath) return "";
        return getCollectionImageURL(typePath, collection.id);
    };

    // 根据收藏品类型获取分类名称
    const getCategoryName = (type: CollectionKind) => {
        switch (type) {
            case CollectionKind.Title:
                return Category.Title;
            case CollectionKind.Icon:
                return Category.Icon;
            case CollectionKind.Plate:
                return Category.Plate;
            case CollectionKind.Frame:
                return Category.Frame;
            case CollectionKind.Character:
                return Category.Character;
            case CollectionKind.Partner:
                return Category.Partner;
            default:
                return "";
        }
    };

    // 检查收藏品是否已拥有
    const isCollectionOwned = (collection: Collection) => {
        if (collection.id <= 3) return true; // 默认和随机

        // 对于旅行伙伴，检查用户是否拥有该角色
        if (collection.type === CollectionKind.Character) {
            return !!(collection as any).userCharacter;
        }

        const owned = ownedCollections.value;
        return owned[collection.type] && owned[collection.type].includes(collection.id);
    };

    function onFilterChange(event: Event) {
        handleSelectChange(event, filter);
    }
</script>

<template>
    <div class="collections-page">
        <!-- 主分类选择 - 使用Tab -->
        <mdui-tabs :value="category" @change="handleCategoryChange" class="category-tabs">
            <mdui-tab v-for="(label, key) in Category" :key="key" :value="label">
                {{ label }}
            </mdui-tab>
        </mdui-tabs>

        <!-- 搜索框和筛选器 -->
        <div class="filter-bar">
            <mdui-select
                class="filter-select"
                :value="filter"
                @change="onFilterChange"
                style="--mdui-comp-select-menu-max-height: 60vh"
            >
                <mdui-menu-item value="all">所有</mdui-menu-item>
                <mdui-menu-item value="owned">已获得</mdui-menu-item>
                <mdui-menu-item value="missing">未获得</mdui-menu-item>
                <mdui-divider v-if="availableGenres.length"></mdui-divider>
                <mdui-menu-item v-for="genre in availableGenres" :key="genre" :value="genre">
                    {{ genre }}
                </mdui-menu-item>
            </mdui-select>

            <mdui-text-field
                class="search-field"
                clearable
                icon="search"
                label="搜索"
                placeholder="名称 类型 描述 ID"
                @input="query = $event.target.value"
            ></mdui-text-field>
        </div>

        <!-- 收藏品网格 -->
        <div class="collections-container">
            <div class="collections-grid">
                <mdui-card
                    v-for="collection in itemsToRender"
                    :key="`${collection.type}-${collection.id}`"
                    :variant="isCollectionOwned(collection) ? 'filled' : 'outlined'"
                    class="collection-card"
                >
                    <div class="collection-content">
                        <!-- 根据类型显示不同的内容 -->
                        <div v-if="collection.type === CollectionKind.Title" class="title-content">
                            <div class="title-header">
                                <div class="title-color-wrapper">
                                    <div
                                        class="title-color-indicator"
                                        :class="getTitleColorClass((collection as any).color)"
                                    ></div>
                                    <h3
                                        class="title-name clickable"
                                        @click="copyTextToClipboard(collection.name)"
                                    >
                                        {{ collection.name }}
                                    </h3>
                                </div>
                            </div>
                            <div class="title-info">
                                <p
                                    class="collection-description clickable"
                                    @click="copyTextToClipboard(collection.description)"
                                >
                                    {{ collection.description }}
                                </p>
                                <span
                                    class="collection-id clickable"
                                    @click="copyTextToClipboard(collection.id.toString())"
                                >
                                    #{{ collection.id }}
                                </span>
                            </div>
                        </div>

                        <!-- 其他类型的收藏品 -->
                        <div
                            v-else
                            class="other-content"
                            :class="{
                                'icon-layout':
                                    collection.type === CollectionKind.Icon ||
                                    collection.type === CollectionKind.Character ||
                                    collection.type === CollectionKind.Partner,
                                'plate-frame-layout':
                                    collection.type === CollectionKind.Plate ||
                                    collection.type === CollectionKind.Frame,
                            }"
                        >
                            <div
                                class="collection-image-placeholder"
                                :class="{
                                    square:
                                        collection.type === CollectionKind.Icon ||
                                        collection.type === CollectionKind.Character ||
                                        collection.type === CollectionKind.Partner,
                                    plate: collection.type === CollectionKind.Plate,
                                    frame: collection.type === CollectionKind.Frame,
                                }"
                                v-if="!getImageUrl(collection)"
                            >
                                <mdui-icon
                                    name="image"
                                    style="font-size: 48px; opacity: 0.5"
                                ></mdui-icon>
                            </div>
                            <img
                                v-else-if="
                                    collection.type === CollectionKind.Icon ||
                                    collection.type === CollectionKind.Plate ||
                                    collection.type === CollectionKind.Frame ||
                                    collection.type === CollectionKind.Character ||
                                    collection.type === CollectionKind.Partner
                                "
                                :src="getImageUrl(collection)"
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
                                @error="
                                    (e: Event) => {
                                        const target = e.target as HTMLElement | null;
                                        if (target) target.style.display = 'none';
                                    }
                                "
                            />
                            <div class="collection-info">
                                <div
                                    class="collection-header"
                                    :class="{
                                        'icon-header':
                                            collection.type === CollectionKind.Icon ||
                                            collection.type === CollectionKind.Character ||
                                            collection.type === CollectionKind.Partner,
                                    }"
                                >
                                    <h3
                                        class="collection-name clickable"
                                        @click="copyTextToClipboard(collection.name)"
                                    >
                                        {{ collection.name }}
                                    </h3>
                                    <span
                                        v-if="
                                            collection.type === CollectionKind.Plate ||
                                            collection.type === CollectionKind.Frame ||
                                            collection.type === CollectionKind.Character
                                        "
                                        class="collection-id-inline clickable"
                                        @click="copyTextToClipboard(collection.id.toString())"
                                    >
                                        #{{ collection.id }}
                                    </span>
                                </div>
                                <p
                                    v-if="collection.type !== CollectionKind.Partner"
                                    class="collection-description clickable"
                                    @click="copyTextToClipboard(collection.description)"
                                >
                                    {{ collection.description }}
                                </p>

                                <div class="collection-meta">
                                    <span
                                        v-if="
                                            collection.type === CollectionKind.Icon ||
                                            collection.type === CollectionKind.Partner
                                        "
                                        class="collection-id clickable"
                                        @click="copyTextToClipboard(collection.id.toString())"
                                    >
                                        #{{ collection.id }}
                                    </span>
                                </div>
                                <!-- 旅行伙伴的特殊信息 -->
                                <div
                                    v-if="collection.type === CollectionKind.Character"
                                    class="character-info"
                                >
                                    <div class="character-stats">
                                        <span
                                            v-if="(collection as any).userCharacter"
                                            class="character-level"
                                        >
                                            Lv. {{ (collection as any).userCharacter.level }}
                                        </span>
                                    </div>
                                    <div
                                        v-if="(collection as any).userCharacter"
                                        class="character-awakening-row"
                                    >
                                        <template v-for="i in 5" :key="i">
                                            <mdui-icon
                                                :name="
                                                    i <= (collection as any).userCharacter.awakening
                                                        ? 'star'
                                                        : 'star_border'
                                                "
                                                class="awakening-star"
                                            ></mdui-icon>
                                        </template>
                                    </div>
                                </div>

                                <div class="collection-meta">
                                    <!-- collection-meta现在为空，但保留结构 -->
                                </div>
                            </div>
                        </div>
                    </div>
                </mdui-card>

                <!-- 加载更多指示器 -->
                <div v-if="maxVisibleItems < filteredCollections.length" class="loading-indicator">
                    <div class="loading-text">正在加载更多...</div>
                    <mdui-button variant="text" @click="loadMore">点击加载</mdui-button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
    .clickable {
        cursor: pointer;
    }

    .collections-page {
        padding-top: calc(48px + 64px); /* tabs + filter-bar height */
    }

    .category-tabs {
        position: fixed;
        top: 56px;
        left: 0;
        right: 0;
        z-index: 100;
        background: rgb(var(--mdui-color-background));
        min-width: 0;
        height: 48px;
        box-sizing: border-box;
    }

    @media (min-aspect-ratio: 1.001/1) {
        .category-tabs {
            left: 80px; /* navigation rail width */
        }
    }

    .filter-bar {
        position: fixed;
        top: calc(56px + 48px);
        left: 0;
        right: 0;
        z-index: 99;
        background: rgb(var(--mdui-color-background));
        padding: 5px 20px;
        display: flex;
        gap: 16px;
        align-items: center;
        flex-wrap: wrap;
        height: 64px;
        box-sizing: border-box;
    }

    @media (min-aspect-ratio: 1.001/1) {
        .filter-bar {
            left: 80px; /* navigation rail width */
        }
    }

    .filter-select {
        width: 5rem;
        flex-shrink: 0;
    }

    .filter-select::part(menu) {
        width: unset;
        max-height: 60vh;
        overflow-y: auto;
        min-width: 160px;
        max-width: 90vw;
    }

    .search-field {
        flex: 1;
        min-width: 200px;
    }

    .collections-container {
        padding: 5px 20px;
        min-height: 50vh;
        padding-bottom: calc(56px + 1rem);
    }

    @media (min-aspect-ratio: 1.001/1) {
        .collections-container {
            padding-bottom: 1rem;
        }
    }

    .collections-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 16px;
        margin-top: 20px;
        width: 100%;
    }

    .collection-card {
        padding: 16px;
        transition: box-shadow 0.2s ease;
        min-width: 0;
    }

    .collection-id-corner {
        position: absolute;
        top: 8px;
        right: 8px;
        font-size: 14px;
        color: rgba(0, 0, 0, 0.5);
        white-space: nowrap;
    }

    .collection-content {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    /* 标题类收藏品样式 */
    .title-header {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .title-color-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: fit-content;
        min-width: 120px;
        min-height: 24px; /* 缩短高度 */
        max-width: 100%; /* 限制最大宽度 */
    }

    .title-color-indicator {
        width: 100%;
        height: 100%;
        border-radius: 30px; /* 胶囊状圆角 */
        position: absolute;
        top: 0;
        left: 0;
        z-index: 1;
    }

    .title-name {
        margin: 0;
        font-size: 16px; /* 稍微减小字体 */
        font-weight: 500;
        color: rgba(0, 0, 0, 0.87);
        position: relative;
        z-index: 2;
        padding: 3px 20px; /* 调整padding以适应更小的高度 */
        display: inline-block;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        text-align: center;
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

    /* 其他类型收藏品样式 */
    .other-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 8px;
    }

    .other-content.icon-layout {
        flex-direction: row;
        text-align: left;
        align-items: flex-start;
    }

    .other-content.plate-frame-layout {
        flex-direction: column;
        text-align: left;
        align-items: stretch;
    }

    .collection-image-placeholder {
        width: 100%;
        height: 120px;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #f5f5f5;
        border-radius: 8px;
        margin-bottom: 8px;
    }

    .collection-image-placeholder.square {
        aspect-ratio: 1 / 1;
        height: auto;
        max-width: 80px;
        max-height: 80px;
        margin-left: auto;
        margin-right: auto;
    }

    /* 姓名框图片占位符保持720/116的比例 */
    .collection-image-placeholder.plate {
        aspect-ratio: 720 / 116;
        height: auto;
        object-fit: contain;
    }

    /* 背景图片占位符保持1080/452的比例 */
    .collection-image-placeholder.frame {
        aspect-ratio: 1080 / 452;
        height: auto;
        object-fit: contain;
    }

    .other-content.icon-layout .collection-image-placeholder.square {
        margin-right: 16px;
        margin-left: 0;
        margin-bottom: 0;
        flex-shrink: 0;
    }

    .collection-image {
        width: 100%;
        height: 120px;
        border-radius: 8px;
        margin-bottom: 8px;
        object-fit: cover;
    }

    .collection-image.square {
        aspect-ratio: 1 / 1;
        height: auto;
        max-width: 80px;
        max-height: 80px;
        margin-left: auto;
        margin-right: auto;
        object-fit: contain; /* 头像使用contain以保持比例 */
    }

    /* 姓名框图片保持720/116的比例 */
    .collection-image.plate {
        aspect-ratio: 720 / 116;
        height: auto;
        object-fit: contain;
    }

    /* 背景图片保持1080/452的比例 */
    .collection-image.frame {
        aspect-ratio: 1080 / 452;
        height: auto;
        object-fit: contain;
    }

    .other-content.icon-layout .collection-image.square {
        margin-right: 16px;
        margin-left: 0;
        margin-bottom: 0;
        flex-shrink: 0;
    }

    .collection-info {
        flex: 1;
    }

    .collection-name {
        margin: 0;
        font-size: 18px;
        font-weight: 500;
        color: rgba(0, 0, 0, 0.87);
        width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .other-content.icon-layout .collection-name {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
    }

    .character-stats {
        display: flex;
        flex-wrap: wrap;
        /* gap: 8px; */
        align-items: center;
    }

    .character-level {
        font-size: 14px;
        color: rgba(0, 0, 0, 0.7);
        font-weight: 500;
    }

    .character-awakening-row {
        display: flex;
        align-items: center;
        gap: 2px;
        /* margin-top: 4px; */
    }

    .awakening-star {
        font-size: 16px;
        color: #f57c00;
    }

    .collection-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    }

    .collection-header.icon-header {
        justify-content: space-between;
    }

    .collection-id-inline {
        font-size: 14px;
        color: rgba(0, 0, 0, 0.5);
        white-space: nowrap;
    }

    .title-info {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-top: 16px; /* 增加与上方胶囊的间距 */
    }

    .collection-description {
        margin: 0;
        font-size: 14px;
        color: rgba(0, 0, 0, 0.6);
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        flex: 1; /* 占据可用空间 */
    }

    .collection-id {
        font-size: 12px;
        color: rgba(0, 0, 0, 0.5);
        white-space: nowrap;
        align-self: flex-start; /* 顶部对齐 */
    }

    /* 深色模式适配 */
    @media (prefers-color-scheme: dark) {
        .collection-name {
            color: rgba(255, 255, 255, 0.87);
        }

        .collection-description {
            color: rgba(255, 255, 255, 0.7);
        }

        .collection-id,
        .collection-id-inline,
        .collection-id-corner {
            color: rgba(255, 255, 255, 0.5);
        }

        .character-level {
            color: rgba(255, 255, 255, 0.7);
        }

        .awakening-star {
            color: #ffb74d;
        }
    }

    .loading-indicator {
        text-align: center;
        padding: 20px;
        margin-top: 20px;
        width: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        grid-column: 1 / -1;
    }

    .loading-text {
        color: #666;
        margin-bottom: 10px;
    }

    /* 响应式调整 */
    @media (max-width: 768px) {
        .collections-grid {
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 12px;
        }
    }

    @media (max-width: 480px) {
        .collections-grid {
            grid-template-columns: 1fr;
            gap: 12px;
        }

        .collection-card {
            padding: 12px;
        }
    }
</style>
