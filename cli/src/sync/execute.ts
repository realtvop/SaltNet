/**
 * Execution of saltnet sync (design 5.1).
 */
import type { SyncOptions } from "@core/sync/type";
import type { ScoreHistoryCandidate } from "@core/user/scoreHistory/type";
import type { CommandContext, GlobalOptions } from "../commands/registry";
import type { Warning } from "../output/warning";
import type { UserListRow } from "../users/repository";
import type { CliSyncSource, SyncData, SyncMode } from "./types";
import type { PendingUpload } from "./uploads";
import { randomUUID } from "node:crypto";
import { SaltNetError } from "@core/integrations/saltnet/client";
import {
    syncFromDivingFishImportToken,
    syncFromDivingFishName,
    syncFromInGame,
    syncFromLXNS,
} from "@core/sync/sync";
import { getUserDisplayName } from "@core/user/type";
import { allChartEntries } from "../catalog/chartQuery";
import { buildSongCatalog } from "../catalog/songs";
import { useMetadata } from "../commands/metadata";
import { CliError } from "../errors";
import { appendScoreEvents, readUser, saveUser } from "../users/repository";
import { buildUserRows } from "../users/rows";
import { readUserScores } from "../users/scores";
import { userBindCommand, userRefWord } from "../util/printedCommand";
import { joinCommandLine } from "../util/shell";
import { formatLocalTime } from "../util/time";
import { computeSyncChanges, countSyncChanges } from "./changes";
import { createSyncClients, mapSyncError } from "./clients";
import { assertQrAccount, isOtherQrAccount, readVerifiedQr, requireGameBackend } from "./ingame";
import { beginRun, finishRun } from "./journal";
import { withSyncLock } from "./lock";
import { createLxnsAccess } from "./lxnsToken";
import { protectSyncSecrets } from "./secrets";
import {
    assertGameId,
    assertGameQrSource,
    buildUserForCore,
    getOtherBoundSources,
    otherSourceFix,
    otherSourcesMessage,
    plannedMode,
    resolveSyncSource,
    syncUploadTargets,
    usesGame,
} from "./sources";
import { applySyncToStoredUser, buildStoredSyncEvents } from "./storedUser";
import { runSyncUploads } from "./uploads";

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
        readonly upload?: boolean;
        readonly all?: boolean;
        readonly dryRun?: boolean;
    };
    readonly global: GlobalOptions;
}

