// shared/core is the platform-neutral domain core used by the web app (src/) and the CLI (cli/).
// It must not depend on Vue, MDUI, localForage, import.meta.env, the DOM or anything under src/.
// Modules are imported by path rather than through this file, so consumers only bundle what they use.
export {};
