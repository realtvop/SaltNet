import type { ScoreHistoryEventV1 } from "@core/user/scoreHistory/type";
import type { User } from "@core/user/type";
import type { RuntimePaths } from "../../src/runtime/paths";
import { readFileSync } from "node:fs";
import path from "node:path";
import { decodeUserDataBackup } from "@core/user/backup";
import { getUserDisplayName } from "@core/user/type";
import { describe, expect, it } from "vitest";
import { readCredentials } from "../../src/runtime/credentials";
import { openStore } from "../../src/store/store";
import { readScoreEvents, readUsers } from "../../src/users/repository";
import { splitCommandLine } from "../../src/util/shell";
import { commandIn } from "../commandRun";
import { useTempHome } from "../tempHome";
import { useTimeZone } from "../zone";

useTimeZone("America/New_York");

const makeHome = useTempHome();

const FIXTURE_PATH = path.resolve(
    import.meta.dirname,
    "../../../shared/core/fixtures/web-backup-v1.json"
);

const FAKE_SECRETS = [
    "fake-web-fixture-import-token",
    "fake-web-fixture-lxns-access-token",
    "fake-web-fixture-lxns-refresh-token",
] as const;

function expectNoSecrets(...outputs: string[]): void {
    const text = outputs.join("\n");
    for (const secret of FAKE_SECRETS) expect(text).not.toContain(secret);
}

async function previewImport(
    paths: RuntimePaths,
    file: string,
    options: string[] = []
): Promise<Awaited<ReturnType<typeof commandIn>>> {
    const result = await commandIn(paths, "import", [file, ...options]);
    expectNoSecrets(result.stdout, result.stderr);
    return result;
}

async function confirmFrom(
    paths: RuntimePaths,
    preview: Awaited<ReturnType<typeof commandIn>>
): Promise<Awaited<ReturnType<typeof commandIn>>> {
    const args = splitCommandLine(preview.json.error.fix!);
    expect(args.shift()).toBe("saltnet");
    const command = args.shift()!;
    const result = await commandIn(paths, command, args);
    expectNoSecrets(result.stdout, result.stderr);
    return result;
}

async function importFile(
    paths: RuntimePaths,
    file: string,
    options: string[] = []
): Promise<Awaited<ReturnType<typeof commandIn>>> {
    const preview = await previewImport(paths, file, options);
    expect(preview.code).toBe(6);
    expect(preview.json.error.code).toBe("CONFIRMATION_REQUIRED");
    return confirmFrom(paths, preview);
}

function decodeFile(file: string): ReturnType<typeof decodeUserDataBackup> {
    return decodeUserDataBackup(JSON.parse(readFileSync(file, "utf8")));
}

function loadFixture(): { users: User[]; events: ScoreHistoryEventV1[] } {
    return decodeFile(FIXTURE_PATH);
}

function readState(paths: RuntimePaths): { users: User[]; events: ScoreHistoryEventV1[] } {
    const store = openStore(paths);
    try {
        return { users: readUsers(store), events: readScoreEvents(store) };
    } finally {
        store.close();
    }
}

function withoutImportIdentity(
    event: ScoreHistoryEventV1
): Omit<ScoreHistoryEventV1, "id" | "generationId"> {
    const { id: _id, generationId: _generationId, ...rest } = event;
    return rest;
}

/**
 * Sorts score history events the way SQLite repository queries order them:
 * by observed_at, sequence.
 */
function sortByDbOrder(events: readonly ScoreHistoryEventV1[]): ScoreHistoryEventV1[] {
    return [...events].sort((a, b) => a.observedAt - b.observedAt || a.sequence - b.sequence);
}

