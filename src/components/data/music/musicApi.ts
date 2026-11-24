/**
 * Music API Module
 * Fetches music data from SaltMeta next metadata.
 */

import type { SaltMetaMusicListResult } from "@core/music/fetch";
import { fetchSaltMetaMusicList as fetchSaltMetaMusicListCore } from "@core/music/fetch";
import { snackbar } from "mdui";
import { checkForUpdate } from "@/components/app/checkForUpdate";

export type { SaltMetaMusicListResult };

export async function fetchSaltMetaMusicList(): Promise<SaltMetaMusicListResult | null> {
    const outcome = await fetchSaltMetaMusicListCore({ requestInit: { cache: "no-store" } });
    if (outcome.ok) {
        return outcome.value;
    }

    const { failure } = outcome;
    switch (failure.kind) {
        case "http":
            console.error("Failed to fetch SaltMeta music list:", failure.status);
            break;
        case "version":
            console.error(
                `SaltMeta next compacted version mismatch. Expected: ${failure.expected}, Got: ${failure.actual}`
            );
            snackbar({
                message: "曲目数据版本不一致，请尝试升级应用",
                placement: "bottom",
                autoCloseDelay: 0,
                action: "立即升级",
                onActionClick: () => {
                    checkForUpdate();
                },
            });
            break;
        case "error":
            console.error("Error fetching SaltMeta music list:", failure.error);
            break;
    }
    return null;
}
