import type { Chart } from "@core/music/type";
import type { User } from "@core/user/type";
import type { B50RenderChart, B50RenderPayload } from "../../../shared/rendering/b50-payload";
import type { Route } from "../mockHttp";
import { Buffer } from "node:buffer";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ComboStatus, RankRate, SyncStatus } from "@core/mai/types";
import { createMusicChartMap, selectB50Charts, sumChartRatings } from "@core/query/b50";
import { getUserDisplayName } from "@core/user/type";
import { describe, expect, it } from "vitest";
import { parseB50Payload } from "../../../shared/rendering/b50-payload";
import { allChartEntries } from "../../src/catalog/chartQuery";
import { createRegistry } from "../../src/commands";
import { splitCommandLine } from "../../src/util/shell";
import { commandIn, routes } from "../commandRun";
import { expectConforms } from "../dataSchema";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { binaryResponse, jsonResponse, textResponse } from "../mockHttp";
import { detailedUser, seedScoreUsers } from "../scoreUsers";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();
const registry = createRegistry();

function schemaOf(name: string) {
    const cmd = registry.find(name);
    if (!cmd?.spec.dataSchema) throw new Error(`Missing schema for ${name}`);
    return cmd.spec.dataSchema;
}

const RENDER_URL = "https://render.example.test";
const RENDER_ENDPOINT = "https://render.example.test/render/b50";
// The PNG signature and the start of a header chunk, then every byte value once: most of them are
// not valid UTF-8 there, so a picture that went through text would not come out the same.
const SAMPLE_PNG = Buffer.concat([
    Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89,
    ]),
    Buffer.from(Array.from({ length: 256 }, (_, byte) => byte)),
]);

/** The render service's picture as real `fetch` gives it. */
function pngResponse(bytes: Uint8Array = SAMPLE_PNG, status = 200) {
    return binaryResponse(bytes, status);
}

const MODES = ["normal", "fit", "ap", "fc", "pc", "nb"] as const;

function handWrittenMapChart(chart: Chart) {
    const fitConstant = (chart.score as Record<string, unknown> | undefined)?.fitConstant;
    const ds =
        typeof fitConstant === "number" && !Number.isNaN(fitConstant)
            ? fitConstant
            : chart.info.constant;
    return {
        songId: chart.music.info.id,
        title: chart.music.info.title,
        type: chart.music.info.type,
        levelIndex: chart.info.grade,
        ds,
        achievements: chart.score?.achievements ?? null,
        fc: chart.score?.comboStatus ?? "",
        fs: chart.score?.syncStatus ?? "",
        rate: chart.score?.rankRate ?? "",
        ra: chart.score?.deluxeRating ?? 0,
        deluxeScore: chart.score?.deluxeScore,
        deluxeScoreMax: chart.info.deluxeScoreMax,
    };
}