describe("backup round trip with web v1 fixture", () => {
    it("previews and imports the web file, stripping tokens to credentials and rewriting events", async () => {
        const { users: fixtureUsers, events: fixtureEvents } = loadFixture();
        const paths = makeHome();

        const preview = await previewImport(paths, FIXTURE_PATH);
        expect(preview.code).toBe(6);
        expect(preview.json.error.code).toBe("CONFIRMATION_REQUIRED");
        expect(preview.json.error.preview).toMatchObject({
            file: {
                version: 1,
            },
            users: [
                { index: 0, uid: fixtureUsers[0].uid, name: getUserDisplayName(fixtureUsers[0]) },
                { index: 1, uid: fixtureUsers[1].uid, name: getUserDisplayName(fixtureUsers[1]) },
            ],
            eventCount: 4,
            divingFishTokenCount: 1,
            keepLxns: false,
        });

        const confirmed = await confirmFrom(paths, preview);
        expect(confirmed.code).toBe(0);
        expect(confirmed.json.data).toMatchObject({
            userCount: 2,
            eventCount: 4,
            divingFishTokenCount: 1,
            lxnsAuthorizationCount: 0,
        });

        const listResult = await commandIn(paths, "user", ["list"]);
        expectNoSecrets(listResult.stdout, listResult.stderr);
        expect(listResult.code).toBe(0);
        expect(listResult.json.data.items).toEqual([
            expect.objectContaining({
                index: 0,
                uid: fixtureUsers[0].uid,
                name: getUserDisplayName(fixtureUsers[0]),
            }),
            expect.objectContaining({
                index: 1,
                uid: fixtureUsers[1].uid,
                name: getUserDisplayName(fixtureUsers[1]),
            }),
        ]);

        const stored = readState(paths);
        const expectedUsers = [
            {
                ...fixtureUsers[0],
                divingFish: { ...fixtureUsers[0].divingFish, importToken: null },
                lxns: fixtureUsers[0].lxns ? { ...fixtureUsers[0].lxns, auth: null } : null,
            },
            fixtureUsers[1],
        ];
        expect(stored.users).toEqual(expectedUsers);

        const credentials = readCredentials(paths);
        expect(Object.keys(credentials.users)).toEqual([fixtureUsers[0].uid]);
        expect(credentials.users[fixtureUsers[0].uid as string]).toEqual({
            divingFishImportToken: "fake-web-fixture-import-token",
        });

        expect(stored.events).toHaveLength(4);
        const generations = new Set(stored.events.map(event => event.generationId));
        expect(generations.size).toBe(1);
        const [generation] = [...generations];
        expect(generation).toMatch(/^import-/);
        for (const event of stored.events) {
            expect(event.id).toBe(
                `${generation}:${event.userUid}:${event.batchId}:${event.chartKey}:${event.sequence}:${event.kind}`
            );
        }
        expect(stored.events.map(withoutImportIdentity)).toEqual(
            sortByDbOrder(fixtureEvents).map(withoutImportIdentity)
        );
    });

    it("exports the imported state back to a web backup, restoring the Import-Token and omitting LXNS", async () => {
        const { users: fixtureUsers, events: fixtureEvents } = loadFixture();
        const paths = makeHome();
        await importFile(paths, FIXTURE_PATH);

        const exportFile = path.join(paths.home, "exported-web-default.json");
        const exportResult = await commandIn(paths, "export", [exportFile]);
        expectNoSecrets(exportResult.stdout, exportResult.stderr);
        expect(exportResult.code).toBe(0);
        expect(exportResult.json.data).toMatchObject({
            containsDivingFishTokens: true,
            containsLxnsAuthorizations: false,
            divingFishTokenCount: 1,
            lxnsAuthorizationCount: 0,
        });

        const decoded = decodeFile(exportFile);
        const expectedExportedUsers = [
            {
                ...fixtureUsers[0],
                lxns: fixtureUsers[0].lxns ? { ...fixtureUsers[0].lxns, auth: null } : null,
            },
            fixtureUsers[1],
        ];
        expect(decoded.users).toEqual(expectedExportedUsers);
        expect(decoded.events.map(withoutImportIdentity)).toEqual(
            sortByDbOrder(fixtureEvents).map(withoutImportIdentity)
        );
    });

    it("round-trips with --keep-lxns, preserving exact JSON representations and unknown fields", async () => {
        const { users: fixtureUsers } = loadFixture();
        const paths = makeHome();

        const imported = await importFile(paths, FIXTURE_PATH, ["--keep-lxns"]);
        expect(imported.code).toBe(0);
        expect(imported.json.data).toMatchObject({
            userCount: 2,
            eventCount: 4,
            divingFishTokenCount: 1,
            lxnsAuthorizationCount: 1,
        });

        const exportFile = path.join(paths.home, "exported-keep.json");
        const exported = await commandIn(paths, "export", [exportFile, "--keep-lxns"]);
        expectNoSecrets(exported.stdout, exported.stderr);
        expect(exported.code).toBe(0);
        expect(exported.json.data).toMatchObject({
            containsDivingFishTokens: true,
            containsLxnsAuthorizations: true,
            divingFishTokenCount: 1,
            lxnsAuthorizationCount: 1,
        });

        const decoded = decodeFile(exportFile);
        expect(decoded.users).toEqual(fixtureUsers);
        expect(decoded.users).toHaveLength(fixtureUsers.length);
        for (let i = 0; i < fixtureUsers.length; i++) {
            expect(JSON.stringify(decoded.users[i])).toBe(JSON.stringify(fixtureUsers[i]));
        }
    });

    it("changes nothing on a second round trip with --keep-lxns", async () => {
        const paths1 = makeHome();
        await importFile(paths1, FIXTURE_PATH, ["--keep-lxns"]);
        const file1 = path.join(paths1.home, "export-1.json");
        const export1 = await commandIn(paths1, "export", [file1, "--keep-lxns"]);
        expectNoSecrets(export1.stdout, export1.stderr);
        expect(export1.code).toBe(0);
        const decoded1 = decodeFile(file1);

        const paths2 = makeHome();
        const imported2 = await importFile(paths2, file1, ["--keep-lxns"]);
        expect(imported2.code).toBe(0);
        const file2 = path.join(paths2.home, "export-2.json");
        const export2 = await commandIn(paths2, "export", [file2, "--keep-lxns"]);
        expectNoSecrets(export2.stdout, export2.stderr);
        expect(export2.code).toBe(0);
        const decoded2 = decodeFile(file2);

        expect(decoded2.users.map(u => JSON.stringify(u))).toEqual(
            decoded1.users.map(u => JSON.stringify(u))
        );
        expect(decoded2.events.map(withoutImportIdentity)).toEqual(
            decoded1.events.map(withoutImportIdentity)
        );
    });

    it("uses imported scores in commands, including detailed records and partial B50 scores", async () => {
        const { users: fixtureUsers } = loadFixture();
        const paths = makeHome();
        await importFile(paths, FIXTURE_PATH);

        // Pick record for chart 131-4 (Link, Master, grade 4, non-utage)
        const record0 = fixtureUsers[0].data.detailed!["131-4"];
        expect(record0).toBeDefined();

        const chart0 = await commandIn(paths, "chart", ["131-4"]);
        expectNoSecrets(chart0.stdout, chart0.stderr);
        expect(chart0.code).toBe(0);
        expect(chart0.json.data.score).toMatchObject({
            achievements: record0.achievements,
            dxScore: record0.dxScore,
            combo: "FC",
        });

        // Chart 131-4 is also in user 1's public B50
        const b50Record = fixtureUsers[1].data.b50!.sd.find(
            record => record.song_id === 131 && record.level_index === 4
        );
        expect(b50Record).toBeDefined();

        const chart1 = await commandIn(paths, "chart", ["131-4", "--user", "1"]);
        expectNoSecrets(chart1.stdout, chart1.stderr);
        expect(chart1.code).toBe(0);
        expect(chart1.json.data.score).toMatchObject({
            achievements: b50Record!.achievements,
            dxScore: b50Record!.dxScore,
            combo: "FC",
        });
        expect(chart1.json.warnings).toEqual([
            {
                code: "PARTIAL_SCORES",
                message: "只拿到了水鱼公开的 B50，其他谱面没有成绩",
            },
        ]);

        // A chart not in user 1's B50 (e.g. 11726-3 Trust DX) returns score: null with PARTIAL_SCORES
        const chart1Absent = await commandIn(paths, "chart", ["11726-3", "--user", "1"]);
        expectNoSecrets(chart1Absent.stdout, chart1Absent.stderr);
        expect(chart1Absent.code).toBe(0);
        expect(chart1Absent.json.data.score).toBeNull();
        expect(chart1Absent.json.warnings).toEqual([
            {
                code: "PARTIAL_SCORES",
                message: "只拿到了水鱼公开的 B50，其他谱面没有成绩",
            },
        ]);
    });
});
