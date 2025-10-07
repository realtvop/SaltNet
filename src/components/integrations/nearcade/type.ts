export * from "./types/Shop";

export interface NearcadeData {
    currentShopId: number | null;
    favoriteShopIds: number[];
    APIKey: string | null;
}
