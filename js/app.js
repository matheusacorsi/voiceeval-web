import { qs } from './utils.js';
import { initI18n, setLang, getLang, t } from './i18n.js';
import { initHomeScreen, onEnterHome } from './screens/home.js';
import { initIdentificationScreen, onEnterIdentification } from './screens/identification.js';
import { initConfigScreen, onEnterConfig } from './screens/config.js';
import { initCaptureScreen, onEnterCapture, onLeaveCapture } from './screens/capture.js';
import { initPendingScreen, onEnterPending } from './screens/pending.js';
import { initReviewScreen, onEnterReview } from './screens/review.js';

const SCREENS = {
  inicio: { onEnter: onEnterHome },
  identificacao: { onEnter: onEnterIdentification },
  config: { onEnter: onEnterConfig },
  captura: { onEnter: onEnterCapture, onLeave: onLeaveCapture },
  revisao: { onEnter: onEnterReview },
  pendencias: { onEnter: onEnterPending }
};

let currentScreen = null;

function navigate(name) {
  if (!SCREENS[name]) name = 'inicio';
  if (currentScreen && SCREENS[currentScreen] && SCREENS[currentScreen].onLeave) {
    SCREENS[currentScreen].onLeave();
  }
  Object.keys(SCREENS).forEach((key) => {
    qs(`#screen-${key}`).classList.toggle('hidden', key !== name);
  });
  currentScreen = name;
  window.location.hash = name;
  const enter = SCREENS[name].onEnter;
  if (enter) Promise.resolve(enter()).catch(() => {});
}

function initLangSelect(onChange) {
  const select = qs('#langSelect');
  select.value = getLang();
  select.addEventListener('change', () => {
    setLang(select.value);
    if (onChange) onChange();
  });
}

function initConnectionStatus() {
  const el = qs('#connStatus');
  function update() {
    const online = navigator.onLine;
    el.classList.toggle('offline', !online);
    el.textContent = online ? t('lbl_status_online') : t('lbl_status_offline');
  }
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
  return update;
}

function initInstallPrompt() {
  const btn = qs('#btnInstallApp');
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.classList.remove('hidden');
  });
  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    btn.classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => btn.classList.add('hidden'));
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    });
  }
}

// Normaliza campos .input-uppercase para MAIUSCULAS ja no valor (nao so visual), preservando o cursor.
function initUppercaseInputs() {
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.classList || !el.classList.contains('input-uppercase')) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const up = el.value.toUpperCase();
    if (up !== el.value) {
      el.value = up;
      try { el.setSelectionRange(start, end); } catch { /* alguns tipos nao suportam selectionRange */ }
    }
  });
}

function bootstrap() {
  initI18n();

  initHomeScreen(navigate);
  initIdentificationScreen(navigate);
  initConfigScreen(navigate);
  initCaptureScreen(navigate);
  initReviewScreen(navigate);
  initPendingScreen(navigate);

  const updateConnStatus = initConnectionStatus();
  initLangSelect(() => updateConnStatus());
  initInstallPrompt();
  initUppercaseInputs();
  registerServiceWorker();

  const initial = (window.location.hash || '').replace('#', '') || 'inicio';
  navigate(SCREENS[initial] ? initial : 'inicio');

  window.addEventListener('hashchange', () => {
    const name = (window.location.hash || '').replace('#', '') || 'inicio';
    if (name !== currentScreen) navigate(name);
  });
}

bootstrap();
