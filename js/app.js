import { loadCatalog } from './catalog.js';
import { initStore } from './store.js';
import { initUI } from './ui.js';
import { registerServiceWorker } from './pwa.js';

// ── Dark mode ────────────────────────────────────────────────
const DARK_KEY = 'spark_dark_mode';

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

function initDarkMode() {
  const saved = localStorage.getItem(DARK_KEY);
  if (saved !== null) {
    applyTheme(saved === 'true');
  } else {
    applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
}

export function toggleDarkMode() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  const next = !isDark;
  applyTheme(next);
  localStorage.setItem(DARK_KEY, String(next));
  return next;
}

export function isDarkMode() {
  return document.documentElement.dataset.theme === 'dark';
}

// ── Boot ─────────────────────────────────────────────────────
initDarkMode();

async function boot() {
  registerServiceWorker();
  await loadCatalog();
  initStore();
  initUI(document.getElementById('app'));
  const splash = document.getElementById('splash');
  if (splash) {
    setTimeout(() => splash.classList.add('hidden'), 120);
  }
}

boot().catch(err => {
  const splash = document.getElementById('splash');
  if (splash) splash.classList.add('hidden');
  document.getElementById('app').innerHTML =
    `<div class="boot-error"><h2>Failed to load</h2><p>${err.message}</p><p>Try refreshing or reinstalling the app.</p></div>`;
});
