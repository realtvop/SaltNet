import type { UserDataBackupV1 } from "@core/user/backup";
import type { ScoreHistoryEventV1 } from "@core/user/scoreHistory/type";
import type { User } from "@core/user/type";
import type { RuntimePaths } from "../../src/runtime/paths";
import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ComboStatus, SyncStatus } from "@core/mai/types";
import { decodeUserDataBackup, encodeUserDataBackup } from "@core/user/backup";
import * as backupModule from "@core/user/backup";
import { describe, expect, it, vi } from "vitest";
import { createRegistry } from "../../src/commands";
import * as confirmation from "../../src/commands/confirm";
import { addChartToFavorite, createFavorite, listFavorites } from "../../src/favorites/repository";
import { readCredentials, stageCredentials } from "../../src/runtime/credentials";
import * as credentialsModule from "../../src/runtime/credentials";
import { acquireLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import { buildUserForCore } from "../../src/sync/sources";
import {
    appendScoreEvents,
    readScoreEvents,
    readUsers,
    replaceUsers,
    saveUser,
} from "../../src/users/repository";
import * as userRepository from "../../src/users/repository";
import { splitCommandLine } from "../../src/util/shell";
import { commandIn, NOW } from "../commandRun";
import { expectConforms } from "../dataSchema";
import { parsePrintedCommand } from "../printedCommand";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();
const FAKE_SECRETS = [
    "fake-import-token-1",
    "fake-import-token-2",
    "fake-lxns-access-token-1",
    "fake-lxns-refresh-token-1",
    "fake-lxns-access-token-own",
    "fake-lxns-refresh-token-own",
    "fake-lxns-access-token-incoming",
    "fake-lxns-refresh-token-incoming",
    "fake-import-token-corrupt",
    "fake-import-token-first",
    "fake-import-token-preview-1",
    "fake-import-token-preview-2",
    "fake-lxns-access-token-first",
    "fake-lxns-access-token-second",
    "fake-lxns-refresh-token-first",
    "fake-lxns-refresh-token-second",
    "fake-lxns-confirmation-outcome",
    "fake-lxns-crash-window-old-account",
    "fake-lxns-account-rule",
    "fake-lxns-export-mismatch",
] as const;

const registry = createRegistry();
const importSchema = registry.find("import")!.spec.dataSchema!;
const exportSchema = registry.find("export")!.spec.dataSchema!;

function webUsers(): User[] {
    return [
        {
            uid: "user-one",
            remark: null,
            divingFish: { name: "Fish one", importToken: "fake-import-token-1" },
            lxns: {
                auth: {
                    accessToken: "fake-lxns-access-token-1",
                    refreshToken: "fake-lxns-refresh-token-1",
                    tokenType: "Bearer",
                    expiresAt: null,
                },
                name: "Snow one",
                id: 101,
            },
            inGame: { id: null, enabled: false, useFastUpdate: false },
            settings: { manuallyUpdate: false },
            data: {
                updateTime: 1234,
                name: "Player one",
                rating: 15000,
                ratingHistory: [],
            },
            futureRoot: { missingFromUserType: null },
        } as User,
        {
            uid: "user-two",
            remark: "Second",
            divingFish: { name: null },
            inGame: { id: null, enabled: false, useFastUpdate: false },
            settings: { manuallyUpdate: true },
            data: { updateTime: null, name: null, rating: null, futureData: null },
        } as User,
    ];
}

function scoreEvents(): ScoreHistoryEventV1[] {
    return [
        {
            id: "old-event-1",
            schemaVersion: 1,
            generationId: "old-generation",
            batchId: "batch-1",
            userUid: "user-one",
            chartKey: "8-0",
            observedAt: 1000,
            sequence: 0,
            source: "inGame",
            kind: "initial",
            changedMask: 0,
            state: {
                achievements: 99.5,
                dxScore: 1000,
                fc: ComboStatus.None,
                fs: SyncStatus.None,
                playCount: null,
            },
        },
        {
            id: "old-event-2",
            schemaVersion: 1,
            generationId: "old-generation",
            batchId: "batch-2",
            userUid: "user-two",
            chartKey: "9-3",
            observedAt: 2000,
            sequence: 1,
            source: "lxns",
            kind: "change",
            changedMask: 3,
            state: {
                achievements: 100,
                dxScore: 1200,
                fc: ComboStatus.FullCombo,
                fs: SyncStatus.Sync,
                playCount: 4,
            },
        },
    ];
}

function storedUser(uid = "stored-user", lxnsId: number | null = 900): User {
    return {
        uid,
        remark: "Stored",
        divingFish: { name: null, importToken: null },
        lxns: { auth: null, name: "Stored LXNS", id: lxnsId },
        inGame: { id: null, enabled: false, useFastUpdate: false },
        settings: { manuallyUpdate: false },
        data: { updateTime: 99, name: null, rating: null },
    };
}

function storedEvent(userUid = "stored-user"): ScoreHistoryEventV1 {
    return { ...scoreEvents()[0], id: "stored-event", userUid };
}

function writeBackup(
    paths: RuntimePaths,
    name: string,
    users: User[] = webUsers(),
    events: ScoreHistoryEventV1[] = scoreEvents()
): string {
    const file = path.join(path.dirname(paths.home), name);
    writeFileSync(file, `${JSON.stringify(encodeUserDataBackup(users, events, 123456))}\n`);
    return file;
}

function seed(paths: RuntimePaths, users: User[], events: ScoreHistoryEventV1[]): void {
    const store = openStore(paths);
    try {
        replaceUsers(store, users, events);
    } finally {
        store.close();
    }
}

function seedCredentials(
    paths: RuntimePaths,
    users: Record<
        string,
        {
            divingFishImportToken?: unknown;
            lxnsAuthorization?: unknown;
            lxnsAccountId?: unknown;
            lxnsIssuedAt?: unknown;
        }
    >
): void {
    const staged = stageCredentials(paths, { version: 1, users });
    staged.commit();
}

function readState(paths: RuntimePaths): { users: User[]; events: ScoreHistoryEventV1[] } {
    const store = openStore(paths);
    try {
        return { users: readUsers(store), events: readScoreEvents(store) };
    } finally {
        store.close();
    }
}

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

function withoutImportIdentity(
    event: ScoreHistoryEventV1
): Omit<ScoreHistoryEventV1, "id" | "generationId"> {
    const { id: _id, generationId: _generationId, ...rest } = event;
    return rest;
}

describe("backup import and export", () => {
    it("round-trips arbitrary web users and events, rewriting every event like the web app", async () => {
        const paths = makeHome();
        const original = writeBackup(paths, "source.json");
        const imported = await importFile(paths, original, ["--keep-lxns"]);
        expect(imported.code).toBe(0);
        expect(imported.json.data).toMatchObject({
            userCount: 2,
            eventCount: 2,
            divingFishTokenCount: 1,
            lxnsAuthorizationCount: 1,
        });
        expectConforms(importSchema, imported.json.data);

        const stored = readState(paths);
        expect(stored.users[0].divingFish.importToken).toBeNull();
        expect(stored.users[0].lxns?.auth).toBeNull();
        const generations = new Set(stored.events.map(event => event.generationId));
        expect(generations.size).toBe(1);
        const generation = [...generations][0];
        expect(generation).toMatch(/^import-/);
        for (const event of stored.events) {
            expect(event.id).toBe(
                `${generation}:${event.userUid}:${event.batchId}:${event.chartKey}:${event.sequence}:${event.kind}`
            );
        }
        expect(stored.events.map(withoutImportIdentity)).toEqual(
            scoreEvents().map(withoutImportIdentity)
        );

        const exportedFile = path.join(path.dirname(paths.home), "exported.json");
        const exported = await commandIn(paths, "export", [exportedFile, "--keep-lxns"]);
        expectNoSecrets(exported.stdout, exported.stderr);
        expect(exported.code).toBe(0);
        expectConforms(exportSchema, exported.json.data);
        expect(exported.json.data).toMatchObject({
            userCount: 2,
            eventCount: 2,
            containsDivingFishTokens: true,
            divingFishTokenCount: 1,
            containsLxnsAuthorizations: true,
            lxnsAuthorizationCount: 1,
        });
        expect(decodeFile(exportedFile).users).toEqual(decodeFile(original).users);
        expect(decodeFile(exportedFile).events).toEqual(stored.events);
        if (process.platform !== "win32") expect(statSync(exportedFile).mode & 0o777).toBe(0o600);

        const importedAgain = await importFile(paths, exportedFile, ["--keep-lxns"]);
        expect(importedAgain.code).toBe(0);
        const secondState = readState(paths);
        expect(secondState.users).toEqual(stored.users);
        expect(secondState.events.map(withoutImportIdentity)).toEqual(
            stored.events.map(withoutImportIdentity)
        );
        expect(secondState.events[0].generationId).not.toBe(stored.events[0].generationId);
        if (process.platform !== "win32") {
            expect(statSync(paths.credentials).mode & 0o777).toBe(0o600);
        }
    });

    it("drops LXNS on either side unless requested, while always restoring Import-Token", async () => {
        const importedWithout = makeHome();
        const source = writeBackup(importedWithout, "without.json");
        expect((await importFile(importedWithout, source)).code).toBe(0);
        expect(
            readCredentials(importedWithout).users["user-one"]?.lxnsAuthorization
        ).toBeUndefined();
        const output = path.join(path.dirname(importedWithout.home), "without-output.json");
        const exported = await commandIn(importedWithout, "export", [output, "--keep-lxns"]);
        expectNoSecrets(exported.stdout, exported.stderr);
        const users = decodeFile(output).users;
        expect(users[0].divingFish.importToken).toBe("fake-import-token-1");
        expect(users[0].lxns?.auth).toBeNull();

        const importedWith = makeHome();
        const withSource = writeBackup(importedWith, "with.json");
        expect((await importFile(importedWith, withSource, ["--keep-lxns"])).code).toBe(0);
        const withoutLxns = path.join(path.dirname(importedWith.home), "export-no-lxns.json");
        const result = await commandIn(importedWith, "export", [withoutLxns]);
        expectNoSecrets(result.stdout, result.stderr);
        const withoutUsers = decodeFile(withoutLxns).users;
        expect(withoutUsers[0].divingFish.importToken).toBe("fake-import-token-1");
        expect(withoutUsers[0].lxns?.auth).toBeNull();
    });

    it("exports users and score events from one database snapshot", async () => {
        const paths = makeHome();
        const oldUser = storedUser("old-user");
        const oldEvent = storedEvent("old-user");
        seed(paths, [oldUser], [oldEvent]);
        const writer = openStore(paths);
        const originalReadEvents = userRepository.readScoreEvents;
        const spy = vi.spyOn(userRepository, "readScoreEvents").mockImplementation((store, uid) => {
            replaceUsers(writer, [storedUser("new-user")], [storedEvent("new-user")]);
            return originalReadEvents(store, uid);
        });
        const target = path.join(path.dirname(paths.home), "snapshot-export.json");
        try {
            const result = await commandIn(paths, "export", [target]);
            expect(result.code).toBe(0);
            const decoded = decodeFile(target);
            expect(decoded.users.map(user => user.uid)).toEqual(["old-user"]);
            expect(decoded.events.map(event => event.userUid)).toEqual(["old-user"]);
        } finally {
            spy.mockRestore();
            writer.close();
        }
    });

    it("imports v0 backups, assigns uids and has no score history", async () => {
        const paths = makeHome();
        const users = webUsers().map(user => {
            const { uid: _uid, ...withoutUid } = user;
            return withoutUid;
        });
        const file = path.join(path.dirname(paths.home), "v0.json");
        writeFileSync(
            file,
            JSON.stringify({
                version: 0,
                users: Buffer.from(JSON.stringify(users), "utf8").toString("base64"),
            })
        );
        const preview = await previewImport(paths, file);
        expect(preview.json.error.preview.file).toEqual({ path: file, version: 0 });
        const imported = await confirmFrom(paths, preview);
        expect(imported.code).toBe(0);
        const state = readState(paths);
        expect(state.users).toHaveLength(2);
        expect(state.users.every(user => typeof user.uid === "string" && user.uid.length > 0)).toBe(
            true
        );
        expect(state.events).toEqual([]);
    });

    it("puts -- before an import file beginning with - in the printed confirmation command", async () => {
        const paths = makeHome();
        const file = writeBackup(paths, "-backup.json");
        const cwd = path.dirname(file);
        const preview = await commandIn(paths, "import", ["--", "-backup.json"], { cwd });
        expect(preview.code).toBe(6);
        const words = splitCommandLine(preview.json.error.fix!);
        expect(words).toEqual([
            "saltnet",
            "import",
            "--yes",
            preview.json.error.confirmationCode,
            "--",
            "-backup.json",
        ]);

        words.shift();
        const command = words.shift()!;
        const confirmed = await commandIn(paths, command, words, { cwd });
        expect(confirmed.code).toBe(0);
    });

    it("binds confirmation to file bytes, every overwritten row and --keep-lxns", async () => {
        const paths = makeHome();
        seed(paths, [storedUser()], [storedEvent()]);
        const file = writeBackup(paths, "confirm.json");
        const preview = await previewImport(paths, file);
        expect(preview.code).toBe(6);
        expect(preview.json.error.codeRejected).toBe(false);
        expect(preview.json.error.fix).toContain(`import ${file}`);

        const wrong = await previewImport(paths, file, ["--yes", "WRONG"]);
        expect(wrong.code).toBe(6);
        expect(wrong.json.error.codeRejected).toBe(true);

        const fileCode = preview.json.error.confirmationCode as string;
        const changed = JSON.parse(readFileSync(file, "utf8")) as UserDataBackupV1;
        changed.exportedAt++;
        writeFileSync(file, JSON.stringify(changed));
        const staleFile = await previewImport(paths, file, ["--yes", fileCode]);
        expect(staleFile.code).toBe(6);
        expect(staleFile.json.error.codeRejected).toBe(true);

        const fresh = await previewImport(paths, file);
        const store = openStore(paths);
        try {
            const current = readUsers(store)[0];
            saveUser(store, { ...current, data: { ...current.data, updateTime: 100 } });
        } finally {
            store.close();
        }
        const staleLocal = await previewImport(paths, file, [
            "--yes",
            fresh.json.error.confirmationCode as string,
        ]);
        expect(staleLocal.code).toBe(6);
        expect(staleLocal.json.error.codeRejected).toBe(true);

        const eventPreview = await previewImport(paths, file);
        const eventStore = openStore(paths);
        try {
            appendScoreEvents(eventStore, [
                {
                    ...storedEvent(),
                    id: "another-stored-event",
                    chartKey: "9-0",
                },
            ]);
        } finally {
            eventStore.close();
        }
        const staleEventCount = await previewImport(paths, file, [
            "--yes",
            eventPreview.json.error.confirmationCode as string,
        ]);
        expect(staleEventCount.code).toBe(6);
        expect(staleEventCount.json.error.codeRejected).toBe(true);

        const noFlag = await previewImport(paths, file);
        const changedFlag = await previewImport(paths, file, [
            "--keep-lxns",
            "--yes",
            noFlag.json.error.confirmationCode as string,
        ]);
        expect(changedFlag.code).toBe(6);
        expect(changedFlag.json.error.codeRejected).toBe(true);

        const confirmed = await confirmFrom(paths, noFlag);
        expect(confirmed.code).toBe(0);
    });

    it("keeps the same import code with no change and rejects a remark edit or user reorder", async () => {
        const paths = makeHome();
        seed(paths, [storedUser("first"), storedUser("second")], []);
        const file = writeBackup(paths, "confirmation-user-rows.json");

        const preview = await previewImport(paths, file);
        const repeated = await previewImport(paths, file);
        expect(repeated.json.error.confirmationCode).toBe(preview.json.error.confirmationCode);

        const edited = await commandIn(paths, "user", ["edit", "0", "--remark", "changed"]);
        expect(edited.code).toBe(0);
        const staleRemark = await previewImport(paths, file, [
            "--yes",
            preview.json.error.confirmationCode as string,
        ]);
        expect(staleRemark.json.error).toMatchObject({ codeRejected: true });

        const reorderPreview = await previewImport(paths, file);
        const reordered = await commandIn(paths, "user", ["default", "1"]);
        expect(reordered.code).toBe(0);
        const staleOrder = await previewImport(paths, file, [
            "--yes",
            reorderPreview.json.error.confirmationCode as string,
        ]);
        expect(staleOrder.json.error).toMatchObject({ codeRejected: true });
    });

    it("rejects an import code after a projected score changes without changing updateTime", async () => {
        const paths = makeHome();
        const user = storedUser("scored-user");
        user.data.detailed = {
            "1-0": {
                song_id: 1,
                type: "SD",
                level_index: 0,
                ds: 1,
                achievements: 90,
            },
        } as unknown as User["data"]["detailed"];
        seed(paths, [user], []);
        const file = writeBackup(paths, "confirmation-score-row.json");
        const preview = await previewImport(paths, file);

        const store = openStore(paths);
        try {
            const current = readUsers(store)[0];
            const record = current.data.detailed!["1-0"];
            saveUser(store, {
                ...current,
                data: {
                    ...current.data,
                    detailed: {
                        ...current.data.detailed,
                        "1-0": { ...record, achievements: 91 },
                    },
                },
            });
        } finally {
            store.close();
        }

        const stale = await previewImport(paths, file, [
            "--yes",
            preview.json.error.confirmationCode as string,
        ]);
        expect(stale.json.error).toMatchObject({ codeRejected: true });
    });

    it("binds import confirmation to whether a matching LXNS authorization will be kept", async () => {
        const paths = makeHome();
        seed(paths, [storedUser("same-user", 900)], []);
        const incoming = storedUser("same-user", 900);
        const file = writeBackup(paths, "confirmation-credentials.json", [incoming], []);
        const preview = await previewImport(paths, file);

        seedCredentials(paths, {
            "same-user": {
                lxnsAuthorization: { accessToken: "fake-lxns-confirmation-outcome" },
                lxnsAccountId: 900,
            },
        });
        const stale = await previewImport(paths, file, [
            "--yes",
            preview.json.error.confirmationCode as string,
        ]);
        expect(stale.json.error).toMatchObject({ codeRejected: true });
        expectNoSecrets(stale.stdout, stale.stderr);
    });

    it.each([
        {
            name: "keeps the CLI authorization when uid and LXNS id match",
            importedId: 900,
            keep: false,
            expected: "fake-lxns-access-token-own",
        },
        {
            name: "drops the CLI authorization when the LXNS id changes",
            importedId: 901,
            keep: false,
            expected: undefined,
        },
        {
            name: "uses the incoming authorization with --keep-lxns",
            importedId: 900,
            keep: true,
            expected: "fake-lxns-access-token-incoming",
        },
    ])("$name", async ({ importedId, keep, expected }) => {
        const paths = makeHome();
        seed(paths, [storedUser("same-user", 900)], []);
        seedCredentials(paths, {
            "same-user": {
                lxnsAuthorization: {
                    accessToken: "fake-lxns-access-token-own",
                    refreshToken: "fake-lxns-refresh-token-own",
                },
                lxnsAccountId: 900,
            },
        });
        const incoming = storedUser("same-user", importedId) as User;
        incoming.lxns!.auth = {
            accessToken: "fake-lxns-access-token-incoming",
            refreshToken: "fake-lxns-refresh-token-incoming",
            tokenType: "Bearer",
        };
        const file = writeBackup(paths, `policy-${importedId}-${keep}.json`, [incoming], []);
        const result = await importFile(paths, file, keep ? ["--keep-lxns"] : []);
        expect(result.code).toBe(0);
        const authorization = readCredentials(paths).users["same-user"]?.lxnsAuthorization as
            | { accessToken?: string }
            | undefined;
        expect(authorization?.accessToken).toBe(expected);
        expectNoSecrets(result.stdout, result.stderr);
        if (process.platform !== "win32") {
            expect(statSync(paths.credentials).mode & 0o777).toBe(0o600);
        }
    });

    it.each([
        ["keeps null for an imported user whose LXNS id is also null", true, null, true],
        ["does not trust an old entry without lxnsAccountId", false, undefined, false],
    ])("%s", async (_name, hasMember, accountId, expectedKept) => {
        const paths = makeHome();
        seed(paths, [storedUser("same-user", null)], []);
        seedCredentials(paths, {
            "same-user": {
                lxnsAuthorization: { accessToken: "fake-lxns-account-rule" },
                ...(hasMember ? { lxnsAccountId: accountId } : {}),
            },
        });
        const source = writeBackup(paths, "account-rule.json", [storedUser("same-user", null)], []);
        const imported = await importFile(paths, source);
        expect(imported.code).toBe(0);
        expect(readCredentials(paths).users["same-user"]?.lxnsAuthorization !== undefined).toBe(
            expectedKept
        );
    });

    it("exports LXNS only when its recorded account matches the stored user", async () => {
        const paths = makeHome();
        seed(paths, [storedUser("same-user", 900)], []);
        seedCredentials(paths, {
            "same-user": {
                lxnsAuthorization: { accessToken: "fake-lxns-export-mismatch" },
                lxnsAccountId: 901,
            },
        });
        const target = path.join(path.dirname(paths.home), "mismatched-lxns-export.json");
        const result = await commandIn(paths, "export", [target, "--keep-lxns"]);
        expect(result.code).toBe(0);
        expect(result.json.data.lxnsAuthorizationCount).toBe(0);
        expect(decodeFile(target).users[0].lxns?.auth).toBeNull();
    });

    it("rejects malformed backups without changing users, events or credentials", async () => {
        const paths = makeHome();
        seed(paths, [storedUser()], [storedEvent()]);
        seedCredentials(paths, {
            "stored-user": { divingFishImportToken: "fake-import-token-2" },
        });
        const before = readState(paths);
        const credentialsBefore = readFileSync(paths.credentials, "utf8");
        const base = encodeUserDataBackup(webUsers(), scoreEvents(), 123);
        const cases: [string, unknown | string][] = [
            ["not-json", "this is not JSON"],
            ["wrong-version", { ...base, version: 2 }],
            ["bad-users", { ...base, users: Buffer.from(JSON.stringify([{}])).toString("base64") }],
            [
                "bad-events",
                {
                    ...base,
                    scoreHistory: {
                        ...base.scoreHistory!,
                        eventCount: 1,
                        data: Buffer.from(JSON.stringify([{}])).toString("base64"),
                    },
                },
            ],
            [
                "count-mismatch",
                { ...base, scoreHistory: { ...base.scoreHistory!, eventCount: 99 } },
            ],
            [
                "unsafe-sequence",
                encodeUserDataBackup(
                    webUsers(),
                    [{ ...scoreEvents()[0], sequence: Number.MAX_SAFE_INTEGER + 1 }],
                    123
                ),
            ],
            [
                "unsafe-dx-score",
                encodeUserDataBackup(
                    webUsers(),
                    [
                        {
                            ...scoreEvents()[0],
                            state: {
                                ...scoreEvents()[0].state,
                                dxScore: Number.MAX_SAFE_INTEGER + 1,
                            },
                        },
                    ],
                    123
                ),
            ],
            [
                "unsafe-play-count",
                encodeUserDataBackup(
                    webUsers(),
                    [
                        {
                            ...scoreEvents()[0],
                            state: {
                                ...scoreEvents()[0].state,
                                playCount: Number.MAX_SAFE_INTEGER + 1,
                            },
                        },
                    ],
                    123
                ),
            ],
        ];

        for (const [name, content] of cases) {
            const file = path.join(path.dirname(paths.home), `${name}.json`);
            writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
            const result = await previewImport(paths, file);
            expect(result.code, name).toBe(2);
            expect(result.json.error.code, name).toBe("INVALID_BACKUP");
            expect(readState(paths), name).toEqual(before);
            expect(readFileSync(paths.credentials, "utf8"), name).toBe(credentialsBefore);
        }
    });

    it("reports a corrupt credentials file without exposing or replacing it", async () => {
        const paths = makeHome();
        seed(paths, [storedUser()], []);
        const corrupt = `{"token":"fake-import-token-corrupt"`;
        writeFileSync(paths.credentials, corrupt, { mode: 0o600 });
        const source = writeBackup(paths, "corrupt-credentials-import.json");
        const imported = await previewImport(paths, source);
        expect(imported.code).toBe(1);
        expect(readFileSync(paths.credentials, "utf8")).toBe(corrupt);

        const target = path.join(path.dirname(paths.home), "corrupt-export.json");
        const exported = await commandIn(paths, "export", [target]);
        expect(exported.code).toBe(1);
        expectNoSecrets(exported.stdout, exported.stderr);
        expect(readFileSync(paths.credentials, "utf8")).toBe(corrupt);
        expect(() => readFileSync(target)).toThrow();
    });

    it("adds credential locations that are not present yet in users.raw", async () => {
        const paths = makeHome();
        const noPlaces = storedUser("later-bound") as User & { lxns?: unknown };
        noPlaces.divingFish = { name: null };
        delete noPlaces.lxns;
        seed(paths, [noPlaces], []);
        seedCredentials(paths, {
            "later-bound": {
                divingFishImportToken: "fake-import-token-2",
                lxnsAuthorization: {
                    accessToken: "fake-lxns-access-token-own",
                    refreshToken: "fake-lxns-refresh-token-own",
                },
                lxnsAccountId: null,
            },
        });
        const target = path.join(path.dirname(paths.home), "later-bound.json");
        const result = await commandIn(paths, "export", [target, "--keep-lxns"]);
        expectNoSecrets(result.stdout, result.stderr);
        expect(result.code).toBe(0);
        const [user] = decodeFile(target).users;
        expect(user.divingFish.importToken).toBe("fake-import-token-2");
        expect(user.lxns?.auth).toEqual({
            accessToken: "fake-lxns-access-token-own",
            refreshToken: "fake-lxns-refresh-token-own",
        });
    });

    it("handles export existence, overwrite, private mode, missing directories and no users", async () => {
        const paths = makeHome();
        seed(paths, [storedUser()], []);
        seedCredentials(paths, {
            "stored-user": { divingFishImportToken: "fake-import-token-2" },
        });
        const target = path.join(path.dirname(paths.home), "existing.json");
        writeFileSync(target, "old", { mode: 0o644 });
        const exists = await commandIn(paths, "export", [target]);
        expectNoSecrets(exists.stdout, exists.stderr);
        expect(exists.code).toBe(2);
        expect(exists.json.error.code).toBe("FILE_EXISTS");
        expect(readFileSync(target, "utf8")).toBe("old");

        const overwritten = await commandIn(paths, "export", [target, "--overwrite"]);
        expectNoSecrets(overwritten.stdout, overwritten.stderr);
        expect(overwritten.code).toBe(0);
        expect(decodeFile(target).users[0].divingFish.importToken).toBe("fake-import-token-2");
        if (process.platform !== "win32") expect(statSync(target).mode & 0o777).toBe(0o600);

        const missing = path.join(path.dirname(paths.home), "missing", "backup.json");
        const missingResult = await commandIn(paths, "export", [missing]);
        expectNoSecrets(missingResult.stdout, missingResult.stderr);
        expect(missingResult.code).toBe(2);
        expect(missingResult.json.error.code).toBe("USAGE");
        expect(missingResult.json.error.message).toContain(path.dirname(missing));
        expect(existsSync(path.dirname(missing))).toBe(false);

        const empty = makeHome();
        mkdirSync(empty.home, { recursive: true });
        const noUserTarget = path.join(path.dirname(empty.home), "no-user.json");
        const noUser = await commandIn(empty, "export", [noUserTarget]);
        expect(noUser.code).toBe(4);
        expect(noUser.json.error.code).toBe("NO_USER");
        expect(() => readFileSync(noUserTarget)).toThrow();
    });

    it("prints an overwrite fix for a file that starts with - that runs as printed", async () => {
        const paths = makeHome();
        seed(paths, [storedUser()], []);
        const cwd = path.dirname(paths.home);
        const target = path.join(cwd, "-existing.json");
        writeFileSync(target, "old");

        const exists = await commandIn(paths, "export", ["--keep-lxns", "--", "-existing.json"], {
            cwd,
        });
        expect(exists.json.error.code).toBe("FILE_EXISTS");
        const fix = exists.json.error.fix!;
        expect(fix).toBe("saltnet export ./-existing.json --keep-lxns --overwrite");
        expect(parsePrintedCommand(fix)).toMatchObject({
            command: "export",
            positionals: { file: "./-existing.json" },
            options: { keepLxns: true, overwrite: true },
        });
        expect(readFileSync(target, "utf8")).toBe("old");

        const words = splitCommandLine(fix);
        const rerun = await commandIn(paths, words[1], words.slice(2), { cwd });
        expect(rerun.code).toBe(0);
        expect(decodeFile(target).users).toHaveLength(1);
    });

    it("refuses to overwrite a file created after the early check without --overwrite", async () => {
        const paths = makeHome();
        seed(paths, [storedUser()], []);
        const cwd = path.dirname(paths.home);
        const filePath = path.join(cwd, "late-export.json");

        const spy = vi
            .spyOn(backupModule, "encodeUserDataBackup")
            .mockImplementationOnce((users, events, time) => {
                writeFileSync(filePath, "created after early check");
                return backupModule.encodeUserDataBackup(users, events, time);
            });

        try {
            const resFail = await commandIn(paths, "export", [filePath], { cwd });
            expect(resFail.code).toBe(2);
            expect(resFail.json.error.code).toBe("FILE_EXISTS");
            expect(resFail.json.error.fix).toBe(`saltnet export ${filePath} --overwrite`);
            expect(readFileSync(filePath, "utf8")).toBe("created after early check");
            const tmpFiles = readdirSync(cwd).filter(f => f.endsWith(".tmp"));
            expect(tmpFiles).toEqual([]);
        } finally {
            spy.mockRestore();
        }

        const resSuccess = await commandIn(paths, "export", [filePath, "--overwrite"], { cwd });
        expect(resSuccess.code).toBe(0);
        expect(readFileSync(filePath, "utf8")).not.toBe("created after early check");
        expect(statSync(filePath).mode & 0o777).toBe(0o600);
    });

    it("treats null credentials as absent during import", async () => {
        const paths = makeHome();
        const user = storedUser("user-null-cred", 900);
        user.divingFish = { name: null, importToken: null };
        user.lxns = { auth: null, name: "LXNS", id: 900 };
        const file = writeBackup(paths, "null-credentials.json", [user], []);
        const imported = await importFile(paths, file);
        expect(imported.code).toBe(0);
        expect(imported.json.data).toMatchObject({
            divingFishTokenCount: 0,
            lxnsAuthorizationCount: 0,
        });
        expect(Object.keys(readCredentials(paths).users)).toHaveLength(0);
    });

    it("lists only users with credentials in credentials.json", async () => {
        const paths = makeHome();
        const user1 = storedUser("user-with-token", 900);
        user1.divingFish = { name: "Fish 1", importToken: "fake-import-token-first" };
        const user2 = storedUser("user-without-token", 901);
        user2.divingFish = { name: "Fish 2", importToken: null };
        const file = writeBackup(paths, "only-users-with-cred.json", [user1, user2], []);
        const imported = await importFile(paths, file);
        expect(imported.code).toBe(0);
        expect(Object.keys(readCredentials(paths).users)).toEqual(["user-with-token"]);
    });

    it("counts the Import-Tokens of the file in the preview", async () => {
        const paths = makeHome();
        const user1 = storedUser("user-token-1", 900);
        user1.divingFish = { name: "Fish 1", importToken: "fake-import-token-preview-1" };
        const user2 = storedUser("user-token-2", 901);
        user2.divingFish = { name: "Fish 2", importToken: "fake-import-token-preview-2" };
        const user3 = storedUser("user-token-null", 902);
        user3.divingFish = { name: "Fish 3", importToken: null };
        const file = writeBackup(paths, "preview-tokens.json", [user1, user2, user3], []);
        const preview = await previewImport(paths, file);
        expect(preview.code).toBe(6);
        expect(preview.json.error.code).toBe("CONFIRMATION_REQUIRED");
        expect(preview.json.error.preview.divingFishTokenCount).toBe(2);
    });

    it("preserves each current user's own LXNS authorization on import without --keep-lxns", async () => {
        const paths = makeHome();
        const current1 = storedUser("first-user", 900);
        const current2 = storedUser("second-user", 901);
        seed(paths, [current1, current2], []);
        seedCredentials(paths, {
            "first-user": {
                lxnsAuthorization: {
                    accessToken: "fake-lxns-access-token-first",
                    refreshToken: "fake-lxns-refresh-token-first",
                },
                lxnsAccountId: 900,
            },
            "second-user": {
                lxnsAuthorization: {
                    accessToken: "fake-lxns-access-token-second",
                    refreshToken: "fake-lxns-refresh-token-second",
                },
                lxnsAccountId: 901,
            },
        });
        const incoming1 = storedUser("first-user", 900);
        const incoming2 = storedUser("second-user", 901);
        const file = writeBackup(paths, "keep-own-lxns.json", [incoming1, incoming2], []);
        const imported = await importFile(paths, file);
        expect(imported.code).toBe(0);
        const credentials = readCredentials(paths);
        const auth1 = credentials.users["first-user"]?.lxnsAuthorization as
            | { accessToken?: string }
            | undefined;
        const auth2 = credentials.users["second-user"]?.lxnsAuthorization as
            | { accessToken?: string }
            | undefined;
        expect(auth1?.accessToken).toBe("fake-lxns-access-token-first");
        expect(auth2?.accessToken).toBe("fake-lxns-access-token-second");
    });

    it("--keep-lxns falls back to the default rule for users without incoming authorization", async () => {
        const paths1 = makeHome();
        seed(paths1, [storedUser("same-user", 900)], []);
        seedCredentials(paths1, {
            "same-user": {
                lxnsAuthorization: {
                    accessToken: "fake-lxns-access-token-own",
                    refreshToken: "fake-lxns-refresh-token-own",
                },
                lxnsAccountId: 900,
            },
        });
        const incomingSameId = storedUser("same-user", 900);
        const file1 = writeBackup(paths1, "keep-fallback-same.json", [incomingSameId], []);
        const result1 = await importFile(paths1, file1, ["--keep-lxns"]);
        expect(result1.code).toBe(0);
        const auth1 = readCredentials(paths1).users["same-user"]?.lxnsAuthorization as
            | { accessToken?: string }
            | undefined;
        expect(auth1?.accessToken).toBe("fake-lxns-access-token-own");

        const paths2 = makeHome();
        seed(paths2, [storedUser("same-user", 900)], []);
        seedCredentials(paths2, {
            "same-user": {
                lxnsAuthorization: {
                    accessToken: "fake-lxns-access-token-own",
                    refreshToken: "fake-lxns-refresh-token-own",
                },
                lxnsAccountId: 900,
            },
        });
        const incomingDiffId = storedUser("same-user", 901);
        const file2 = writeBackup(paths2, "keep-fallback-diff.json", [incomingDiffId], []);
        const result2 = await importFile(paths2, file2, ["--keep-lxns"]);
        expect(result2.code).toBe(0);
        const auth2 = readCredentials(paths2).users["same-user"]?.lxnsAuthorization;
        expect(auth2).toBeUndefined();
    });

    it("reports specific decode reasons in INVALID_BACKUP messages", async () => {
        const paths = makeHome();
        seed(paths, [storedUser()], [storedEvent()]);
        seedCredentials(paths, {
            "stored-user": { divingFishImportToken: "fake-import-token-2" },
        });
        const before = readState(paths);
        const credentialsBefore = readFileSync(paths.credentials, "utf8");

        const base = encodeUserDataBackup(webUsers(), scoreEvents(), 123);

        const cases: [string, Record<string, unknown>, string][] = [
            ["version-3", { ...base, version: 3 }, "不支持的备份版本"],
            [
                "count-mismatch-one-more",
                {
                    ...base,
                    scoreHistory: {
                        ...base.scoreHistory!,
                        eventCount: scoreEvents().length + 1,
                    },
                },
                "成绩历史数量不一致",
            ],
            ["bad-base64-users", { ...base, users: "%%%" }, "JSON 或编码内容无效"],
        ];

        for (const [name, content, expectedReason] of cases) {
            const file = path.join(path.dirname(paths.home), `${name}.json`);
            writeFileSync(file, JSON.stringify(content));
            const result = await previewImport(paths, file);
            expect(result.code, name).toBe(2);
            expect(result.json.error.code, name).toBe("INVALID_BACKUP");
            expect(result.json.error.message, name).toContain(expectedReason);
            expect(readState(paths), name).toEqual(before);
            expect(readFileSync(paths.credentials, "utf8"), name).toBe(credentialsBefore);
        }
    });

    it("rejects invalid UTF-8 even inside a string", async () => {
        const paths = makeHome();
        const file = writeBackup(paths, "invalid-utf8.json");
        const originalBytes = readFileSync(file);
        const tipMarker = Buffer.from('"tip":"');
        const tipIndex = originalBytes.indexOf(tipMarker);
        expect(tipIndex).toBeGreaterThan(-1);
        const valueStartIndex = tipIndex + tipMarker.length;
        const quoteIndex = originalBytes.indexOf(Buffer.from('"'), valueStartIndex);
        expect(quoteIndex).toBeGreaterThan(-1);

        const corruptedBytes = Buffer.concat([
            originalBytes.subarray(0, valueStartIndex),
            Buffer.from([0xff]),
            originalBytes.subarray(quoteIndex),
        ]);
        writeFileSync(file, corruptedBytes);

        const result = await previewImport(paths, file);
        expect(result.code).toBe(2);
        expect(result.json.error.code).toBe("INVALID_BACKUP");
        expect(result.json.error.message).toContain("不是有效的 UTF-8 JSON");
    });

    it("fails before preview when backup contains data user tables cannot store", async () => {
        const paths = makeHome();
        seed(paths, [storedUser()], [storedEvent()]);
        seedCredentials(paths, {
            "stored-user": { divingFishImportToken: "fake-import-token-2" },
        });
        const before = readState(paths);
        const credentialsBefore = readFileSync(paths.credentials, "utf8");

        const userWithBadSettings = {
            ...storedUser("bad-settings-user"),
            settings: { manuallyUpdate: "yes" as unknown as boolean },
        };
        const userWithBadLxns = {
            ...storedUser("bad-lxns-user"),
            lxns: 5 as unknown as User["lxns"],
        };

        const cases: [string, User][] = [
            ["bad-settings", userWithBadSettings],
            ["bad-lxns", userWithBadLxns],
        ];

        for (const [name, badUser] of cases) {
            const file = writeBackup(paths, `${name}.json`, [badUser], []);
            const result = await previewImport(paths, file);
            expect(result.code, name).toBe(2);
            expect(result.json.error.code, name).toBe("INVALID_BACKUP");
            expect(result.json.error.message, name).toContain(
                "含有 CLI 无法保存的用户数据或成绩历史"
            );
            expect(result.json.error.fix, name).toBeUndefined();
            expect(readState(paths), name).toEqual(before);
            expect(readFileSync(paths.credentials, "utf8"), name).toBe(credentialsBefore);
        }
    });

    it("leaves no staged file when import transaction fails", async () => {
        const paths = makeHome();
        seed(paths, [storedUser()], []);
        seedCredentials(paths, {
            "stored-user": { divingFishImportToken: "fake-import-token-1" },
        });
        const before = readState(paths);

        const store = openStore(paths);
        try {
            store.db.exec(
                "CREATE TRIGGER made_up_failure BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT, 'made-up failure'); END;"
            );
        } finally {
            store.close();
        }

        const source = writeBackup(paths, "trigger-fail.json");
        const preview = await previewImport(paths, source);
        expect(preview.code).toBe(6);
        expect(preview.json.error.code).toBe("CONFIRMATION_REQUIRED");

        const confirmation = await confirmFrom(paths, preview);
        expect(confirmation.code).toBe(1);
        expect(confirmation.json.error.code).toBe("INTERNAL");

        expect(readCredentials(paths).users).toEqual({});
        const tmpFiles = readdirSync(paths.home).filter(name => name.endsWith(".tmp"));
        expect(tmpFiles).toEqual([]);
        expect(readState(paths)).toEqual(before);
    });

    it("counts UTF-8 bytes in export byteSize", async () => {
        const paths = makeHome();
        const user = storedUser("chinese-user");
        user.remark = "测试中文备注内容";
        user.data.name = "舞萌测试玩家";
        seed(paths, [user], []);

        const target = path.join(path.dirname(paths.home), "chinese-export.json");
        const result = await commandIn(paths, "export", [target]);
        expectNoSecrets(result.stdout, result.stderr);
        expect(result.code).toBe(0);

        const fileSize = statSync(target).size;
        const fileText = readFileSync(target, "utf8");

        expect(result.json.data.byteSize).toBe(fileSize);
        expect(result.json.data.byteSize).not.toBe(fileText.length);
        expect(result.json.data.byteSize).toBeGreaterThan(fileText.length);
    });

    it("fails when export target parent is a regular file", async () => {
        const paths = makeHome();
        seed(paths, [storedUser()], []);

        const existingFile = path.join(path.dirname(paths.home), "regular-file");
        writeFileSync(existingFile, "not a directory", "utf8");
        const target = path.join(existingFile, "backup.json");

        const result = await commandIn(paths, "export", [target]);
        expectNoSecrets(result.stdout, result.stderr);
        expect(result.code).toBe(2);
        expect(result.json.error.code).toBe("USAGE");
        expect(result.json.error.message).toContain(existingFile);
    });

    it("leaves existing favorites untouched during backup import", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        try {
            const fav = createFavorite(store, "保留的收藏夹");
            addChartToFavorite(store, fav.id, 146, 3);
        } finally {
            store.close();
        }

        const source = writeBackup(paths, "source.json");
        const imported = await importFile(paths, source);
        expect(imported.code).toBe(0);

        const storeAfter = openStore(paths);
        try {
            const favorites = listFavorites(storeAfter);
            expect(favorites).toHaveLength(1);
            expect(favorites[0]).toMatchObject({
                name: "保留的收藏夹",
                count: 1,
                musicIds: [146],
            });
        } finally {
            storeAfter.close();
        }
    });

    it("fails with DB_LOCKED and changes neither database nor credentials when credentials lock is held during import", async () => {
        const paths = makeHome();
        const initialUser = storedUser("original-user");
        seed(paths, [initialUser], []);

        const initialCreds = {
            version: 1 as const,
            users: { "original-user": { divingFishImportToken: "fake-df-original" } },
        };
        const staged = stageCredentials(paths, initialCreds);
        staged.commit();

        const store = openStore(paths);
        const locked = acquireLock(store, "credentials", { ttlMs: 10_000 });
        expect(locked.acquired).toBe(true);

        const source = writeBackup(paths, "source.json");
        const result = await commandIn(paths, "import", [source]);
        expect(result.code).toBe(7);
        expect(result.json.error).toMatchObject({
            code: "DB_LOCKED",
            retryable: true,
            message: expect.stringContaining("正在改凭据文件；稍后再试"),
        });

        // Database and credentials file are unchanged
        expect(readState(paths).users.map(u => u.uid)).toEqual(["original-user"]);
        expect(readCredentials(paths)).toEqual(initialCreds);

        if (locked.acquired) locked.lock.release();
        store.close();
    });

    it("drops pending authorizations after import", async () => {
        const paths = makeHome();
        seed(paths, [storedUser("initial-user")], []);

        const initialCreds = {
            version: 1 as const,
            users: { "initial-user": { divingFishImportToken: "fake-df" } },
            pendingLxnsAuthorizations: {
                pending1: {
                    userUid: "initial-user",
                    codeVerifier: "a".repeat(43),
                    clientId: "client-id",
                    redirectUri: "https://example.com",
                    expiresAt: Date.now() + 60_000,
                },
            },
        };
        const staged = stageCredentials(paths, initialCreds);
        staged.commit();

        const source = writeBackup(paths, "source.json");
        const imported = await importFile(paths, source);
        expect(imported.code).toBe(0);

        const credsAfter = readCredentials(paths);
        expect(credsAfter.pendingLxnsAuthorizations).toBeUndefined();
    });

    it("does not reattach an old account authorization when a failed credentials rename is retried", async () => {
        const paths = makeHome();
        seed(paths, [storedUser("same-user", 900)], []);
        seedCredentials(paths, {
            "same-user": {
                lxnsAuthorization: { accessToken: "fake-lxns-crash-window-old-account" },
                lxnsAccountId: 900,
            },
        });
        const incoming = storedUser("same-user", 901);
        const source = writeBackup(paths, "crash-window.json", [incoming], []);

        let renames = 0;
        const realStage = credentialsModule.stageCredentials;
        const stageSpy = vi
            .spyOn(credentialsModule, "stageCredentials")
            .mockImplementation((runtimePaths, content) => {
                const staged = realStage(runtimePaths, content);
                return {
                    ...staged,
                    commit() {
                        if (++renames === 2)
                            throw new Error("made-up final credentials rename failure");
                        staged.commit();
                    },
                };
            });
        try {
            const preview = await previewImport(paths, source);
            const failed = await confirmFrom(paths, preview);
            expect(failed.code).toBe(1);
            expect(readState(paths).users[0].lxns?.id).toBe(901);
            expect(readCredentials(paths).users["same-user"]?.lxnsAccountId).toBeUndefined();
        } finally {
            stageSpy.mockRestore();
        }

        const retried = await importFile(paths, source);
        expect(retried.code).toBe(0);
        expect(readCredentials(paths).users["same-user"]?.lxnsAuthorization).toBeUndefined();
        expect(readCredentials(paths).users["same-user"]?.lxnsAccountId).toBeUndefined();

        const target = path.join(path.dirname(paths.home), "crash-window-export.json");
        const exported = await commandIn(paths, "export", [target, "--keep-lxns"]);
        expect(exported.code).toBe(0);
        expect(exported.json.data.lxnsAuthorizationCount).toBe(0);
        expect(decodeFile(target).users[0].lxns?.auth).toBeNull();
    });

    it("refuses import while any user sync lock is live and changes nothing", async () => {
        const paths = makeHome();
        seed(paths, [storedUser("u1")], [storedEvent("u1")]);
        seedCredentials(paths, {
            u1: { divingFishImportToken: "fake-import-token-1" },
        });
        const before = readState(paths);
        const credentialsBefore = readFileSync(paths.credentials, "utf8");
        const source = writeBackup(paths, "sync-lock-test.json");

        // 1. Without confirmation: lock held before calling import -> fails with SYNC_IN_PROGRESS immediately
        const store = openStore(paths);
        const lock1 = acquireLock(store, "sync:u1", { ttlMs: 60_000 });
        expect(lock1.acquired).toBe(true);

        const unconfirmed = await commandIn(paths, "import", [source]);
        expect(unconfirmed.code).toBe(7);
        expect(unconfirmed.json.error).toMatchObject({
            code: "SYNC_IN_PROGRESS",
            retryable: true,
        });

        // Verify nothing changed
        expect(readState(paths)).toEqual(before);
        expect(readFileSync(paths.credentials, "utf8")).toBe(credentialsBefore);
        const tmpFiles1 = readdirSync(paths.home).filter(name => name.endsWith(".tmp"));
        expect(tmpFiles1).toEqual([]);
        expect(store.db.prepare("SELECT count(*) AS n FROM sync_runs").get()).toEqual({ n: 0 });

        // Release the lock
        if (lock1.acquired) lock1.lock.release();

        // 2. With confirmation: preview first (no lock), then take lock, then confirm
        const preview = await previewImport(paths, source);
        expect(preview.code).toBe(6);
        expect(preview.json.error.code).toBe("CONFIRMATION_REQUIRED");

        // Now acquire lock before confirmation is executed
        const lock2 = acquireLock(store, "sync:other_user", { ttlMs: 60_000 });
        expect(lock2.acquired).toBe(true);

        const confirmed = await confirmFrom(paths, preview);
        expect(confirmed.code).toBe(7);
        expect(confirmed.json.error).toMatchObject({
            code: "SYNC_IN_PROGRESS",
            retryable: true,
        });

        // Verify nothing changed
        expect(readState(paths)).toEqual(before);
        expect(readFileSync(paths.credentials, "utf8")).toBe(credentialsBefore);
        const tmpFiles2 = readdirSync(paths.home).filter(name => name.endsWith(".tmp"));
        expect(tmpFiles2).toEqual([]);
        expect(store.db.prepare("SELECT count(*) AS n FROM sync_runs").get()).toEqual({ n: 0 });

        if (lock2.acquired) lock2.lock.release();
        store.close();
    });

    it("does not block import when an expired sync lock exists", async () => {
        const paths = makeHome();
        seed(paths, [storedUser("u1")], []);
        const store = openStore(paths);
        // Acquire lock in the past relative to harness clock (NOW) so it is already expired
        acquireLock(store, "sync:u1", {
            ttlMs: 100,
            now: () => NOW.getTime() - 200_000,
        });
        store.close();

        const source = writeBackup(paths, "expired-lock.json");
        const imported = await importFile(paths, source);
        expect(imported.code).toBe(0);
    });

    it("writes exactly one sync_runs row on successful import visible through v_sync_runs", async () => {
        const paths = makeHome();
        const incomingUsers = webUsers(); // 2 users
        const incomingEvents = scoreEvents(); // 2 events
        const source = writeBackup(paths, "journal-test.json", incomingUsers, incomingEvents);

        const imported = await importFile(paths, source);
        expect(imported.code).toBe(0);

        const res = await commandIn(paths, "sql", ["SELECT * FROM v_sync_runs"]);
        expect(res.code).toBe(0);
        const items = res.json.data.items as Record<string, unknown>[];
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            kind: "import",
            user_uid: null,
            user_name: null,
            source: null,
            mode: null,
            outcome: "ok",
            error_code: null,
            error_message: null,
            summary: JSON.stringify({ users: 2, scoreEvents: 2 }),
            cli_version: "9.9.9",
        });
        expect(items[0].started_at).toBeTruthy();
        expect(items[0].finished_at).toBeTruthy();
        expect(items[0].started_at).toBe(items[0].finished_at);
    });

    it("leaves no journal row when import transaction fails", async () => {
        const paths = makeHome();
        seed(paths, [storedUser()], []);
        const store = openStore(paths);
        store.db.exec(
            "CREATE TRIGGER test_fail_users BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT, 'boom'); END;"
        );
        store.close();

        const source = writeBackup(paths, "trigger-journal-fail.json");
        const preview = await previewImport(paths, source);
        expect(preview.code).toBe(6);

        const failed = await confirmFrom(paths, preview);
        expect(failed.code).not.toBe(0);

        const storeAfter = openStore(paths);
        expect(storeAfter.db.prepare("SELECT count(*) AS n FROM sync_runs").get()).toEqual({
            n: 0,
        });
        storeAfter.close();
    });
});

