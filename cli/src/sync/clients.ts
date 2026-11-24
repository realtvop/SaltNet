/**
 * Construction of SyncClients and error mapping for sync (design 5.1).
 */
import type { FetchLike } from "@core/http";
import type {
    DivingFishFullRecord,
    DivingFishRecordsResponse,
    DivingFishResponse,
} from "@core/integrations/diving-fish/type";
import type { LXNSAuth, LXNSScore, LXNSUser } from "@core/integrations/lxns/type";
import type { SavedMusicList } from "@core/music/type";
import type { LXNSScoreData, SyncClients, UpdateUserResponse } from "@core/sync/type";
import type { User } from "@core/user/type";
import type { CommandContext } from "../commands/registry";
import type { ResolvedSyncSource } from "./types";
import {
    buildDivingFishB50,
    DivingFishError,
    fetchDivingFishRecords,
    queryDivingFishPlayer,
} from "@core/integrations/diving-fish/client";
import {
    convertLXNSScore,
    LXNSPlayerApiError,
    requestLXNSPlayerApi,
} from "@core/integrations/lxns/client";
import {
    postSaltNetAPIJSON,
    SaltAPIEndpoints,
    SaltNetError,
} from "@core/integrations/saltnet/client";
import { convertDetailed } from "@core/user/type";
import { toHalfWidth } from "@core/util/toHalfWidth";
import { CliError } from "../errors";
import { createHttp } from "../runtime/http";
import { dfNameBindCommand, userBindCommand } from "../util/printedCommand";
import { gameTimeoutFix, postQrGameApi } from "./ingame";

function assertGameUpdate(data: unknown): asserts data is UpdateUserResponse {
    const reply = data as Partial<UpdateUserResponse> | null | undefined;
    if (
        typeof reply?.userName !== "string" ||
        !Number.isFinite(reply.rating) ||
        !Array.isArray(reply.divingFishData) ||
        !Array.isArray(reply.b50?.sd) ||
        !Array.isArray(reply.b50.dx)
    ) {
        throw new CliError("UPSTREAM_ERROR", "舞萌服务返回的数据不完整");
    }
}

export interface SyncClientsWrapper {
    readonly clients: SyncClients;
    getFirstError: () => unknown;
    getLastReportMessage: () => string | null;
    setLastReportMessage: (msg: string) => void;
}

