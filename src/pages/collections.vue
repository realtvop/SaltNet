<script setup lang="ts">
    import { ref, computed, watch, onMounted, onUnmounted } from "vue";
    import { icons, plates, frames, titles } from "@/assets/collection";
    import { CollectionKind, type Collection, TitleColor } from "@/components/data/collection/type";
    import { useShared } from "@/components/app/shared";

    const Category = {
        Title: "称号",
        Icon: "头像",
        Plate: "姓名框",
        Frame: "背景",
        // Partner: "旅行伙伴",
    } as const;

    type CategoryType = (typeof Category)[keyof typeof Category];

    const { users } = useShared();
    const query = ref<string>("");
    const category = ref<CategoryType>(Category.Title);
    const filter = ref<"all" | "owned" | "missing">("all");
    const ownedCollections = computed<Record<number, number[]>>(() => {
        if (!users || !users[0] || !users[0].data.items) return { 1: [], 2: [], 3: [], 4: [] };

        const owned: Record<number, number[]> = { 1: [], 2: [], 3: [], 10: [], 11: [] };
        for (const collection of users[0].data.items[1]) owned[1].push(collection.itemId);
        for (const collection of users[0].data.items[2]) owned[2].push(collection.itemId);
        for (const collection of users[0].data.items[3]) owned[3].push(collection.itemId);
        for (const collection of users[0].data.items[10]) owned[10].push(collection.itemId);
        for (const collection of users[0].data.items[11]) owned[11].push(collection.itemId);

        return owned;
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

        // 根据拥有状态筛选
        if (filter.value !== "all") {
            result = result.filter(item => {
                const isOwned = isCollectionOwned(item);
                return filter.value === "owned" ? isOwned : !isOwned;
            });
        }

        return result;
    });

    // 虚拟滚动状态管理
    const visibleItemsCount = ref(0);

    // 根据屏幕宽度计算每次加载的项目数
    const getLoadSize = () => {
        const width = window.innerWidth;

        // 根据屏幕宽度确定列数
        let columns = 1;
        if (width >= 1200) columns = 4;
        else if (width >= 900) columns = 3;
        else if (width >= 600) columns = 2;
        else columns = 1;

        // 计算行数和总加载数量
        const rowsPerPage = Math.max(Math.floor(window.innerHeight / 200), 2);
        return columns * rowsPerPage * 2; // 一次加载2页的量
    };

    const maxVisibleItems = computed(() =>
        Math.min(visibleItemsCount.value, filteredCollections.value.length)
    );

    const itemsToRender = computed(() => {
        return filteredCollections.value.slice(0, maxVisibleItems.value);
    });

    // 加载更多项目
    const loadMore = () => {
        const remainingItems = filteredCollections.value.length - visibleItemsCount.value;
        if (remainingItems > 0) {
            const loadSize = Math.min(getLoadSize(), remainingItems);
            visibleItemsCount.value += loadSize;
        }
    };

    // 滚动事件处理
    const handleScroll = (event: Event) => {
        const target = event.target as HTMLElement;
        // 检查是否接近底部（距离底部200px时触发）
        if (target.scrollTop + target.clientHeight >= target.scrollHeight - 200) {
            loadMore();
        }
    };

    // 窗口大小变化处理
    const handleResize = () => {
        const currentItemsPerPage = getLoadSize() / 2; // 单页数量
        const currentPages = Math.ceil(visibleItemsCount.value / currentItemsPerPage);
        const newVisibleCount = Math.min(
            currentPages * currentItemsPerPage,
            filteredCollections.value.length
        );

        visibleItemsCount.value = Math.max(newVisibleCount, getLoadSize());
    };

    // 监听分类变化，重置虚拟滚动并滚动到顶部
    watch(category, () => {
        visibleItemsCount.value = getLoadSize();
        // 滚动到顶部
        const container = document.querySelector(".collections-container");
        if (container) {
            container.scrollTop = 0;
        }
    });

    // 监听搜索变化，重置虚拟滚动
    watch(query, () => {
        visibleItemsCount.value = getLoadSize();
    });

    // 监听筛选器变化，重置虚拟滚动
    watch(filter, () => {
        visibleItemsCount.value = getLoadSize();
        // 滚动到顶部
        const container = document.querySelector(".collections-container");
        if (container) {
            container.scrollTop = 0;
        }
    });

    onMounted(() => {
        visibleItemsCount.value = getLoadSize();
        window.addEventListener("resize", handleResize);
    });

    onUnmounted(() => {
        window.removeEventListener("resize", handleResize);
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
    const getImageUrl = (collection: Collection) => {
        const baseUrl = "https://collectionimg.maimai.realtvop.top";
        const id = `${"0".repeat(6 - collection.id.toString().length)}${collection.id}`;

        switch (collection.type) {
            case CollectionKind.Icon:
                return `${baseUrl}/icon/${id}.png`;
            case CollectionKind.Plate:
                return `${baseUrl}/plate/${id}.png`;
            case CollectionKind.Frame:
                return `${baseUrl}/frame/${id}.png`;
            default:
                return "";
        }
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
            default:
                return "";
        }
    };

    // 检查收藏品是否已拥有
    const isCollectionOwned = (collection: Collection) => {
        if (collection.id <= 3) return true; // 默认和随机
        const owned = ownedCollections.value;
        return owned[collection.type] && owned[collection.type].includes(collection.id);
    };
</script>

<template>
    <!-- 主分类选择 - 使用Tab -->
    <mdui-tabs :value="category" @change="(e: any) => (category = e.target.value)">
        <mdui-tab v-for="(label, key) in Category" :key="key" :value="label">
            {{ label }}
        </mdui-tab>
    </mdui-tabs>

    <!-- 搜索框和筛选器 -->
    <div class="filter-bar">
        <mdui-select
            class="filter-select"
            :value="filter"
            @change="(e: any) => (filter = e.target.value)"
        >
            <mdui-menu-item value="all">所有</mdui-menu-item>
            <mdui-menu-item value="owned">已获得</mdui-menu-item>
            <mdui-menu-item value="missing">未获得</mdui-menu-item>
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
    <div class="collections-container" @scroll="handleScroll">
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
                                <h3 class="title-name">{{ collection.name }}</h3>
                            </div>
                        </div>
                        <div class="title-info">
                            <p class="collection-description">{{ collection.description }}</p>
                            <span class="collection-id">#{{ collection.id }}</span>
                        </div>
                    </div>

                    <!-- 其他类型的收藏品 -->
                    <div
                        v-else
                        class="other-content"
                        :class="{
                            'icon-layout': collection.type === CollectionKind.Icon,
                            'plate-frame-layout':
                                collection.type === CollectionKind.Plate ||
                                collection.type === CollectionKind.Frame,
                        }"
                    >
                        <div
                            class="collection-image-placeholder"
                            :class="{
                                square: collection.type === CollectionKind.Icon,
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
                                collection.type === CollectionKind.Frame
                            "
                            :src="getImageUrl(collection)"
                            :alt="collection.name"
                            class="collection-image"
                            :class="{
                                square: collection.type === CollectionKind.Icon,
                                plate: collection.type === CollectionKind.Plate,
                                frame: collection.type === CollectionKind.Frame,
                            }"
                            crossorigin="anonymous"
                            @error="(e: any) => e.target && (e.target.style.display = 'none')"
                        />
                        <div class="collection-info">
                            <div
                                class="collection-header"
                                :class="{ 'icon-header': collection.type === CollectionKind.Icon }"
                            >
                                <h3 class="collection-name">{{ collection.name }}</h3>
                                <span
                                    v-if="
                                        collection.type === CollectionKind.Plate ||
                                        collection.type === CollectionKind.Frame
                                    "
                                    class="collection-id-inline"
                                >
                                    #{{ collection.id }}
                                </span>
                            </div>
                            <p class="collection-description">{{ collection.description }}</p>
                            <div class="collection-meta">
                                <span
                                    v-if="collection.type === CollectionKind.Icon"
                                    class="collection-id"
                                >
                                    #{{ collection.id }}
                                </span>
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
</template>

<style scoped>
    .filter-bar {
        padding: 5px 20px;
        display: flex;
        gap: 16px;
        align-items: center;
    }

    .filter-select {
        width: 120px;
        flex-shrink: 0;
    }

    .search-field {
        flex: 1;
    }

    mdui-tabs {
        min-width: 0;
    }

    .collections-container {
        padding: 5px 20px;
        overflow-y: auto;
        height: calc(100vh - 76px - 11.75rem);
    }

    @supports (-webkit-touch-callout: none) {
        @media all and (display-mode: standalone) {
            .collections-container {
                height: calc(100vh - 76px - 12.75rem);
            }
        }
    }

    @media (min-aspect-ratio: 1.001/1) {
        .collections-container {
            height: calc(100vh - 76px - 6.75rem);
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

    .collection-card:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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

    .collection-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    }

    .collection-header.icon-header {
        justify-content: flex-start;
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
        .collection-id-inline {
            color: rgba(255, 255, 255, 0.5);
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
