export interface SaltNetDatabaseLogin {
    id: number;
    username: string;
    email: string | null;
    sessionToken: string;
    refreshToken: string;
    sessionExpiry: number;
}

export interface SaltNetDatabaseUser {
    id: number;
    userName: string;
    email: string | null;
    createdAt: string;
    maimaidxRegion: string | null;
    maimaidxRating: number | null;
}
