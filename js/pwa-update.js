import { APP_VERSION } from './config.js';

/** Osveži PWA, ko je na voljo nova verzija (pomembno za nameščeno aplikacijo). */
export function initPwaUpdates() {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const activateWorker = (worker) => {
    if (!worker) return;
    worker.postMessage({ type: 'SKIP_WAITING' });
    showUpdateBanner();
  };

  navigator.serviceWorker
    .register(`./sw.js?v=${APP_VERSION}`, { updateViaCache: 'none' })
    .then((reg) => {
      if (reg.waiting) activateWorker(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state !== 'installed') return;
          if (navigator.serviceWorker.controller) {
            activateWorker(reg.waiting || worker);
          }
        });
      });

      const check = () => reg.update().catch(() => {});
      check();
      setTimeout(check, 3000);

      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) check();
      });

      window.addEventListener('focus', check);
      setInterval(check, 30 * 60 * 1000);
    })
    .catch(console.warn);
}

function showUpdateBanner() {
  if (document.getElementById('update-banner')) return;

  const bar = document.createElement('div');
  bar.id = 'update-banner';
  bar.className = 'update-banner';
  bar.innerHTML = `
    <span>Nova različica je pripravljena</span>
    <button type="button" id="btn-update-app">Osveži</button>`;
  document.body.appendChild(bar);

  document.getElementById('btn-update-app')?.addEventListener('click', () => {
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    });
  });
}
