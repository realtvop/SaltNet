/**
 * Execution of saltnet sync (design 5.1).
 */
import type { ScoreHistoryCandidate } from "@core/user/scoreHistory/type";
import type { CommandContext, GlobalOptions } from "../commands/registry";
import type { Warning } from "../output/warning";
import type { CliSyncSource, SyncData, SyncMode } from "./types";
import { randomUUID } from "node:crypto";
import {
    syncFromDivingFishImportToken,
    syncFromDivingFishName,
    syncFromInGame,
    syncFromLXNS,
} from "@core/sync/sync";
import { buildScoreHistoryBatchEvents } from "@core/user/scoreHistory/batch";
import { getUserDisplayName } from "@core/user/type";
import { allChartEntries } from "../catalog/chartQuery";
import { buildSongCatalog } from "../catalog/songs";
import { useMetadata } from "../commands/metadata";
import { CliError, usageError } from "../errors";
import { resolveUser } from "../refs/user";
import { appendScoreEvents, listUsers, readUser, saveUser } from "../users/repository";
import { readRecordChartKeys, readUserScores } from "../users/scores";
import { formatLocalTime } from "../util/time";
import { computeSyncChanges } from "./changes";
import { createSyncClients, mapSyncError } from "./clients";
import { assertQrAccount, readVerifiedQr } from "./ingame";
import { beginRun, finishRun } from "./journal";
import { withSyncLock } from "./lock";
import { lxnsAccessToken } from "./lxnsToken";
import {
    buildUserForCore,
    formatOtherSourcesFix,
    getOtherBoundSources,
    resolveSyncSource,
    syncUserRef,
} from "./sources";
import { applySyncToStoredUser } from "./storedUser";

export interface SyncExecutionResult {
    readonly data: SyncData;
    readonly meta: Readonly<Record<string, unknown>>;
    readonly warnings: readonly Warning[];
}

export interface SyncCommandArgs {
    readonly options: {
        readonly user?: string;
        readonly source?: CliSyncSource;
        readonly qr?: "-";
    };
    readonly global: GlobalOptions;
}

