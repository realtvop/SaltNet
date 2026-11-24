import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const mode = process.env.E2E_FETCH_MODE;
const refusedLog = process.env.E2E_REFUSED_LOG;
const saltMetaUrl = process.env.E2E_SALTMETA_URL;
const lxnsBaseUrl = process.env.E2E_LXNS_BASE_URL;

if ((mode !== "serve" && mode !== "deny") || !refusedLog || !saltMetaUrl || !lxnsBaseUrl) {
    throw new Error("the E2E fetch preload is not configured");
}

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../shared/core");
const readJson = name => JSON.parse(readFileSync(path.join(coreDir, "fixtures", name), "utf8"));
const saltMeta = readJson("saltmeta.compacted.json");
const collections = readJson("lxns-collections.json");
const routes = new Map([
    [saltMetaUrl, saltMeta],
    [`${lxnsBaseUrl}/api/v0/maimai/trophy/list?required=true`, { trophies: collections.trophies }],
    [`${lxnsBaseUrl}/api/v0/maimai/icon/list?required=true`, { icons: collections.icons }],
    [`${lxnsBaseUrl}/api/v0/maimai/plate/list?required=true`, { plates: collections.plates }],
    [`${lxnsBaseUrl}/api/v0/maimai/frame/list?required=true`, { frames: collections.frames }],
]);

globalThis.fetch = async input => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const body = mode === "serve" ? routes.get(url) : undefined;
    if (body !== undefined) {
        return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    }

    appendFileSync(refusedLog, `${url}\n`);
    throw new TypeError("fetch failed");
};
