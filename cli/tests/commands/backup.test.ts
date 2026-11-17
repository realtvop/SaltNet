import type { UserDataBackupV1 } from "@core/user/backup";
import type { ScoreHistoryEventV1 } from "@core/user/scoreHistory/type";
import type { User } from "@core/user/type";
import type { RuntimePaths } from "../../src/runtime/paths";
import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ComboStatus, SyncStatus } from "@core/mai/types";
import { decodeUserDataBackup, encodeUserDataBackup } from "@core/user/backup";
import { describe, expect, it } from "vitest";
import { createRegistry } from "../../src/commands";
import { addChartToFavorite, createFavorite, listFavorites } from "../../src/favorites/repository";
import { readCredentials, stageCredentials } from "../../src/runtime/credentials";
import { acquireLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import {
    appendScoreEvents,
    readScoreEvents,
    readUsers,
    replaceUsers,
    saveUser,
} from "../../src/users/repository";
import { splitCommandLine } from "../../src/util/shell";
import { commandIn } from "../commandRun";
import { expectConforms } from "../dataSchema";
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
    users: Record<string, { divingFishImportToken?: unknown; lxnsAuthorization?: unknown }>
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

    it("binds confirmation to file bytes, local update times, event count and --keep-lxns", async () => {
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
            },
            "second-user": {
                lxnsAuthorization: {
                    accessToken: "fake-lxns-access-token-second",
                    refreshToken: "fake-lxns-refresh-token-second",
                },
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
        const credentialsBefore = readFileSync(paths.credentials, "utf8");

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

        expect(readFileSync(paths.credentials, "utf8")).toBe(credentialsBefore);
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
});