describe("b50 --image", () => {
    it.each(MODES)(
        "sends expected payload for mode %s and writes PNG with mode 0600",
        async mode => {
            const paths = makeHome();
            const user = detailedUser(`user-${mode}`, `User ${mode}`);
            user.remark = "ModeRemark";
            if (mode === "ap") {
                for (const record of Object.values(user.data.detailed!)) {
                    record.fc = ComboStatus.AllPerfect;
                }
            }
            await seedScoreUsers(paths, [user]);

            const catalog = fixtureSongCatalog();
            const entries = allChartEntries(catalog);
            const charts = entries.map(e => e.chart);
            const chartMap = createMusicChartMap(charts);

            const options = {
                fitDiff: mode === "fit",
                nb50: mode === "nb",
                comboFilter: mode === "ap" || mode === "fc" ? mode : null,
                pc50: mode === "pc",
            };
            const selected = selectB50Charts(user.data, chartMap, options);
            const expectedTotalRating =
                sumChartRatings(selected.old) + sumChartRatings(selected.newer);
            const modeLabels: Record<string, string> = {
                normal: "B50",
                fit: "拟合 B50",
                ap: "AP50",
                fc: "FC50",
                pc: "PC50",
                nb: "牛逼 50",
            };

            const expectedPayload = {
                playerName: getUserDisplayName(user),
                playerSecondaryName: `User ${mode}`,
                playerRating: expectedTotalRating || null,
                modeLabel: modeLabels[mode],
                showDxScore: false,
                sd: selected.old.map(handWrittenMapChart),
                dx: selected.newer.map(handWrittenMapChart),
            };

            let capturedBody: unknown;
            const network = routes({
                [RENDER_ENDPOINT]: request => {
                    capturedBody = JSON.parse(request.init?.body ?? "{}");
                    return pngResponse();
                },
            });

            const outFile = "out.png";
            const { code, json } = await commandIn(
                paths,
                "b50",
                ["--mode", mode, "--image", outFile],
                {
                    network,
                    cwd: paths.home,
                    env: { SALTNET_RENDER_URL: RENDER_URL },
                }
            );

            expect(code).toBe(0);
            expect(capturedBody).toEqual(expectedPayload);
            expect(parseB50Payload(capturedBody)).toEqual(expectedPayload);

            const expectedPath = path.resolve(paths.home, outFile);
            expect(json.data.image).toEqual({
                path: expectedPath,
                byteSize: SAMPLE_PNG.byteLength,
            });
            expectConforms(schemaOf("b50"), json.data);

            const stat = statSync(expectedPath);
            expect(stat.size).toBe(SAMPLE_PNG.byteLength);
            expect(readFileSync(expectedPath).equals(SAMPLE_PNG)).toBe(true);
            expect(stat.mode & 0o777).toBe(0o600);
        }
    );

    it("uses fitConstant as ds in fit mode, sets playerSecondaryName only with remark, handles 0 rating, and handles --dx-score", async () => {
        const paths = makeHome();
        const userWithRemark = detailedUser("user-remark", "RealName");
        userWithRemark.remark = "RemarkName";
        await seedScoreUsers(paths, [userWithRemark]);

        let capturedPayload: B50RenderPayload | undefined;
        const network = routes({
            [RENDER_ENDPOINT]: request => {
                capturedPayload = JSON.parse(request.init?.body ?? "{}");
                return pngResponse();
            },
        });

        // 1. fit mode uses fitConstant as ds, remark sets playerSecondaryName, and --dx-score sets showDxScore
        const fitRun = await commandIn(
            paths,
            "b50",
            ["--mode", "fit", "--dx-score", "--image", "fit.png"],
            {
                network,
                cwd: paths.home,
                env: { SALTNET_RENDER_URL: RENDER_URL },
            }
        );
        expect(fitRun.code).toBe(0);
        expect(capturedPayload!.playerName).toBe("RemarkName");
        expect(capturedPayload!.playerSecondaryName).toBe("RealName");
        expect(capturedPayload!.showDxScore).toBe(true);
        expect(capturedPayload!.modeLabel).toBe("拟合 B50");

        const hasFitChart = capturedPayload!.sd.some(
            (c: B50RenderChart) => c.ds !== undefined && c.ds !== null
        );
        expect(hasFitChart).toBe(true);

        // 2. User without remark gets playerSecondaryName: null
        const userNoRemark = detailedUser("user-no-remark", "NoRemarkName");
        userNoRemark.remark = undefined;
        await seedScoreUsers(paths, [userNoRemark]);

        const noRemarkRun = await commandIn(
            paths,
            "b50",
            ["--user", "user-no-remark", "--image", "no-remark.png"],
            {
                network,
                cwd: paths.home,
                env: { SALTNET_RENDER_URL: RENDER_URL },
            }
        );
        expect(noRemarkRun.code).toBe(0);
        expect(capturedPayload!.playerName).toBe("NoRemarkName");
        expect(capturedPayload!.playerSecondaryName).toBeNull();
        expect(capturedPayload!.showDxScore).toBe(false);

        // 3. User whose groups sum to 0 gets playerRating: null
        const zeroUser: User = {
            ...detailedUser("user-zero", "ZeroUser"),
            data: {
                ...detailedUser("user-zero", "ZeroUser").data,
                detailed: {
                    // One chart with 0% achievements and 0 deluxeRating
                    "146-0": {
                        achievements: 0,
                        ds: 1.0,
                        dxScore: 0,
                        fc: ComboStatus.None,
                        fs: SyncStatus.None,
                        level: "1",
                        level_index: 0,
                        level_label: "BASIC",
                        ra: 0,
                        rate: RankRate.d,
                        song_id: 146,
                        title: "Vergissmeinnicht",
                        type: "SD",
                    },
                },
            },
        };
        await seedScoreUsers(paths, [zeroUser]);

        const zeroRun = await commandIn(
            paths,
            "b50",
            ["--user", "user-zero", "--image", "zero.png"],
            {
                network,
                cwd: paths.home,
                env: { SALTNET_RENDER_URL: RENDER_URL },
            }
        );
        expect(zeroRun.code).toBe(0);
        expect(capturedPayload!.playerRating).toBeNull();
    });

    it("--limit 1 --offset 1 pages JSON but sends both whole groups to render service", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [detailedUser("user-paged", "User Paged")]);

        let capturedPayload: B50RenderPayload | undefined;
        const network = routes({
            [RENDER_ENDPOINT]: request => {
                capturedPayload = JSON.parse(request.init?.body ?? "{}");
                return pngResponse();
            },
        });

        const { code, json } = await commandIn(
            paths,
            "b50",
            ["--limit", "1", "--offset", "1", "--image", "paged.png"],
            {
                network,
                cwd: paths.home,
                env: { SALTNET_RENDER_URL: RENDER_URL },
            }
        );
        expect(code).toBe(0);
        // JSON groups are paged to limit 1
        expect(json.data.groups[0].items.length).toBe(1);
        expect(json.data.groups[1].items.length).toBe(1);

        // Render payload contains all charts in B35 and B15
        expect(capturedPayload!.sd.length).toBeGreaterThan(1);
        expect(capturedPayload!.dx.length).toBeGreaterThan(1);
    });

    it("validates all USAGE cases and FILE_EXISTS without network requests, and succeeds via fix", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [detailedUser("user-usage", "User Usage")]);

        let requestCount = 0;
        const countingRoute: Route = () => {
            requestCount++;
            return pngResponse();
        };
        const network = routes({ [RENDER_ENDPOINT]: countingRoute });

        // 1. Missing render.url is USAGE with fix
        const noUrl = await commandIn(paths, "b50", ["--image", "test.png"], {
            network,
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: "" },
        });
        expect(noUrl.code).toBe(2);
        expect(noUrl.json.error.code).toBe("USAGE");
        expect(noUrl.json.error.fix).toBe("saltnet config set render.url <地址>");
        expect(requestCount).toBe(0);

        // 2. --offline with --image is USAGE
        const offline = await commandIn(paths, "b50", ["--offline", "--image", "test.png"], {
            network,
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });
        expect(offline.code).toBe(2);
        expect(offline.json.error.code).toBe("USAGE");
        expect(requestCount).toBe(0);

        // 3. --overwrite without --image is USAGE
        const overwriteOnly = await commandIn(paths, "b50", ["--overwrite"], {
            network,
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });
        expect(overwriteOnly.code).toBe(2);
        expect(overwriteOnly.json.error.code).toBe("USAGE");
        expect(requestCount).toBe(0);

        // 4. --dx-score without --image is USAGE
        const dxScoreOnly = await commandIn(paths, "b50", ["--dx-score"], {
            network,
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });
        expect(dxScoreOnly.code).toBe(2);
        expect(dxScoreOnly.json.error.code).toBe("USAGE");
        expect(requestCount).toBe(0);

        // 5. FILE_EXISTS without --overwrite: throws FILE_EXISTS, sends no request
        // First, create the file
        const first = await commandIn(paths, "b50", ["--image", "exists.png"], {
            network,
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });
        expect(first.code).toBe(0);
        expect(requestCount).toBe(1);

        // Run again without --overwrite
        const conflict = await commandIn(
            paths,
            "b50",
            ["--mode", "fit", "--dx-score", "--image", "exists.png"],
            {
                network,
                cwd: paths.home,
                env: { SALTNET_RENDER_URL: RENDER_URL },
            }
        );
        expect(conflict.code).toBe(2);
        expect(conflict.json.error.code).toBe("FILE_EXISTS");
        expect(conflict.json.error.fix).toBe(
            "saltnet b50 --mode fit --dx-score --image exists.png --overwrite"
        );
        expect(requestCount).toBe(1); // No new request!

        // Run the fix
        const fixWords = splitCommandLine(conflict.json.error.fix!);
        const fixedRun = await commandIn(paths, fixWords[1], fixWords.slice(2), {
            network,
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });
        expect(fixedRun.code).toBe(0);
        expect(requestCount).toBe(2);

        // 6. User and file that start with -
        const dashUser = detailedUser("-dash-user", "Dash User");
        await seedScoreUsers(paths, [dashUser]);

        // First write to -file.png using safe flags
        const dashFirst = await commandIn(
            paths,
            "b50",
            ["--user=-dash-user", "--image=-file.png", "--overwrite"],
            {
                network,
                cwd: paths.home,
                env: { SALTNET_RENDER_URL: RENDER_URL },
            }
        );
        expect(dashFirst.code).toBe(0);

        // Now run without --overwrite to trigger FILE_EXISTS
        const dashConflict = await commandIn(
            paths,
            "b50",
            ["--user=-dash-user", "--image=-file.png"],
            {
                network,
                cwd: paths.home,
                env: { SALTNET_RENDER_URL: RENDER_URL },
            }
        );
        expect(dashConflict.code).toBe(2);
        expect(dashConflict.json.error.code).toBe("FILE_EXISTS");
        expect(dashConflict.json.error.fix).toBe(
            "saltnet b50 --user=-dash-user --image ./-file.png --overwrite"
        );

        // Run fix for dash user and dash file
        const dashFixWords = splitCommandLine(dashConflict.json.error.fix!);
        const dashFixedRun = await commandIn(paths, dashFixWords[1], dashFixWords.slice(2), {
            network,
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });
        expect(dashFixedRun.code).toBe(0);
    });

    it("handles 400 with { error }, 500 with retry, 200 non-PNG, and transport failure safely", async () => {
        const paths = makeHome();
        const sensitiveUser = detailedUser("user-sensitive", "SecretPlayerName");
        await seedScoreUsers(paths, [sensitiveUser]);

        // 1. 400 with { error }
        const err400 = await commandIn(paths, "b50", ["--image", "400.png"], {
            network: routes({
                [RENDER_ENDPOINT]: jsonResponse(
                    { error: "Payload chart count exceeded limit" },
                    400
                ),
            }),
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });
        expect(err400.code).toBe(5);
        expect(err400.json.error.code).toBe("UPSTREAM_ERROR");
        expect(err400.json.error.message).toContain("Payload chart count exceeded limit");
        expect(err400.json.error).toMatchObject({ status: 400, retryable: false });
        expect(err400.json.error.message).not.toContain("SecretPlayerName");

        // 2. 500 error sent twice (retried once), then UPSTREAM_ERROR
        let calls500 = 0;
        const err500 = await commandIn(paths, "b50", ["--image", "500.png"], {
            network: routes({
                [RENDER_ENDPOINT]: () => {
                    calls500++;
                    return textResponse("Internal Error", 500);
                },
            }),
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });
        expect(calls500).toBe(2);
        expect(err500.code).toBe(5);
        expect(err500.json.error.code).toBe("UPSTREAM_ERROR");
        expect(err500.json.error.message).toContain("500");
        expect(err500.json.error).toMatchObject({ status: 500, retryable: true });

        // A 429 is asked again once too, and may pass by itself later
        const err429 = await commandIn(paths, "b50", ["--image", "429.png"], {
            network: routes({ [RENDER_ENDPOINT]: textResponse("slow down", 429) }),
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });
        expect(err429.json.error).toMatchObject({
            code: "UPSTREAM_ERROR",
            status: 429,
            retryable: true,
        });
        expect(err500.json.error.message).not.toContain("SecretPlayerName");

        // 3. 200 with HTML body is UPSTREAM_ERROR
        const html200 = await commandIn(paths, "b50", ["--image", "html.png"], {
            network: routes({
                [RENDER_ENDPOINT]: textResponse(
                    "<!DOCTYPE html><html><body>Error</body></html>",
                    200
                ),
            }),
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });
        expect(html200.code).toBe(5);
        expect(html200.json.error.code).toBe("UPSTREAM_ERROR");
        expect(html200.json.error.message).toContain("PNG");
        expect(html200.json.error.message).not.toContain("SecretPlayerName");

        // 4. Transport failure is NETWORK
        const netFail = await commandIn(paths, "b50", ["--image", "net.png"], {
            network: routes({
                [RENDER_ENDPOINT]: () => {
                    throw Object.assign(new Error("connect ECONNREFUSED"), {
                        code: "ECONNREFUSED",
                    });
                },
            }),
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });
        expect(netFail.code).toBe(5);
        expect(netFail.json.error.code).toBe("NETWORK");
        expect(netFail.json.error.message).not.toContain("SecretPlayerName");
    });

    it("never includes user credentials in the request", async () => {
        const paths = makeHome();
        const user = detailedUser("user-creds", "CredUser");
        await seedScoreUsers(paths, [user]);

        // Place sensitive tokens in credentials.json
        writeFileSync(
            paths.credentials,
            JSON.stringify({
                version: 1,
                users: {
                    "user-creds": {
                        divingFishImportToken: "SUPER-SECRET-DF-TOKEN",
                        lxnsAuthorization: {
                            accessToken: "SUPER-SECRET-ACCESS-TOKEN",
                            refreshToken: "SUPER-SECRET-REFRESH-TOKEN",
                        },
                        lxnsAccountId: 12345,
                    },
                },
            })
        );

        let rawRequestText = "";
        const network = routes({
            [RENDER_ENDPOINT]: request => {
                rawRequestText = JSON.stringify(request);
                return pngResponse();
            },
        });

        const { code } = await commandIn(paths, "b50", ["--image", "creds.png"], {
            network,
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });
        expect(code).toBe(0);
        expect(rawRequestText).not.toContain("SUPER-SECRET-DF-TOKEN");
        expect(rawRequestText).not.toContain("SUPER-SECRET-ACCESS-TOKEN");
        expect(rawRequestText).not.toContain("SUPER-SECRET-REFRESH-TOKEN");
    });

    it("b50 without --image prints image: null and sends nothing to render service", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [detailedUser("user-plain", "User Plain")]);

        let called = false;
        const network = routes({
            [RENDER_ENDPOINT]: () => {
                called = true;
                return pngResponse();
            },
        });

        const { code, json } = await commandIn(paths, "b50", [], {
            network,
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });
        expect(code).toBe(0);
        expect(called).toBe(false);
        expect(json.data.image).toBeNull();
        expectConforms(schemaOf("b50"), json.data);
    });

    it("refuses to overwrite an existing file created while the render request is in flight unless --overwrite", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [detailedUser("user-flight", "Flight User")]);
        const outFile = "flight.png";
        const outPath = path.resolve(paths.home, outFile);

        let renderCalls = 0;
        const network = routes({
            [RENDER_ENDPOINT]: () => {
                renderCalls++;
                writeFileSync(outPath, "created while rendering");
                return pngResponse();
            },
        });

        // Without --overwrite: fails with FILE_EXISTS, outPath unchanged, no .tmp files
        const conflict = await commandIn(paths, "b50", ["--image", outFile], {
            network,
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });
        expect(conflict.code).toBe(2);
        expect(conflict.json.error.code).toBe("FILE_EXISTS");
        expect(conflict.json.error.fix).toBe(`saltnet b50 --image ${outFile} --overwrite`);
        expect(readFileSync(outPath, "utf8")).toBe("created while rendering");
        const tmpFiles = readdirSync(paths.home).filter(f => f.endsWith(".tmp"));
        expect(tmpFiles).toEqual([]);

        // With --overwrite: replaces the file and sets mode 0600
        const overwritten = await commandIn(paths, "b50", ["--image", outFile, "--overwrite"], {
            network,
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });
        expect(overwritten.code).toBe(0);
        expect(renderCalls).toBe(2);
        expect(readFileSync(outPath).equals(SAMPLE_PNG)).toBe(true);
        expect(statSync(outPath).mode & 0o777).toBe(0o600);
    });

    it("rejects unknown --fields before calling render service and before creating the image", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [detailedUser("user-fields", "Fields User")]);

        let requestReached = false;
        const network = routes({
            [RENDER_ENDPOINT]: () => {
                requestReached = true;
                return pngResponse();
            },
        });

        const outFile = "fields-out.png";
        const outPath = path.resolve(paths.home, outFile);

        const result = await commandIn(
            paths,
            "b50",
            ["--image", outFile, "--fields", "nosuchfield"],
            {
                network,
                cwd: paths.home,
                env: { SALTNET_RENDER_URL: RENDER_URL },
            }
        );

        expect(result.code).toBe(2);
        expect(result.json.error.code).toBe("USAGE");
        expect(result.json.error.message).toContain("nosuchfield");
        expect(requestReached).toBe(false);
        expect(existsSync(outPath)).toBe(false);
    });

    it("draws no image and warns NO_IMAGE when selected mode has no charts in either group", async () => {
        const paths = makeHome();
        // detailedUser has no AP scores (detailed records have fc: FullCombo)
        const user = detailedUser("user-no-ap", "No AP User");
        await seedScoreUsers(paths, [user]);

        let requestReached = false;
        const network = routes({
            [RENDER_ENDPOINT]: () => {
                requestReached = true;
                return pngResponse();
            },
        });

        const outFile = "no-ap.png";
        const outPath = path.resolve(paths.home, outFile);

        const result = await commandIn(paths, "b50", ["--mode", "ap", "--image", outFile], {
            network,
            cwd: paths.home,
            env: { SALTNET_RENDER_URL: RENDER_URL },
        });

        expect(result.code).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(result.json.data.image).toBeNull();
        expect(result.json.warnings).toEqual([
            {
                code: "NO_IMAGE",
                message: "选中的模式里没有谱面，没有画图片",
            },
        ]);
        expect(requestReached).toBe(false);
        expect(existsSync(outPath)).toBe(false);
        expectConforms(schemaOf("b50"), result.json.data);
    });
});
