/** The CLI version: the bundle gets it from package.json at build time. */
export const VERSION: string =
    typeof __SALTNET_VERSION__ === "string" ? __SALTNET_VERSION__ : "0.0.0-dev";
