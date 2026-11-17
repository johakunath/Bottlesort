// Updates stay waiting until the player explicitly reloads; active puzzles persist.
export async function registerPwa() {
  let installPrompt;
  const install = document.querySelector('#btn-install');
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event; install.classList.remove('hidden');
  });
  install.addEventListener('click', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt(); await installPrompt.userChoice;
    installPrompt = null; install.classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => install.classList.add('hidden'));
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    const update = document.querySelector('#btn-update');
    /* An update is only "ready" when an older version controls this page. On a
       first visit the new worker also passes through `waiting` for a moment,
       which used to leave "Update ready" on screen for brand-new players. */
    const ready = () => { if (registration.waiting && navigator.serviceWorker.controller) update.classList.remove('hidden'); };
    ready();
    registration.addEventListener('updatefound', () => {
      registration.installing?.addEventListener('statechange', ready);
    });
    let reloading = false;
    update.addEventListener('click', () => {
      if (!registration.waiting) return;
      reloading = true; registration.waiting.postMessage('ACTIVATE');
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) location.reload(); });
  } catch (error) { console.warn('Offline installation unavailable:', error.message); }
}