it.each(["remark", "score event"])("rechecks import after a concurrent %s", async change => {
    const paths = makeHome();
    const oldUser = storedUser();
    seed(paths, [oldUser], []);
    const source = writeBackup(paths, "racing-import.json", webUsers(), []);
    const preview = await previewImport(paths, source);
    const writer = openStore(paths);
    const requireConfirmation = confirmation.requireConfirmation;
    const spy = vi
        .spyOn(confirmation, "requireConfirmation")
        .mockImplementationOnce((given, state) => {
            requireConfirmation(given, state);
            if (change === "remark")
                userRepository.saveUser(writer, { ...oldUser, remark: "Concurrent edit" });
            else userRepository.appendScoreEvents(writer, [storedEvent()]);
        });
    try {
        const result = await confirmFrom(paths, preview);
        expect(result.json.error).toMatchObject({
            code: "CONFIRMATION_REQUIRED",
            codeRejected: true,
        });
        expect(readState(paths)).toEqual({
            users: [change === "remark" ? { ...oldUser, remark: "Concurrent edit" } : oldUser],
            events: change === "remark" ? [] : [storedEvent()],
        });
        expect(existsSync(paths.credentials)).toBe(false);
        expect((await confirmFrom(paths, result)).code).toBe(0);
        expect(readState(paths).users.map(user => user.uid)).toEqual(
            webUsers().map(user => user.uid)
        );
    } finally {
        spy.mockRestore();
        writer.close();
    }
});