export async function executeSync(
    args: SyncCommandArgs,
    context: CommandContext,
    targetUserRow: UserListRow,
    attemptedLxnsRefreshes: Set<string>
): Promise<SyncExecutionResult> {
    const store = context.store();
    const userRef = userRefWord(targetUserRow);
    const requestedSource = args.options.source ?? "auto";
    const mayUseInGame = usesGame(targetUserRow, requestedSource);
    assertGameQrSource(mayUseInGame, args.options.qr);
    const qr = args.options.qr ? await readVerifiedQr(context) : undefined;
    const assertMatchingQr = (storedId: number | null) => {
        if (qr && context.config.values.sync.qrOtherAccount === "error") {
            assertQrAccount(storedId, qr, userBindCommand(userRef, "ingame", [], ["--qr", "-"]));
        }
    };
    assertMatchingQr(targetUserRow.inGameId);

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
        assertMatchingQr(storedUser.inGame.id);
        const gameAccountChanged = qr !== undefined && isOtherQrAccount(storedUser.inGame.id, qr);
        let userForCore: ReturnType<typeof buildUserForCore>;
        let cliSource: ReturnType<typeof resolveSyncSource>;
        try {
            userForCore = buildUserForCore(storedUser, context.paths);
            cliSource = resolveSyncSource(userForCore, targetUserRow, requestedSource);
        } catch (error) {
            if (error instanceof CliError) {
                store.transaction(() => {
                    const run = beginRun(
                        store,
                        { kind: "sync", userUid: targetUserRow.uid, userName: displayName },
                        handle
                    );
                    finishRun(store, run, { outcome: "failed", error });
                });
            }
            throw error;
        }
        if (qr) {
            assertGameQrSource(cliSource === "ingame", args.options.qr);
            userForCore.inGame = { ...userForCore.inGame, id: qr.userId };
        }
        const secrets = protectSyncSecrets(context, userForCore, qr?.code);
        const ctx = secrets.ctx;
        const upload = args.options.upload !== false;
        const modeBeforeNetwork = plannedMode(cliSource, qr !== undefined);
        const inGameMode = cliSource === "ingame" ? modeBeforeNetwork : null;
        const accessLxns = createLxnsAccess(
            inGameMode ? { ...ctx, log: () => ctx.log("已刷新落雪授权") } : ctx,
            store,
            handle,
            storedUser,
            attemptedLxnsRefreshes
        );
        const refreshLxns = async () => {
            const auth = await accessLxns();
            secrets.add(auth.accessToken, auth.refreshToken);
            return auth;
        };
        let runId: number | undefined;
        // Set once the sync is written: a later failure (the lock lost during an upload) must not
        // read as a failed sync or suggest another source.
        let committed = false;
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

            if (cliSource === "ingame" && !qr) {
                requireGameBackend(ctx.config);
                assertGameId(userForCore, targetUserRow, { upload });
            }
            if (cliSource === "lxns") {
                const refreshedAuth = await refreshLxns();
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
                          assertHeld: handle.assertHeld,
                          refreshLxns,
                      }
                    : undefined
            );

            const pendingUploads: PendingUpload[] = [];
            const syncOptions: SyncOptions = {
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
            const targets = syncUploadTargets(userForCore, cliSource, upload);
            if (targets.includes("diving-fish")) {
                // Core selects the bound targets and hands back the raw game records.
                syncOptions.uploadToDivingFish = (records, importToken) => {
                    pendingUploads.push({ target: "diving-fish", records, importToken });
                };
            }
            if (targets.includes("lxns")) {
                syncOptions.uploadToLXNS = records => {
                    pendingUploads.push({ target: "lxns", records });
                };
            }

            let update = null;
            if (cliSource === "ingame") {
                ctx.log("正在同步舞萌成绩");
                update = await syncFromInGame(userForCore, qr?.input, syncOptions);
                if (update && update.userId !== userForCore.inGame.id) {
                    throw new CliError("UPSTREAM_ERROR", "舞萌服务返回的账号与本次同步账号不符");
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

            const mode: SyncMode = modeBeforeNetwork ?? (update.detailed ? "full" : "public-b50");

            // Core's LXNS update includes the working copy's authorization. No credential may
            // reach the stored update, including one echoed unexpectedly by a score endpoint.
            const cleanUpdate = {
                ...update,
                lxns: update.lxns ? { ...update.lxns, auth: null } : update.lxns,
            };
            if (
                secrets.contains(cleanUpdate) ||
                pendingUploads.some(({ records }) => secrets.contains(records))
            ) {
                throw new CliError(
                    "UPSTREAM_ERROR",
                    `${inGameMode ? "舞萌" : "上游"}成绩响应包含凭据，无法保存`
                );
            }

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

            const counts = store.transaction(() => {
                const freshUser = readUser(store, targetUserRow.uid);
                if (!freshUser) {
                    throw new CliError(
                        "NOT_FOUND",
                        `用户 ${targetUserRow.uid} 在同步过程中已被删除`
                    );
                }

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
                const events = buildStoredSyncEvents(
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

                const counts = countSyncChanges(newScoresCount, appliedCandidates);

                finishRun(store, runId!, {
                    outcome: "ok",
                    summary: {
                        source: cliSource,
                        mode,
                        ratingBefore,
                        ratingAfter,
                        ...counts,
                    },
                });
                return counts;
            });
            runId = undefined;
            committed = true;

            const { uploads, warnings: uploadWarnings } = await runSyncUploads(
                ctx,
                store,
                handle,
                refreshLxns,
                userRef,
                pendingUploads
            );

            // Read user scores AFTER the write
            const scoresAfter = readUserScores(store, targetUserRow, catalogCharts);
            const incomingRows = buildUserRows(
                { ...storedUser, data: cleanUpdate },
                targetUserRow.index,
                metaResult.catalog.music
            );

            const changesResult = computeSyncChanges({
                hadScoresBefore,
                candidates: appliedCandidates,
                songCatalog,
                scoresBefore,
                scoresAfter,
                incomingRows,
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
                counts,
                changes: changesResult.changes,
                changesTotal: changesResult.changesTotal,
                missing: changesResult.missing,
                uploads,
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

            const warnings: Warning[] = [...metaResult.warnings, ...uploadWarnings];
            if (gameAccountChanged) {
                warnings.push({
                    code: "GAME_ACCOUNT_CHANGED",
                    message: secrets.redact(
                        `二维码属于另一个舞萌账号，已将用户 ${displayName} 的游戏 ID 改为该账号`
                    ),
                    fix: joinCommandLine([
                        "saltnet",
                        "config",
                        "set",
                        "sync.qrOtherAccount",
                        "error",
                    ]),
                });
            }
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
                err instanceof SaltNetError
                    ? mapSyncError(err, lastReportMsg, cliSource, userRef)
                    : err;
            if (!(mappedErr instanceof CliError)) {
                if (runId !== undefined) {
                    recordFailure(runId, "INTERNAL", "同步时发生内部错误");
                }
                throw secrets.withoutCause(mappedErr);
            }

            const { api } = ctx.config.values;
            const otherSources =
                committed || mappedErr.code === "QR_REQUIRED" || mappedErr.code === "USAGE"
                    ? []
                    : getOtherBoundSources(
                          userForCore,
                          cliSource,
                          Boolean(api.url || api.fallbackUrl)
                      );
            const fix =
                mappedErr.fix ??
                (otherSources[0]
                    ? otherSourceFix(targetUserRow, otherSources[0], upload)
                    : undefined);
            const message = secrets.redact(
                committed
                    ? `同步结果已写入本地，之后出错：${mappedErr.message}`
                    : otherSourcesMessage(mappedErr.message, otherSources)
            );

            const finalError = new CliError(mappedErr.code, message, {
                candidates: mappedErr.candidates,
                fix,
                retryable: mappedErr.retryable,
                extra: mappedErr.extra,
                meta: mappedErr.meta,
                warnings: mappedErr.warnings,
            });

            if (runId !== undefined) {
                recordFailure(runId, finalError.code, finalError.message);
            }

            throw finalError;
        }

        function recordFailure(runId: number, errorCode: string, errorMessage: string) {
            try {
                finishRun(store, runId, { outcome: "failed", errorCode, errorMessage });
            } catch {
                // The command's original failure matters more than a journal write failure.
            }
        }
    });
}
