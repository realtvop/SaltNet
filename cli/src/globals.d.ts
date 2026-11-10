// Values `build.mjs` compiles into the bundle. They are undefined when the sources run unbundled
// (Vitest), so every reader must handle that.
declare const __SALTNET_VERSION__: string | undefined;
declare const __SALTNET_BUILD_DEFAULTS__:
    | {
          apiUrl: string;
          apiFallbackUrl: string;
          renderUrl: string;
          lxnsClientId: string;
          lxnsRedirectUri: string;
      }
    | undefined;
