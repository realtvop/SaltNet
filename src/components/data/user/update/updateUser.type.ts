import type {
    DivingFishB50,
    DivingFishFullRecord,
} from "@/components/integrations/diving-fish/type";
import type { UserMusic, UserItem, UserInfo, UserCharacter } from "../../inGame";

export interface UpdateUserResponse {
    userId: number;
    userName: string;
    iconId: number;
    rating: number;
    userMusicList: UserMusic[];
    divingFishData: DivingFishFullRecord[];
    b50: DivingFishB50;
    isLogin: boolean;
    items: UserItem[][];
    characters: UserCharacter[];
    info: UserInfo;
}

export interface RivalPreview {
    name: string;
    rating: number;
}