export async function executeSync(
    args: SyncCommandArgs,
    ctx: CommandContext
): Promise<SyncExecutionResult> {
    const store = ctx.store();
    const users = listUsers(store);
    const targetUserRow = resolveUser(users, args.options.user);
    const userRef = syncUserRef(targetUserRow);
    const requestedSource = args.options.source ?? "auto";
    const mayUseInGame =
        requestedSource === "ingame" || (requestedSource === "auto" && targetUserRow.inGameEnabled);
    if (args.options.qr && !mayUseInGame) {
        throw usageError("--qr - 只能用于舞萌同步");
    }
    const qr = args.options.qr ? await readVerifiedQr(ctx) : undefined;
    if (qr) assertQrAccount(targetUserRow.inGameId, qr);

    // Existing users without a name can have their player id as the display name. Keep it out
    // of progress, errors and the journal for game syncs.
    const displayName =
        mayUseInGame && targetUserRow.displayName === String(targetUserRow.inGameId)
            ? "wmc"
            : targetUserRow.displayName;

    const syncLockUser = {
        uid: targetUserRow.uid,
        name: displayName,
    };

    return withSyncLock(store, syncLockUser, async handle => {
        const storedUser = readUser(store, targetUserRow.uid);
        if (!storedUser) {
            throw new CliError("NOT_FOUND", `找不到用户 ${targetUserRow.uid}`);
        }
        const userForCore = buildUserForCore(storedUser, ctx.paths);
        const cliSource = resolveSyncSource(userForCore, targetUserRow, requestedSource);
        if (qr) {
            if (cliSource !== "ingame") throw usageError("--qr - 只能用于舞萌同步");
            assertQrAccount(storedUser.inGame.id, qr);
            userForCore.inGame = { ...userForCore.inGame, id: qr.userId };
        } else if (cliSource === "ingame" && !userForCore.inGame.id) {
            const userFlag =
                targetUserRow.index !== 0 && targetUserRow.uid.startsWith("-")
                    ? `--user=${userRef}`
                    : `--user ${userRef}`;
            throw new CliError("QR_REQUIRED", "首次舞萌同步需要二维码", {
                fix: `saltnet sync ${userFlag} --source ingame --qr -`,
            });
        }
        const inGameMode = cliSource === "ingame" ? (qr ? "full" : "fast") : null;
        const gameCredentials = inGameMode
            ? [
                  qr?.code,
                  userForCore.divingFish.importToken,
                  userForCore.lxns?.auth?.accessToken,
                  userForCore.lxns?.auth?.refreshToken,
              ]
            : [];
        let runId: number | undefined;
        let lastReportMsg: string | null = null;

        try {
            runId = beginRun(
                store,
                {
                    kind: "sync",
                    userUid: targetUserRow.uid,
                    userName: displayName,
                    source: cliSource,
                    mode: inGameMode,
                },
                handle
            );

            if (cliSource === "lxns") {
                const refreshedAuth = await lxnsAccessToken(ctx, store, handle, storedUser);
                if (userForCore.lxns) {
                    userForCore.lxns.auth = refreshedAuth;
                } else {
                    userForCore.lxns = {
                        id: null,
                        name: null,
                        auth: refreshedAuth,
                    };
                }
            }

            // Fetch metadata current before making score requests
            const metaResult = await useMetadata(args, ctx, ["catalog"]);
            const songCatalog = buildSongCatalog(metaResult.catalog.music);
            const catalogCharts = allChartEntries(songCatalog).map(e => e.chart);

            // Read user scores BEFORE the write for before/after comparison
            const scoresBefore = readUserScores(store, targetUserRow, catalogCharts);
            const hadScoresBefore = scoresBefore.source !== "none";
            const ratingBefore =
                typeof storedUser.data?.rating === "number" &&
                Number.isSafeInteger(storedUser.data.rating)
                    ? storedUser.data.rating
                    : null;

            const clientWrapper = createSyncClients(
                ctx,
                metaResult.catalog.music.musicList,
                () => ctx.io.now().getTime(),
                inGameMode
                    ? {
                          useQr: qr !== undefined,
                          refreshLxns: async () => {
                              const auth = await lxnsAccessToken(
                                  { ...ctx, log: () => ctx.log("已刷新落雪授权") },
                                  store,
                                  handle,
                                  storedUser
                              );
                              gameCredentials.push(auth.accessToken, auth.refreshToken);
                              return auth;
                          },
                      }
                    : undefined
            );

            const syncOptions = {
                clients: clientWrapper.clients,
                report: (message: string, errorMsg?: string) => {
                    if (inGameMode) {
                        if (errorMsg) ctx.log("第三方成绩补全失败，继续舞萌快速更新");
                        return;
                    }
                    ctx.log(message);
                    if (errorMsg) {
                        lastReportMsg = errorMsg;
                        clientWrapper.setLastReportMessage(errorMsg);
                    }
                },
                now: () => ctx.io.now().getTime(),
            };

            let update = null;
            if (cliSource === "ingame") {
                ctx.log("正在同步舞萌成绩");
                update = await syncFromInGame(userForCore, qr?.input, syncOptions);
                if (update && update.userId !== userForCore.inGame.id) {
                    throw new CliError("UPSTREAM_ERROR", "舞萌服务返回的账号与本次同步账号不符");
                }
                if (update) {
                    const encodedUpdate = JSON.stringify(update);
                    if (
                        gameCredentials.some(
                            secret =>
                                secret &&
                                encodedUpdate.includes(JSON.stringify(secret).slice(1, -1))
                        )
                    ) {
                        throw new CliError("UPSTREAM_ERROR", "舞萌成绩响应包含凭据，无法保存");
                    }
                }
            } else if (cliSource === "lxns") {
                update = await syncFromLXNS(userForCore, syncOptions);
            } else if (cliSource === "df-token") {
                update = await syncFromDivingFishImportToken(userForCore, syncOptions);
            } else if (cliSource === "df-name") {
                update = await syncFromDivingFishName(userForCore, syncOptions);
            }

            if (!update) {
                const mapped = mapSyncError(
                    clientWrapper.getFirstError(),
                    lastReportMsg,
                    cliSource,
                    userRef
                );
                throw mapped;
            }

            const mode: SyncMode =
                inGameMode ?? (cliSource === "df-name" && !update.detailed ? "public-b50" : "full");

            const newScoresCount = update.detailed
                ? Object.keys(update.detailed).length
                : update.b50
                  ? update.b50.sd.length + update.b50.dx.length
                  : 0;

            handle.assertHeld();

            let appliedCandidates: ScoreHistoryCandidate[] = [];
            let ratingAfter: number | null = null;
            let observedAt = ctx.io.now().getTime();
            let updatedUserDisplayName = targetUserRow.displayName;

            store.transaction(() => {
                const freshUser = readUser(store, targetUserRow.uid);
                if (!freshUser) {
                    throw new CliError(
                        "NOT_FOUND",
                        `用户 ${targetUserRow.uid} 在同步过程中已被删除`
                    );
                }

                // The LXNS update hands back the working copy's authorization: drop it.
                const cleanUpdate = {
                    ...update,
                    lxns: update.lxns ? { ...update.lxns, auth: null } : update.lxns,
                };
                const applyResult = applySyncToStoredUser(freshUser, cleanUpdate, () =>
                    ctx.io.now().getTime()
                );
                const nextUser = applyResult.user;
                appliedCandidates = applyResult.candidates;
                observedAt = applyResult.observedAt;

                // The stored user never holds a token (the repository refuses one).
                if (nextUser.divingFish?.importToken !== undefined) {
                    nextUser.divingFish.importToken = null;
                }
                if (nextUser.lxns?.auth !== undefined) {
                    nextUser.lxns.auth = null;
                }

                saveUser(store, nextUser);
                updatedUserDisplayName = getUserDisplayName(nextUser);

                // Events
                const freshUid = nextUser.uid as string;
                const latestEventRow = store.db
                    .prepare(
                        "SELECT generation_id FROM score_events WHERE user_uid = ? ORDER BY observed_at DESC, id DESC LIMIT 1"
                    )
                    .get(freshUid) as { generation_id: string } | undefined;

                // Rule: use the generation of this user's newest stored event (by observedAt, then id),
                // or a new 'cli-<uuid>' when it has none; the web app keeps an active generation per user.
                const generationId = latestEventRow?.generation_id ?? `cli-${randomUUID()}`;

                const existingChartKeysRows = store.db
                    .prepare("SELECT DISTINCT record_key FROM score_events WHERE user_uid = ?")
                    .all(freshUid) as { record_key: string }[];
                const existingChartKeys = new Set(existingChartKeysRows.map(r => r.record_key));

                const batchId = randomUUID();
                const events = buildScoreHistoryBatchEvents(
                    {
                        batchId,
                        userUid: freshUid,
                        source: applyResult.source,
                        candidates: appliedCandidates,
                    },
                    generationId,
                    existingChartKeys
                );
                appendScoreEvents(store, events);

                ratingAfter =
                    typeof nextUser.data?.rating === "number" &&
                    Number.isSafeInteger(nextUser.data.rating)
                        ? nextUser.data.rating
                        : null;

                const added = appliedCandidates.filter(c => c.kind === "initial").length;
                const improved = appliedCandidates.filter(c => c.kind === "change").length;

                finishRun(store, runId!, {
                    outcome: "ok",
                    summary: {
                        source: cliSource,
                        mode,
                        ratingBefore,
                        ratingAfter,
                        charts: newScoresCount,
                        added,
                        improved,
                    },
                });
            });

            // Read user scores AFTER the write
            const scoresAfter = readUserScores(store, targetUserRow, catalogCharts);
            const chartKeyByRecordKey = readRecordChartKeys(store, targetUserRow.uid);

            const changesResult = computeSyncChanges({
                hadScoresBefore,
                candidates: appliedCandidates,
                songCatalog,
                scoresBefore,
                scoresAfter,
                newScoresCount,
                chartKeyByRecordKey,
            });

            const data: SyncData = {
                user: {
                    uid: targetUserRow.uid,
                    index: targetUserRow.index,
                    name: updatedUserDisplayName,
                },
                source: cliSource,
                mode,
                rating: {
                    before: ratingBefore,
                    after: ratingAfter,
                },
                counts: changesResult.counts,
                changes: changesResult.changes,
                changesTotal: changesResult.changesTotal,
                missing: changesResult.missing,
                uploads: [],
            };

            const meta: Record<string, unknown> = {
                user: {
                    index: targetUserRow.index,
                    uid: targetUserRow.uid,
                    name: updatedUserDisplayName,
                },
                dataAsOf: {
                    scores: formatLocalTime(new Date(observedAt)),
                    ...metaResult.dataAsOf,
                },
            };

            const warnings: Warning[] = [...metaResult.warnings];
            if (mode === "public-b50") {
                warnings.push({
                    code: "PUBLIC_B50_ONLY",
                    message: "只更新了水鱼公开的 B50，详细成绩保留原样",
                });
            }

            return {
                data,
                meta,
                warnings,
            };
        } catch (err) {
            const mappedErr =
                err instanceof CliError
                    ? err
                    : mapSyncError(err, lastReportMsg, cliSource, userRef);

            const otherSources = getOtherBoundSources(userForCore, cliSource);
            const fixWithOthers = formatOtherSourcesFix(
                { index: targetUserRow.index, uid: targetUserRow.uid },
                otherSources,
                mappedErr.fix
            );

            const finalError = new CliError(mappedErr.code, mappedErr.message, {
                candidates: mappedErr.candidates,
                fix: fixWithOthers,
                retryable: mappedErr.retryable,
                extra: mappedErr.extra,
                cause: inGameMode
                    ? undefined
                    : (mappedErr.cause ?? (err instanceof Error ? err : undefined)),
            });

            if (runId !== undefined) {
                try {
                    finishRun(store, runId, {
                        outcome: "failed",
                        errorCode: finalError.code,
                        errorMessage: finalError.message,
                    });
                } catch {
                    // Ignore journal write error on failure to ensure original error is thrown
                }
            }

            throw finalError;
        }
    });
}
