/**
 * Service worker registration.
 *
 * The worker is registered only in a production build and only in a secure
 * context. Both guards matter: a worker registered over plain HTTP on a LAN
 * address is rejected by the browser anyway, and a worker registered against
 * the dev server would cache the modules Vite is hot-reloading.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((error: unknown) => {
        console.warn('[pwa] service worker registration failed', error);
      });
  });
}
