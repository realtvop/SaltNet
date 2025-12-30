export type {
    SaltNetDatabaseLogin,
    SaltNetDatabaseUser,
    OAuthProvider,
    OAuthAccount,
    MaimaidxRegion,
} from "./type.ts";

/** Whether the SaltNet Database feature is enabled (VITE_DB_URL is configured) */
export const isDBEnabled = !!import.meta.env.VITE_DB_URL;
export {
    loginSaltNet,
    refreshSaltNetToken,
    getSaltNetUser,
    registerSaltNet,
    forgotPassword,
    getSaltNetRecords,
    getSaltNetB50,
    getSaltNetB50ByUsername,
    getSaltNetRecordsByUsername,
    getOAuthLoginUrl,
    getOAuthBindUrl,
    getOAuthAccounts,
    unlinkOAuthAccount,
    handleOAuthCallback,
} from "./api.ts";
export type { SaltNetScoreResponse, SaltNetB50Response } from "./api.ts";