export function createSyncClients(
    ctx: CommandContext,
    catalogMusicList: SavedMusicList["musicList"] | undefined,
    now: () => number,
    inGame?: {
        readonly useQr: boolean;
        readonly assertHeld: () => void;
        readonly refreshLxns: (user: User) => Promise<LXNSAuth>;
    }
): SyncClientsWrapper {
    let firstError: unknown = null;
    let lastReportMessage: string | null = null;

    const { api, network } = ctx.config.values;
    const readHttp = (
        timeoutKey: "network.timeoutMs" | "network.updateTimeoutMs",
        retry = true
    ): FetchLike => {
        const options = {
            timeoutKey,
            timeoutMs:
                timeoutKey === "network.updateTimeoutMs"
                    ? network.updateTimeoutMs
                    : network.timeoutMs,
            retry,
        };
        // An error from a game request can contain the player id in its body or transport details.
        return inGame || !retry
            ? createHttp({
                  ...options,
                  buffer: !retry,
                  fetch: ctx.io.fetch,
                  userAgent: network.userAgent,
                  log: inGame ? () => ctx.log("成绩读取请求失败，准备重试") : ctx.log,
              })
            : ctx.http(options);
    };
    const httpRead = readHttp("network.timeoutMs");
    const hasFallback = Boolean(api.url && api.fallbackUrl);
    const httpSaltNet = readHttp(
        inGame && !inGame.useQr ? "network.updateTimeoutMs" : "network.timeoutMs",
        !hasFallback
    );

    const wrap = <T extends readonly unknown[], R>(
        fn: (...args: T) => Promise<R>,
        preferError?: (error: unknown) => boolean
    ): ((...args: T) => Promise<R>) => {
        return async (...args: T): Promise<R> => {
            try {
                return await fn(...args);
            } catch (error) {
                if (!firstError || preferError?.(error)) {
                    firstError = error;
                }
                throw error;
            }
        };
    };

    const fetchDivingFishPlayer = wrap(
        (username: string): Promise<DivingFishResponse> =>
            queryDivingFishPlayer(username, { fetch: httpRead }),
        error =>
            error instanceof DivingFishError &&
            (error.status === 400 || error.status === 401 || error.status === 403) &&
            firstError instanceof SaltNetError &&
            (firstError.kind === "network" ||
                firstError.status === 429 ||
                (firstError.status !== undefined && firstError.status >= 500))
    );

    const fetchDivingFishRecordsClient = wrap(
        async (importToken: string): Promise<DivingFishRecordsResponse> => {
            return fetchDivingFishRecords(importToken, {
                fetch: httpRead,
            });
        }
    );

    const calculateB50FromRecords = async (records: DivingFishFullRecord[]) => {
        return buildDivingFishB50(records, catalogMusicList);
    };

    const fetchLXNSScore = wrap(async (user: User): Promise<LXNSScoreData> => {
        const auth = inGame ? await inGame.refreshLxns(user) : user.lxns?.auth;
        if (!auth?.accessToken || !auth.tokenType) {
            throw new CliError("NOT_BOUND", "缺少落雪访问凭据");
        }
        const authHeader = { accessToken: auth.accessToken, tokenType: auth.tokenType };
        const lxnsOptions = {
            config: { lxnsBaseUrl: ctx.config.values.lxns.baseUrl },
            fetch: httpRead,
        };
        const userData = await requestLXNSPlayerApi<LXNSUser>(
            authHeader,
            undefined,
            undefined,
            lxnsOptions
        );
        const lxScores = await requestLXNSPlayerApi<LXNSScore[]>(
            authHeader,
            "scores",
            undefined,
            lxnsOptions
        );
        const scores = lxScores.map(convertLXNSScore);
        const b50 = await calculateB50FromRecords(scores);
        return {
            name: toHalfWidth(userData.name),
            rating: userData.rating,
            scores: convertDetailed(scores),
            b50,
            updateTime: now(),
        };
    });

    const postGameAPIJSON = wrap(
        async <T>(endpoint: SaltAPIEndpoints, body: object): Promise<T> => {
            if (inGame?.useQr && endpoint === SaltAPIEndpoints.UpdateUser) {
                inGame.assertHeld();
                const reply = await postQrGameApi(ctx, endpoint, body);
                assertGameUpdate(reply);
                return reply as T;
            }
            let firstRequest: ReturnType<FetchLike> | undefined;
            let redirectError: CliError | undefined;
            let timeoutError: CliError | undefined;
            const fastGame = inGame && !inGame.useQr;
            const fetchAddress: FetchLike = async (url, init) => {
                timeoutError = undefined;
                try {
                    return await httpSaltNet(url, init);
                } catch (error) {
                    if (error instanceof CliError) {
                        const status = error.extra?.status;
                        if (typeof status === "number" && status >= 300 && status < 400) {
                            redirectError = error;
                        }
                        const fix = fastGame
                            ? gameTimeoutFix(
                                  error,
                                  "network.updateTimeoutMs",
                                  network.updateTimeoutMs
                              )
                            : undefined;
                        if (fix) {
                            timeoutError = new CliError(error.code, error.message, {
                                fix,
                                retryable: error.retryable,
                            });
                        }
                    }
                    throw error;
                }
            };

            try {
                const reply = await postSaltNetAPIJSON<T>(endpoint, body, {
                    config: {
                        saltnetApiUrl: api.url || api.fallbackUrl,
                        saltnetApiFallbackUrl: api.fallbackUrl,
                    },
                    fetch: (url, init) => {
                        if (!firstRequest) {
                            firstRequest = fetchAddress(url, init);
                            return firstRequest;
                        }
                        // Core always invokes its fallback on a failed request. A single address
                        // already spent its retry budget in HTTP, and redirects end the operation.
                        return hasFallback && !redirectError
                            ? fetchAddress(url, init)
                            : firstRequest;
                    },
                });
                if (endpoint === SaltAPIEndpoints.UpdateUser) assertGameUpdate(reply);
                return reply;
            } catch (error) {
                throw redirectError ?? timeoutError ?? error;
            }
        }
    );

    return {
        clients: {
            fetchDivingFishPlayer,
            fetchDivingFishRecords: fetchDivingFishRecordsClient,
            calculateB50FromRecords,
            fetchLXNSScore,
            postGameAPIJSON,
        },
        getFirstError: () => firstError,
        getLastReportMessage: () => lastReportMessage,
        setLastReportMessage: (msg: string) => {
            lastReportMessage = msg;
        },
    };
}

