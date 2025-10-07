/**
 * 店铺游戏机台信息
 */
export interface Game {
    /**
     * 游戏（版本）ID
     * BEMANICN 数据源等同于机台 ID
     */
    gameId: number;
    /**
     * 游戏系列 ID
     */
    titleId: number;
    /**
     * 游戏名
     */
    name: string;
    /**
     * 游戏版本
     */
    version: string;
    /**
     * 游戏说明
     */
    comment: string;
    /**
     * 机台数量
     */
    quantity: number;
    /**
     * 价格说明
     */
    cost: string;
}

/**
 * 店铺地址
 */
interface Address {
    /**
     * 大致地址
     * 一般为：[国家/地区, 省, 市, 区]
     */
    general: string[];
    /**
     * 详细地址
     */
    detailed: string;
}

/**
 * 店铺坐标
 */
interface Location {
    type: string;
    coordinates: number[];
}

/**
 * 店铺信息
 */
export interface Shop {
    /**
     * MongoDB ID
     */
    _id: string;
    /**
     * 店铺 ID
     * 须与 source 结合才能唯一确定店铺
     */
    id: number;
    /**
     * 店铺名称
     */
    name: string;
    /**
     * 店铺说明
     */
    comment: string;
    /**
     * 店铺地址
     */
    address: Address;
    /**
     * 店铺与定位点的距离
     */
    distance?: number;
    /**
     * 营业时间
     * 仅有 1 个元素时表示整周均为该营业时间；有 7 个元素时每个元素分别代表一周中一天的营业时间
     * 每个内部数组有且仅有 2 个数字元素，其中第 1 个表示开店时间（单位：时），第 2 个表示闭店时间（单位：时）；小数表示非整点时间
     */
    openingHours: [number, number][];
    /**
     * 机台
     */
    games: Game[];
    /**
     * 店铺坐标
     */
    location: Location;
    /**
     * 创建时间
     * ZIv 数据源不返回创建时间
     */
    createdAt?: string; // 根据 OpenAPI 非 required，设为可选属性
    /**
     * 更新时间
     */
    updatedAt: string;
    /**
     * 店铺来源
     * 目前可能为 bemanicn、ziv
     */
    source: string;
}
