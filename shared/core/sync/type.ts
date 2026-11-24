import type {
    DivingFishB50,
    DivingFishFullRecord,
    DivingFishRecordsResponse,
    DivingFishResponse,
} from "../integrations/diving-fish/type";
import type { SaltAPIEndpoints } from "../integrations/saltnet/client";
import type { UserCharacter, UserInfo, UserItem, UserMusic } from "../user/inGame";
import type { ScoreHistorySource } from "../user/scoreHistory/type";
import type { DetailedData, User } from "../user/type";

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

export interface LXNSScoreData {
    name: string;
    rating: number;
    scores: DetailedData;
    b50: DivingFishB50;
    updateTime: number;
}

export interface SyncClients {
    fetchDivingFishPlayer: (name: string) => Promise<DivingFishResponse>;
    fetchDivingFishRecords: (importToken: string) => Promise<DivingFishRecordsResponse>;
    calculateB50FromRecords: (records: DivingFishFullRecord[]) => Promise<DivingFishB50>;
    fetchLXNSScore: (user: User) => Promise<LXNSScoreData>;
    postGameAPIJSON: <T>(endpoint: SaltAPIEndpoints, body: object) => Promise<T>;
}

export interface SyncOptions {
    clients: SyncClients;
    report?: (message: string, errorMsg?: string) => void;
    uploadToDivingFish?: (records: DivingFishFullRecord[], importToken: string) => unknown;
    uploadToLXNS?: (records: DivingFishFullRecord[], user: User) => unknown;
    now?: () => number;
}

export type SyncSourceKind = "inGame" | "lxns" | "divingFishImportToken" | "divingFishName";

export interface SyncUpdate {
    rating: number;
    name: string;
    b50: DivingFishB50;
    updateTime: number;
    scoreHistorySource: ScoreHistorySource;
    detailed?: DetailedData;
    userId?: number | null;
    items?: UserItem[][];
    characters?: UserCharacter[];
    info?: UserInfo;
    lxns?: User["lxns"];
}