export function mapSyncError(
    error: unknown,
    reportMessage: string | null,
    source: ResolvedSyncSource,
    userRef: string
): CliError {
    if (error instanceof CliError) {
        return error;
    }

    if (source === "ingame") {
        if (error instanceof SaltNetError) {
            if (error.kind === "network") {
                return new CliError("NETWORK", "连接舞萌服务失败");
            }
            const status = error.status;
            if (status !== undefined) {
                return new CliError("UPSTREAM_ERROR", `舞萌服务返回了 HTTP ${status}`, {
                    retryable: status >= 500 || status === 429,
                    extra: { status },
                });
            }
        }
        return new CliError("UPSTREAM_ERROR", "舞萌服务返回了无法识别的数据");
    }

    if (error instanceof LXNSPlayerApiError) {
        if (error.status === 401 || error.status === 403) {
            return new CliError(
                "NOT_BOUND",
                `落雪拒绝了访问凭据（HTTP ${error.status}），需要重新授权`,
                {
                    fix: userBindCommand(userRef, "lxns"),
                    retryable: false,
                    extra: { status: error.status },
                    cause: error,
                }
            );
        }
        return new CliError("UPSTREAM_ERROR", `落雪服务返回了 HTTP ${error.status}`, {
            retryable: error.status >= 500 || error.status === 429,
            extra: { status: error.status },
            cause: error,
        });
    }

    if (error instanceof DivingFishError) {
        if (error.status === 401 || error.status === 403 || error.status === 400) {
            // By name, Diving Fish refuses a name it does not know or whose scores are private.
            const byName = source === "df-name";
            const refused = byName ? "水鱼拒绝了按用户名查询" : "水鱼拒绝了访问凭据";
            const alternative = byName ? "。也可绑定水鱼 Import-Token" : "";
            return new CliError("NOT_BOUND", `${refused}（${error.message}）${alternative}`, {
                fix: byName
                    ? dfNameBindCommand(userRef)
                    : userBindCommand(userRef, "df-token", ["-"]),
                retryable: false,
                extra: { status: error.status },
                cause: error,
            });
        }
        return new CliError("UPSTREAM_ERROR", `水鱼服务返回了 HTTP ${error.status}`, {
            retryable: error.status >= 500 || error.status === 429,
            extra: { status: error.status },
            cause: error,
        });
    }

    if (error instanceof SaltNetError) {
        if (error.kind === "network") {
            return new CliError("NETWORK", error.message, { retryable: true, cause: error });
        }
        return new CliError("UPSTREAM_ERROR", error.message, {
            retryable: error.status !== undefined && (error.status >= 500 || error.status === 429),
            extra: error.status !== undefined ? { status: error.status } : undefined,
            cause: error,
        });
    }

    if (error instanceof Error) {
        return new CliError("UPSTREAM_ERROR", error.message, { retryable: false, cause: error });
    }

    return new CliError("UPSTREAM_ERROR", reportMessage ?? "同步失败", { retryable: false });
}
