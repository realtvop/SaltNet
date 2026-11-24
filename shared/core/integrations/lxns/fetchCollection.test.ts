import type { FetchLike } from "../../http";
import { describe, expect, it, vi } from "vitest";
import { fetchLXNSCollections, LXNSCollectionError } from "./fetchCollection";

const keysByType: Record<string, string> = {
    trophy: "trophies",
    icon: "icons",
    plate: "plates",
    frame: "frames",
};

function makeFetch(overrides: Record<string, { ok?: boolean; status?: number; body?: unknown }>) {
    return vi.fn<FetchLike>(async input => {
        const type = /\/maimai\/(\w+)\/list/.exec(input)?.[1] ?? "";
        const override = overrides[type];
        return {
            ok: override?.ok ?? true,
            status: override?.status ?? 200,
            json: async () =>
                override?.body ?? { [keysByType[type] ?? type]: [{ id: 1, name: type }] },
            text: async () => "",
        };
    });
}

describe("fetching LXNS collections", () => {
    it("requests the four public lists with their requirements and combines them", async () => {
        const doFetch = makeFetch({});

        const lists = await fetchLXNSCollections({
            fetch: doFetch,
            requestInit: { cache: "no-store" },
        });

        expect(doFetch.mock.calls.map(([url]) => url).sort()).toEqual([
            "https://maimai.lxns.net/api/v0/maimai/frame/list?required=true",
            "https://maimai.lxns.net/api/v0/maimai/icon/list?required=true",
            "https://maimai.lxns.net/api/v0/maimai/plate/list?required=true",
            "https://maimai.lxns.net/api/v0/maimai/trophy/list?required=true",
        ]);
        for (const [, init] of doFetch.mock.calls) {
            expect(init).toEqual({ cache: "no-store" });
        }
        expect(lists).toEqual({
            trophies: [{ id: 1, name: "trophy" }],
            icons: [{ id: 1, name: "icon" }],
            plates: [{ id: 1, name: "plate" }],
            frames: [{ id: 1, name: "frame" }],
        });
    });

    it("uses the configured service address and ignores a trailing slash", async () => {
        const doFetch = makeFetch({});

        await fetchLXNSCollections({
            fetch: doFetch,
            config: { lxnsBaseUrl: "http://127.0.0.1:8080/" },
        });

        expect(doFetch.mock.calls.map(([url]) => url)).toContain(
            "http://127.0.0.1:8080/api/v0/maimai/trophy/list?required=true"
        );
    });

    it("rejects when a list cannot be downloaded", async () => {
        await expect(
            fetchLXNSCollections({ fetch: makeFetch({ icon: { ok: false, status: 502 } }) })
        ).rejects.toThrow("LXNS collection request failed for icon (HTTP 502)");
    });

    it("tells an HTTP failure from a malformed list by the error it rejects with", async () => {
        const http = await fetchLXNSCollections({
            fetch: makeFetch({ frame: { ok: false, status: 503 } }),
        }).catch((error: unknown) => error);
        expect(http).toBeInstanceOf(LXNSCollectionError);
        expect(http).toMatchObject({ kind: "http", collectionType: "frame", status: 503 });

        const malformed = await fetchLXNSCollections({
            fetch: makeFetch({ trophy: { body: {} } }),
        }).catch((error: unknown) => error);
        expect(malformed).toBeInstanceOf(LXNSCollectionError);
        expect(malformed).toMatchObject({ kind: "malformed", collectionType: "trophy" });
        expect((malformed as LXNSCollectionError).status).toBeUndefined();
    });

    it("rejects when a response does not contain the expected list", async () => {
        await expect(
            fetchLXNSCollections({ fetch: makeFetch({ plate: { body: { plates: "nope" } } }) })
        ).rejects.toThrow("LXNS collection response is malformed for plate");
    });
});
