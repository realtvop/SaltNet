import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postAPI, postAPIJSON, SaltAPIEndpoints } from "./index";

type RecordedCall = [url: string, init?: RequestInit];

const FAIL_LOG = "SaltNet request failed:";
const INVALID_LOG = "Invalid SaltNet JSON response:";

function jsonResponse(body: unknown, status = 200, ok = true): Response {
    return {
        ok,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

function unreadableResponse(status = 200, ok = true): Response {
    return {
        ok,
        status,
        json: async () => {
            throw new SyntaxError("Invalid JSON input");
        },
        text: async () => "invalid json",
    } as unknown as Response;
}

function expectPlainError(error: unknown, message: string): void {
    expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
    expect(error).toMatchObject({ message });
    expect(error).not.toHaveProperty("kind");
    expect(error).not.toHaveProperty("status");
}

describe("saltNet web wrappers (index.ts)", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.stubEnv("VITE_API_URL", "https://web-primary.example.test");
        vi.stubEnv("VITE_API_FALLBACK_URL", "https://web-fallback.example.test");
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("sends requests to the addresses from the environment for postAPI", async () => {
        const calls: RecordedCall[] = [];
        const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
            calls.push([url, init]);
            return jsonResponse({ success: true });
        });
        vi.stubGlobal("fetch", mockFetch);

        const body = { qrCode: "dummy-qr" };
        const response = await postAPI(SaltAPIEndpoints.GetQRInfo, body);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toBe("https://web-primary.example.test/getQRInfo");
        expect(calls[0][1]?.method).toBe("POST");
        expect(calls[0][1]?.headers).toEqual({
            "Content-Type": "application/json",
        });
        expect(calls[0][1]?.body).toBe(JSON.stringify(body));
        expect(response.ok).toBe(true);
    });

    it("falls back to the fallback address from the environment when primary fails", async () => {
        const calls: RecordedCall[] = [];
        const networkError = new TypeError("Failed to fetch primary");

        const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
            calls.push([url, init]);
            if (url.startsWith("https://web-primary.example.test")) {
                throw networkError;
            }
            return jsonResponse({ fallback: "ok" });
        });
        vi.stubGlobal("fetch", mockFetch);

        const body = { id: 1234 };
        const ep = SaltAPIEndpoints.UpdateUser;
        const response = await postAPI(ep, body);

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(calls[0][0]).toBe("https://web-primary.example.test/updateUser");
        expect(calls[1][0]).toBe("https://web-fallback.example.test/updateUser");
        expect(response.ok).toBe(true);
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(FAIL_LOG, ep, networkError);
    });

    it("logs on network failure and produces an Error whose String is Error: <message>", async () => {
        const networkError = new TypeError("Connection refused");
        const mockFetch = vi.fn(async () => {
            throw networkError;
        });
        vi.stubGlobal("fetch", mockFetch);

        const ep = SaltAPIEndpoints.CheckLogin;
        const error = await postAPI(ep, { qr: "test" }).catch(err => err);

        expectPlainError(error, "请求游戏API失败，请稍候重试");
        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).toHaveBeenNthCalledWith(1, FAIL_LOG, ep, networkError);
        expect(consoleErrorSpy).toHaveBeenNthCalledWith(2, FAIL_LOG, ep, networkError);
    });

    it("logs network failure through postAPIJSON as well", async () => {
        const networkError = new TypeError("Socket closed");
        const mockFetch = vi.fn(async () => {
            throw networkError;
        });
        vi.stubGlobal("fetch", mockFetch);

        const ep = SaltAPIEndpoints.ClearIllegalTickets;
        const error = await postAPIJSON(ep, {}).catch(err => err);

        expectPlainError(error, "请求游戏API失败，请稍候重试");
        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).toHaveBeenNthCalledWith(1, FAIL_LOG, ep, networkError);
        expect(consoleErrorSpy).toHaveBeenNthCalledWith(2, FAIL_LOG, ep, networkError);
    });

    it("logs invalid JSON through postAPIJSON and produces an Error", async () => {
        const mockFetch = vi.fn(async () => unreadableResponse(200, true));
        vi.stubGlobal("fetch", mockFetch);

        const ep = SaltAPIEndpoints.GetStockedTickets;
        const error = await postAPIJSON(ep, {}).catch(err => err);

        expectPlainError(error, "请求游戏API失败，请稍候重试");
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(INVALID_LOG, ep, expect.any(SyntaxError));
    });

    it("returns data from postAPIJSON and preserves upstream string error messages", async () => {
        const payload = { userId: 999, userName: "Player" };
        const calls: RecordedCall[] = [];
        const mockFetchOk = vi.fn(async (url: string, init?: RequestInit) => {
            calls.push([url, init]);
            return jsonResponse(payload);
        });
        vi.stubGlobal("fetch", mockFetchOk);

        const data = await postAPIJSON(SaltAPIEndpoints.UpdateUser, { userId: 999 });
        expect(data).toEqual(payload);
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toBe("https://web-primary.example.test/updateUser");
        expect(calls[0][1]?.body).toBe(JSON.stringify({ userId: 999 }));

        const mockFetchErr = vi.fn(async () => jsonResponse({ error: "账号已被封禁" }));
        vi.stubGlobal("fetch", mockFetchErr);

        const p = postAPIJSON(SaltAPIEndpoints.UpdateUser, { userId: 999 });
        const error = await p.catch(err => err);
        expectPlainError(error, "账号已被封禁");
    });

    it.each([
        [{ error: "上游拒绝请求" }, "上游拒绝请求"],
        [{ detail: "no string error" }, "请求游戏API失败，请稍候重试"],
    ])("turns HTTP SaltNetError into a plain Error (%j)", async (payload, message) => {
        const mockFetch = vi.fn(async () => jsonResponse(payload, 503, false));
        vi.stubGlobal("fetch", mockFetch);
        const error = await postAPI(SaltAPIEndpoints.CheckLogin, {}).catch(err => err);
        expectPlainError(error, message);
    });

    it.each([
        ["invalid JSON", () => unreadableResponse(), "请求游戏API失败，请稍候重试"],
        ["non-object JSON", () => jsonResponse("text"), "请求游戏API失败，请稍候重试"],
        ["error object", () => jsonResponse({ error: "账号不存在" }), "账号不存在"],
    ])("turns %s response failures into plain Errors", async (_name, response, message) => {
        const mockFetch = vi.fn(async () => response());
        vi.stubGlobal("fetch", mockFetch);
        const error = await postAPIJSON(SaltAPIEndpoints.UpdateUser, {}).catch(err => err);
        expectPlainError(error, message);
    });
});