it("holds every stored and incoming sync lock through the final credential rename", async () => {
    const paths = makeHome();
    seed(paths, [storedUser("same-user"), storedUser("removed-user")], []);
    seedCredentials(paths, { "same-user": { divingFishImportToken: "fake-old-import-token" } });
    const replacement = storedUser("same-user");
    replacement.divingFish = { name: null, importToken: "fake-new-import-token" };
    const source = writeBackup(paths, "new-users.json", [replacement, storedUser("new-user")], []);
    const writer = openStore(paths);
    const attempts: boolean[] = [];
    const now = new Date();
    let syncAttempt: ReturnType<typeof commandIn> | undefined;
    const realStage = credentialsModule.stageCredentials;
    const spy = vi
        .spyOn(credentialsModule, "stageCredentials")
        .mockImplementation((runtimePaths, content) => {
            const staged = realStage(runtimePaths, content);
            return {
                ...staged,
                commit() {
                    if (
                        content.users["same-user"]?.divingFishImportToken ===
                        "fake-new-import-token"
                    ) {
                        syncAttempt = commandIn(
                            paths,
                            "sync",
                            ["--user", "same-user", "--source", "df-token"],
                            { now, network: {} }
                        );
                        for (const uid of ["same-user", "removed-user", "new-user"]) {
                            const lock = acquireLock(writer, `sync:${uid}`, {
                                ttlMs: 60_000,
                                now: () => now.getTime(),
                            });
                            attempts.push(lock.acquired);
                            if (lock.acquired) lock.lock.release();
                        }
                    }
                    staged.commit();
                },
            };
        });
    try {
        const preview = await previewImport(paths, source);
        const fix = splitCommandLine(preview.json.error.fix!).slice(2);
        expect((await commandIn(paths, "import", fix, { now })).code).toBe(0);
        expect(attempts).toEqual([false, false, false]);
        const sync = await syncAttempt;
        expect(sync?.json.error.code).toBe("SYNC_IN_PROGRESS");
        expect(sync?.requests).toEqual([]);
        expect(readCredentials(paths).users["same-user"]?.divingFishImportToken).toBe(
            "fake-new-import-token"
        );
    } finally {
        spy.mockRestore();
        writer.close();
    }
});

