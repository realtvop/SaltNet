import type { DivingFishB50, DivingFishFullRecord } from "@/components/integrations/diving-fish/type";
import type { UserMusic, UserItem } from "../../inGame";

export interface UpdateUserResponse {
    userName: string;
    iconId: number;
    rating: number;
    userMusicList: UserMusic[];
    divingFishData: DivingFishFullRecord[];
    b50: DivingFishB50;
    isLogin: boolean;
    items: UserItem[][];
}
