import { qs, toast } from '../utils.js';
import { t } from '../i18n.js';
import { session, loadConfig } from '../state.js';

const form = qs('#formConfig');
const inputTipos = qs('#inputTiposAvaliacao');
const inputItem = qs('#inputItemAvaliado');
const inputPests = qs('#inputPestsAvaliadas');
const inputEscala = qs('#inputEscalaNotas');
const toggleSubamostras = qs('#toggleUsarSubamostras');
const wrapperSubamostras = qs('#wrapperNumeroSubamostras');
const inputNumeroSubamostras = qs('#inputNumeroSubamostras');
const btnVoltar = qs('#btnVoltarConfig');

let navigate = null;

function syncSubamostrasVisibility() {
  wrapperSubamostras.classList.toggle('hidden', !toggleSubamostras.checked);
}

export function initConfigScreen(navigateFn) {
  navigate = navigateFn;

  toggleSubamostras.addEventListener('change', syncSubamostrasVisibility);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (toggleSubamostras.checked && !inputNumeroSubamostras.value) {
      toast(t('msg_preencha_campos'));
      return;
    }
    loadConfig({
      tiposAvaliacaoTexto: inputTipos.value.trim(),
      itemAvaliado: inputItem.value.trim(),
      pestsAvaliadasTexto: inputPests.value.trim(),
      escalaNotasTexto: inputEscala.value.trim(),
      usarSubamostras: toggleSubamostras.checked,
      numeroSubamostras: toggleSubamostras.checked ? Number(inputNumeroSubamostras.value) : ''
    });
    navigate('captura');
  });

  btnVoltar.addEventListener('click', () => navigate('identificacao'));
}

export function onEnterConfig() {
  inputTipos.value = session.tiposAvaliacaoTexto || '';
  inputItem.value = session.itemAvaliado || '';
  inputPests.value = session.pestsAvaliadasTexto || '';
  inputEscala.value = session.escalaNotasTexto || '';
  toggleSubamostras.checked = !!session.usarSubamostras;
  inputNumeroSubamostras.value = session.numeroSubamostras || '';
  syncSubamostrasVisibility();
}