it.each(["credential removal", "database replacement", "final credentials"])(
    "leaves matching credentials or none when import stops before %s",
    async stop => {
        const paths = makeHome();
        const before = { ...storedUser("same-user"), remark: "Previous profile" };
        const after = {
            ...before,
            remark: "Replacement profile",
            divingFish: { name: null, importToken: "fake-new-import-token" },
        };
        seed(paths, [before], []);
        seedCredentials(paths, { "same-user": { divingFishImportToken: "fake-old-import-token" } });
        const source = writeBackup(paths, "stopped.json", [after], []);
        const preview = await previewImport(paths, source);
        const realStage = credentialsModule.stageCredentials;
        const stageSpy = vi
            .spyOn(credentialsModule, "stageCredentials")
            .mockImplementation((runtimePaths, content) => {
                const staged = realStage(runtimePaths, content);
                const final =
                    content.users["same-user"]?.divingFishImportToken === "fake-new-import-token";
                return {
                    ...staged,
                    commit() {
                        if (
                            (stop === "credential removal" && !final) ||
                            (stop === "final credentials" && final)
                        ) {
                            throw new Error("made-up stopped rename");
                        }
                        staged.commit();
                    },
                };
            });
        const replaceSpy =
            stop === "database replacement"
                ? vi.spyOn(userRepository, "replaceUsers").mockImplementationOnce(() => {
                      throw new Error("made-up stopped transaction");
                  })
                : undefined;
        try {
            const result = await confirmFrom(paths, preview);
            expect(result.json.error?.code).toBe("INTERNAL");
            const [stored] = readState(paths).users;
            expect(stored.remark).toBe(stop === "final credentials" ? after.remark : before.remark);
            const expected = stop === "credential removal" ? "fake-old-import-token" : undefined;
            expect(readCredentials(paths).users["same-user"]?.divingFishImportToken).toBe(expected);
            expect(buildUserForCore(stored, paths).divingFish?.importToken).toBe(expected ?? null);
            expect(readdirSync(paths.home).filter(name => name.endsWith(".tmp"))).toEqual([]);
        } finally {
            stageSpy.mockRestore();
            replaceSpy?.mockRestore();
        }
    }
);

