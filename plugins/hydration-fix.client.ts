export default defineNuxtPlugin((nuxtApp) => {
  // Disable Vue's hydration mismatch warnings in development
  if (process.dev) {
    const originalErrorHandler = nuxtApp.vueApp.config.errorHandler;
    nuxtApp.vueApp.config.errorHandler = (err, vm, info) => {
      if (typeof err === 'string' && err.includes('Hydration')) {
        console.warn('Hydration mismatch:', err);
        return;
      }
      if (originalErrorHandler) originalErrorHandler(err, vm, info);
      else console.error(err);
    };
  }
});
