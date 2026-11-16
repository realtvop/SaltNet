import { DivingFishError } from "@core/integrations/diving-fish/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPlayerData, fetchPlayerRecordsByImportToken } from "./player";

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

describe("diving-fish player web wrappers", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("turns DivingFishError into a plain Error on HTTP 401 for fetchPlayerRecordsByImportToken", async () => {
        const mock = vi.fn().mockResolvedValue(jsonResponse({ message: "invalid token" }, 401));
        vi.stubGlobal("fetch", mock);

        const token = "fake-import-token-0123456789";
        const error = await fetchPlayerRecordsByImportToken(token).catch(err => err);

        expect(error).toBeDefined();
        expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
        expect(error).not.toBeInstanceOf(DivingFishError);
        expect(String(error)).toBe("Error: invalid token");
    });

    it("turns DivingFishError into a plain Error and logs on HTTP 404 for fetchPlayerData", async () => {
        const mock = vi.fn().mockResolvedValue(jsonResponse({ message: "not found" }, 404));
        vi.stubGlobal("fetch", mock);

        const error = await fetchPlayerData("missinguser").catch(err => err);

        expect(error).toBeDefined();
        expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
        expect(error).not.toBeInstanceOf(DivingFishError);
        expect(String(error)).toBe("Error: user not exists");
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith("Error fetching player data:", error);
    });

    it("turns DivingFishError into a plain Error on HTTP 500 for fetchPlayerData", async () => {
        const mock = vi.fn().mockResolvedValue(jsonResponse({ message: "busy" }, 500));
        vi.stubGlobal("fetch", mock);

        const error = await fetchPlayerData("testuser").catch(err => err);

        expect(error).toBeDefined();
        expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
        expect(error).not.toBeInstanceOf(DivingFishError);
        expect(String(error)).toBe("Error: busy");
    });

    it("passes through network TypeError unchanged and logs in fetchPlayerData", async () => {
        const networkError = new TypeError("Failed to fetch");
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

        await expect(fetchPlayerData("testuser")).rejects.toBe(networkError);
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith("Error fetching player data:", networkError);

        const token = "fake-import-token-0123456789";
        await expect(fetchPlayerRecordsByImportToken(token)).rejects.toBe(networkError);
    });

    it("sends player query request with expected URL, method, headers, and body", async () => {
        const payload = {
            username: "testuser",
            nickname: "tester",
            rating: 15000,
            charts: { dx: [], sd: [] },
        };
        const mockFetch = vi.fn().mockResolvedValue(jsonResponse(payload));
        vi.stubGlobal("fetch", mockFetch);

        await fetchPlayerData("testuser");

        const expectedUrl = "https://www.diving-fish.com/api/maimaidxprober/query/player";
        const expectedOptions = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ username: "testuser", b50: "1" }),
        };

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expectedOptions);
    });

    it("sends player records request with expected URL, method, headers, and body", async () => {
        const token = "fake-import-token-0123456789";
        const payload = {
            additional_rating: 0,
            nickname: "tester",
            plate: null,
            rating: 15000,
            records: [],
            username: "testuser",
        };
        const mockFetch = vi.fn().mockResolvedValue(jsonResponse(payload));
        vi.stubGlobal("fetch", mockFetch);

        await fetchPlayerRecordsByImportToken(token);

        const expectedUrl = "https://www.diving-fish.com/api/maimaidxprober/player/records";
        const expectedOptions = {
            method: "GET",
            headers: {
                "Import-Token": token,
            },
        };

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expectedOptions);
    });
});