it("keeps the status and warning for a retained LXNS authorization", async () => {
    const paths = makeHome();
    const original = storedUser("same-user", 900);
    seed(paths, [original], []);
    seedCredentials(paths, {
        "same-user": {
            lxnsAccountId: 900,
            lxnsAuthorization: {
                accessToken: "fake-access-for-status",
                refreshToken: "fake-refresh-for-status",
            },
            lxnsIssuedAt: NOW.getTime() - 28 * 86_400_000,
        },
    });
    const source = writeBackup(paths, "keep-issued-at.json", [original], []);
    const before = await commandIn(paths, "status", []);
    expect(before.json.warnings).toEqual([expect.objectContaining({ code: "LXNS_EXPIRING" })]);
    expect((await importFile(paths, source)).code).toBe(0);
    const after = await commandIn(paths, "status", []);
    expect(after.json.data.users.items[0].credentials).toEqual(
        before.json.data.users.items[0].credentials
    );
    expect(after.json.warnings).toEqual(before.json.warnings);
});

it("confirms a v1 backup without score history when uids are missing or duplicate", async () => {
    const uids: string[][] = [];
    for (let run = 0; run < 2; run++) {
        const paths = makeHome();
        const missing = storedUser();
        delete missing.uid;
        const backup = encodeUserDataBackup(
            [missing, storedUser("duplicate"), storedUser("duplicate")],
            [],
            123456
        );
        const source = path.join(path.dirname(paths.home), "no-history.json");
        const { scoreHistory: _history, ...withoutHistory } = backup;
        writeFileSync(source, JSON.stringify(withoutHistory));
        expect((await importFile(paths, source)).code).toBe(0);
        uids.push(readState(paths).users.map(user => user.uid!));
    }
    expect(uids[0]).toEqual(uids[1]);
    expect(new Set(uids[0]).size).toBe(3);
    expect(uids[0][1]).toBe("duplicate");
});

