export interface SaltNetDatabaseLogin {
    id: number;
    username: string;
    email: string | null;
    sessionToken: string;
    refreshToken: string;
    sessionExpiry: number;
    maimaidxRegion: MaimaidxRegion | null;
}

export interface SaltNetDatabaseUser {
    id: number;
    userName: string;
    email: string | null;
    createdAt: string;
    maimaidxRegion: MaimaidxRegion | null;
    maimaidxRating: number | null;
}

export type MaimaidxRegion = "jp" | "ex" | "cn";

export type OAuthProvider = "google" | "github";

export interface OAuthAccount {
    provider: OAuthProvider;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
    linkedAt: string | null;
}
