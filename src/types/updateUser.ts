import type { UserMusic } from "./inGame";

export interface UpdateUserResponse {
    userName: string,
    iconId: number,
    rating: number,
    userMusicList: UserMusic[],
    divingFishData: any, // 懒
}