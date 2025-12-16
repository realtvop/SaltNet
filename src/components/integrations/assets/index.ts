/**
 * 统一的 ID 格式化函数
 * @param id - 原始 ID
 * @param length - 目标长度（默认 5）
 * @returns 格式化后的 ID 字符串
 */
export function padId(id: number, length: number = 5): string {
    return "0".repeat(Math.max(length - id.toString().length, 0)) + id;
}

/**
 * 获取歌曲封面图片 URL
 * @param id - 歌曲 ID
 * @returns 封面图片 URL
 */
export function getCoverURL(id: number): string {
    if (10000 < id) id -= Math.floor(id / 10000) * 10000;
    return `https://jacket.maimai.realtvop.top/${padId(id)}.png`;
}

/**
 * 收藏品类型到路径的映射
 */
const COLLECTION_TYPE_PATH: Record<string, string> = {
    icon: "icon",
    plate: "plate",
    frame: "frame",
    character: "character",
    partner: "partner",
};

/**
 * 获取收藏品图片 URL
 * @param type - 收藏品类型（icon, plate, frame, character, partner）
 * @param id - 收藏品 ID
 * @returns 收藏品图片 URL，如果类型无效则返回空字符串
 */
export function getCollectionImageURL(type: string, id: number): string {
    const path = COLLECTION_TYPE_PATH[type.toLowerCase()];
    if (!path) return "";

    const baseUrl = "https://collectionimg.maimai.realtvop.top";
    return `${baseUrl}/${path}/${padId(id, 6)}.png`;
}
