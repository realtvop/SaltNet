// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  ssr: false, // Changed from true to false to disable server-side rendering

  app: {
    keepalive: true,
    pageTransition: false,
    layoutTransition: false
  },

  experimental: {
    payloadExtraction: false, // Disabled as it's not needed for client-side only rendering
  },

  nitro: {
    routeRules: {
      '/**': { 
        ssr: false, // Updated to false to disable SSR for all routes
        swr: 0 // Disable caching for dynamic routes 
      }
    }
  },

  compatibilityDate: '2025-04-10'
})