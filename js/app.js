import { loadCatalog } from './catalog.js';
import { initStore } from './store.js';
import { initUI } from './ui.js';
import { registerServiceWorker } from './pwa.js';

async function boot() {
  registerServiceWorker();
  await loadCatalog();
  initStore();
  initUI(document.getElementById('app'));
}

boot().catch(err => {
  document.getElementById('app').innerHTML =
    `<div class="boot-error"><h2>Failed to load</h2><p>${err.message}</p><p>Try refreshing or reinstalling the app.</p></div>`;
});