it.each(["bind", "remove"])(
    "preserves a __proto__ credential during an unrelated %s",
    async operation => {
        const paths = makeHome();
        const uid = "__proto__";
        const special = storedUser(uid);
        special.divingFish = { name: null, importToken: "fake-token-for-proto" };
        const source = writeBackup(paths, "proto.json", [special, storedUser("other-user")], []);
        expect((await importFile(paths, source)).code).toBe(0);
        expect(Object.hasOwn(readCredentials(paths).users, uid)).toBe(true);
        if (operation === "bind") {
            const bound = await commandIn(paths, "user", ["bind", "other-user", "lxns"], {
                env: {
                    SALTNET_LXNS_CLIENT_ID: "fake-client",
                    SALTNET_LXNS_REDIRECT_URI: "https://callback.test",
                },
            });
            expect(bound.code).toBe(0);
        } else {
            const preview = await commandIn(paths, "user", ["remove", "other-user"]);
            const removed = await commandIn(
                paths,
                "user",
                splitCommandLine(preview.json.error.fix!).slice(2)
            );
            expect(removed.code).toBe(0);
        }
        const credentials = readCredentials(paths);
        expect(Object.hasOwn(credentials.users, uid)).toBe(true);
        expect(credentials.users[uid]?.divingFishImportToken).toBe("fake-token-for-proto");
        const output = path.join(path.dirname(paths.home), "proto-export.json");
        expect((await commandIn(paths, "export", [output])).code).toBe(0);
        expect(decodeFile(output).users[0].divingFish?.importToken).toBe("fake-token-for-proto");
    }
);
