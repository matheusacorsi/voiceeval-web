import { qs, toast, confirmDialog } from '../utils.js';
import { t } from '../i18n.js';
import { getAllPendingEvaluations, clearTrialHistory } from '../db.js';
import { resetSession } from '../state.js';

const btnIniciar = qs('#btnIniciarAvaliacao');
const btnPendencias = qs('#btnPendenciasOffline');
const btnLimpar = qs('#btnLimparEnsaiosSalvos');
const pendingCount = qs('#pendingCount');
const homeMessage = qs('#homeMessage');

let navigate = null;

export function initHomeScreen(navigateFn) {
  navigate = navigateFn;

  btnIniciar.addEventListener('click', () => {
    resetSession();
    navigate('identificacao');
  });

  btnPendencias.addEventListener('click', () => navigate('pendencias'));

  btnLimpar.addEventListener('click', async () => {
    const ok = await confirmDialog(t('msg_confirma_limpar_ensaios'));
    if (!ok) return;
    await clearTrialHistory();
    toast(t('msg_ensaios_limpos'));
  });
}

export async function onEnterHome() {
  homeMessage.textContent = '';
  const pending = await getAllPendingEvaluations();
  if (pending.length > 0) {
    pendingCount.textContent = String(pending.length);
    pendingCount.classList.remove('hidden');
  } else {
    pendingCount.classList.add('hidden');
  }
}
