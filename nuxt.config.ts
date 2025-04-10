// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  ssr: true,

  app: {
    keepalive: true,
    pageTransition: false,
    layoutTransition: false
  },

  experimental: {
    payloadExtraction: true,
  },

  nitro: {
    routeRules: {
      '/**': { 
        ssr: true,
        swr: 0 // Disable caching for dynamic routes 
      }
    }
  },

  compatibilityDate: '2025-04-10'
})