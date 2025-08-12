"use strict";

var cacheStorageKey = "SaltNetv0-";

const CORE = [
    "/",
    "/index.html",
    "/favicon.ico",
    "/favicon.png",
    "/manifest.json",
    "/icons/random.png",
    "/icons/a.png",
    "/icons/aa.png",
    "/icons/aaa.png",
    "/icons/b.png",
    "/icons/bb.png",
    "/icons/bbb.png",
    "/icons/c.png",
    "/icons/d.png",
    "/icons/music_icon_ap.png",
    "/icons/music_icon_app.png",
    "/icons/music_icon_fc.png",
    "/icons/music_icon_fcp.png",
    "/icons/music_icon_fdx.png",
    "/icons/music_icon_fdxp.png",
    "/icons/music_icon_fs.png",
    "/icons/music_icon_fsp.png",
    "/icons/music_icon_sync.png",
    "/icons/s.png",
    "/icons/splus.png",
    "/icons/ss.png",
    "/icons/ssplus.png",
    "/icons/sss.png",
    "/icons/sssplus.png",
    "/icons/star1.png",
    "/icons/star2.png",
    "/icons/star3.png",
    "/MaterialIcons/regular.css",
    "/MaterialIcons/regular.woff2",
];

function parseURL(url) {
    let tmp = url.substr(url.indexOf("//") + 2);
    let host = tmp.substr(0, tmp.indexOf("/"));
    let tmp2 = tmp.substr(tmp.indexOf("/"));
    let qm = tmp2.indexOf("?");
    let path, queryParam;
    if (qm < 0) {
        path = tmp2;
        queryParam = undefined;
    } else {
        path = tmp2.substr(0, qm);
        queryParam = tmp2.substr(qm);
    }

    return {
        path,
        host,
        queryParam,
    };
}

function cacheFirst(request, key) {
    return caches.open(key).then((cache) => {
        return cache.match(request, { ignoreSearch: true, ignoreVary: true }).then((response) => {
            return (
                response ||
                fetch(request).then((response) => {
                    if (response.ok || response.type === "opaque") cache.put(request, response.clone());
                    return response;
                })
            );
        });
    });
}
function cacheFirstForCovers(request, key) {
    return caches.open(key).then((cache) => {
        return cache.match(request, { ignoreSearch: true, ignoreVary: true }).then((response) => {
            if (response) {
                if (response.ok && response.type === "cors") return response;
                else caches.delete(key);
            }
            return fetch(request).then((response) => {
                if (response.ok && response.type === "cors") cache.put(request, response.clone());
                return response;
            });
        });
    });
}

function cacheOrOnline(request, key) {
    return caches.open(key).then((cache) => {
        return cache.match(request, { ignoreSearch: true, ignoreVary: true }).then((response) => {
            return response || fetch(request);
        });
    });
}

function onlineFirst(request, key) {
    return caches.open(key).then((cache) => {
        const offlineFetch = () => {
            return cache.match(request, { ignoreSearch: true, ignoreVary: true }).then((response) => {
                return response;
            });
        };
        if (!navigator.onLine) return offlineFetch();
        return fetch(request)
            .then((response) => {
                if (response.ok) cache.put(request, response.clone());
                return response;
            })
            .catch(offlineFetch);
    });
}

self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(cacheStorageKey + "Main").then(function (cache) {
            return cache.addAll(CORE);
        })
    );
    self.skipWaiting();
});

self.addEventListener("fetch", async function (e) {
    const urlOri = e.request.url;
    const urlParsed = parseURL(urlOri);
    const currentUrlParsed = parseURL(self.location.href);
    if (urlOri.startsWith("http")) {
        if (urlParsed.path.endsWith("sw.v2.js") ||
            (urlParsed.path.endsWith(".json") && !urlParsed.path.endsWith("manifest.json")) ||
            urlOri.includes("diving-fish.com/api") || ["salt_api_backup.realtvop.top", "api.salt.realtvop.top", "www.googletagmanager.com", "vercel.live"].includes(urlParsed.host) || urlParsed.host.includes("localhost")
        ) {
            return;
        } else if (urlOri.includes("jacket.maimai.realtvop.top") || urlOri.includes("collectionimg.maimai.realtvop.top") || urlOri.includes("diving-fish.com/covers")) {
            e.respondWith(cacheFirstForCovers(e.request, cacheStorageKey + "Covers"));
            return;
        } else if (urlParsed.host == currentUrlParsed.host) {
            e.respondWith(cacheFirst(e.request, cacheStorageKey + "Main"));
            return;
        } else {
            e.respondWith(cacheFirst(e.request, cacheStorageKey + "ExternalRes"));
            return;
        };
    }
    return;
});
self.addEventListener("activate", function (e) {
    e.waitUntil(
        caches
            .keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheNames) => {
                            return !cacheNames.startsWith(cacheStorageKey);
                        })
                        .map((cacheNames) => {
                            return caches.delete(cacheNames);
                        })
                );
            })
            .then(() => {
                return self.clients.claim();
            })
    );
});

const broadcast = new BroadcastChannel('updateFinish');
self.addEventListener('message', event => {
    const evtAct = event.data.action;
    if (!evtAct) return;
    if (evtAct === "update") {
        const assets = JSON.parse(JSON.stringify(CORE));
        for (const asset of event.data.assets) assets.push(`/assets/${asset}`);

        caches.delete(cacheStorageKey + "Main");
        caches.open(cacheStorageKey + "Main").then(function (cache) {
            return cache.addAll(assets);
        }).then(() => {
            broadcast.postMessage({ type: 'UPDATED', });
        });
    }
});