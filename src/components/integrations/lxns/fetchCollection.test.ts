import { LXNSCollectionError } from "@core/integrations/lxns/fetchCollection";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLXNSCollections } from "./fetchCollection";

const keysByType: Record<string, string> = {
    trophy: "trophies",
    icon: "icons",
    plate: "plates",
    frame: "frames",
};

/** What one collection request answers unless a test overrides part of it. */
const okAnswer = { ok: true, status: 200, body: undefined as unknown };
type Answer = Partial<typeof okAnswer>;

describe("fetchLXNSCollections web wrapper", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    function mockGlobalFetch(overrides: Record<string, Answer>) {
        const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
            const type = /\/maimai\/(\w+)\/list/.exec(String(input))?.[1] ?? "";
            const answer = { ...okAnswer, ...overrides[type] };
            const body = answer.body ?? { [keysByType[type] ?? type]: [{ id: 1, name: type }] };
            return {
                ok: answer.ok,
                status: answer.status,
                json: async () => body,
                text: async () => "",
            } as unknown as Response;
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        return fetchMock;
    }

    it("resolves to the four arrays with cache: no-store", async () => {
        const fetchMock = mockGlobalFetch({});
        const result = await fetchLXNSCollections();
        expect(result).toEqual({
            trophies: [{ id: 1, name: "trophy" }],
            icons: [{ id: 1, name: "icon" }],
            plates: [{ id: 1, name: "plate" }],
            frames: [{ id: 1, name: "frame" }],
        });
        expect(fetchMock).toHaveBeenCalledTimes(4);
        for (const [, init] of fetchMock.mock.calls) {
            expect(init).toEqual({ cache: "no-store" });
        }
    });

    it("rejects with a plain Error when an HTTP request fails", async () => {
        mockGlobalFetch({ trophy: { ok: false, status: 503 } });
        const error = await fetchLXNSCollections().catch((err: unknown) => err);
        const message = "LXNS collection request failed for trophy (HTTP 503)";
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).constructor).toBe(Error);
        expect(error).not.toBeInstanceOf(LXNSCollectionError);
        expect((error as Error).message).toBe(message);
    });

    it("rejects with a plain Error when the response is malformed", async () => {
        mockGlobalFetch({ trophy: { body: {} } });
        const error = await fetchLXNSCollections().catch((err: unknown) => err);
        const message = "LXNS collection response is malformed for trophy";
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).constructor).toBe(Error);
        expect(error).not.toBeInstanceOf(LXNSCollectionError);
        expect((error as Error).message).toBe(message);
    });

    it("passes other errors through unchanged", async () => {
        globalThis.fetch = vi.fn(async () => {
            return {
                ok: true,
                status: 200,
                json: async () => {
                    throw new SyntaxError("Unexpected token in JSON");
                },
                text: async () => "",
            } as unknown as Response;
        }) as unknown as typeof fetch;

        const error = await fetchLXNSCollections().catch((err: unknown) => err);
        expect(error).toBeInstanceOf(SyntaxError);
        expect((error as SyntaxError).message).toBe("Unexpected token in JSON");
    });
});
