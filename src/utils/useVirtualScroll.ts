import { ref, computed, onMounted, onUnmounted, type Ref, type ComputedRef } from "vue";

export interface VirtualScrollOptions {
    /** 所有项目的计算属性 */
    items: ComputedRef<any[]>;
    /** 返回网格配置：列数和卡片高度 */
    getGridConfig?: () => { columns: number; cardHeight: number };
    /** 触发加载的距离阈值，默认 200 */
    threshold?: number;
    /** 每次加载的页数倍数，默认 2 */
    pagesPerLoad?: number;
}

export interface VirtualScrollReturn {
    /** 当前可见项目数量 */
    visibleItemsCount: Ref<number>;
    /** 实际应渲染的最大项目数（不超过总数） */
    maxVisibleItems: ComputedRef<number>;
    /** 要渲染的项目列表 */
    itemsToRender: ComputedRef<any[]>;
    /** 手动加载更多 */
    loadMore: () => void;
    /** 重置滚动状态并回到顶部 */
    resetScroll: () => void;
    /** 获取每次加载的项目数量 */
    getLoadSize: () => number;
}

/**
 * 默认的网格配置函数
 * 根据屏幕宽度返回合适的列数和卡片高度
 */
function defaultGetGridConfig(): { columns: number; cardHeight: number } {
    const width = window.innerWidth;

    let columns = 1;
    if (width >= 1200) columns = 4;
    else if (width >= 900) columns = 3;
    else if (width >= 600) columns = 2;
    else columns = 1;

    const cardHeight = 200;
    const rowsPerPage = Math.max(Math.floor(window.innerHeight / cardHeight), 2);

    return { columns, cardHeight: rowsPerPage };
}

/**
 * 虚拟滚动组合式函数
 * 用于处理大列表的按需加载渲染
 */
export function useVirtualScroll(options: VirtualScrollOptions): VirtualScrollReturn {
    const {
        items,
        getGridConfig = defaultGetGridConfig,
        threshold = 200,
        pagesPerLoad = 2,
    } = options;

    const visibleItemsCount = ref(0);

    /**
     * 根据屏幕尺寸计算每次加载的项目数
     */
    const getLoadSize = (): number => {
        const config = getGridConfig();
        return config.columns * config.cardHeight * pagesPerLoad;
    };

    /**
     * 实际应渲染的最大项目数
     */
    const maxVisibleItems = computed(() => Math.min(visibleItemsCount.value, items.value.length));

    /**
     * 要渲染的项目列表
     */
    const itemsToRender = computed(() => items.value.slice(0, maxVisibleItems.value));

    /**
     * 加载更多项目
     */
    const loadMore = (): void => {
        const remainingItems = items.value.length - visibleItemsCount.value;
        if (remainingItems > 0) {
            const loadSize = Math.min(getLoadSize(), remainingItems);
            visibleItemsCount.value += loadSize;
        }
    };

    /**
     * 滚动事件处理
     */
    const handleScroll = (): void => {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;

        if (scrollTop + windowHeight >= documentHeight - threshold) {
            loadMore();
        }
    };

    /**
     * 窗口大小变化处理
     */
    const handleResize = (): void => {
        const currentItemsPerPage = getLoadSize() / pagesPerLoad;
        const currentPages = Math.ceil(visibleItemsCount.value / currentItemsPerPage);
        const newVisibleCount = Math.min(currentPages * currentItemsPerPage, items.value.length);

        visibleItemsCount.value = Math.max(newVisibleCount, getLoadSize());
    };

    /**
     * 重置滚动状态
     */
    const resetScroll = (): void => {
        visibleItemsCount.value = getLoadSize();
        window.scrollTo({ top: 0, behavior: "instant" });
    };

    // 生命周期管理
    onMounted(() => {
        visibleItemsCount.value = getLoadSize();
        window.addEventListener("resize", handleResize);
        window.addEventListener("scroll", handleScroll);
    });

    onUnmounted(() => {
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("scroll", handleScroll);
    });

    return {
        visibleItemsCount,
        maxVisibleItems,
        itemsToRender,
        loadMore,
        resetScroll,
        getLoadSize,
    };
}
