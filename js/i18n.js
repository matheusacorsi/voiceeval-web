// Dicionario extraido da colecao original colTraducoes do Power App, mais chaves novas do fluxo web.
export const DICT = {
  app_titulo: { pt: 'VoiceEval', en: 'VoiceEval', es: 'VoiceEval' },
  titulo_inicio: { pt: 'VoiceEval PoC', en: 'VoiceEval PoC', es: 'VoiceEval PoC' },
  titulo_identificacao: { pt: 'Identificação da avaliação', en: 'Evaluation identification', es: 'Identificación de la evaluación' },
  titulo_config_avaliacao: { pt: 'Configuração da avaliação', en: 'Evaluation setup', es: 'Configuración de la evaluación' },
  titulo_captura: { pt: 'Captura da avaliação', en: 'Evaluation capture', es: 'Captura de la evaluación' },
  titulo_pendencias: { pt: 'Transmissões pendentes', en: 'Pending transmissions', es: 'Transmisiones pendientes' },
  lbl_data_avaliacao_prefixo: { pt: 'Data da avaliação:', en: 'Evaluation date:', es: 'Fecha de evaluación:' },
  lbl_qual_avaliacao: { pt: 'Referência da avaliação', en: 'Evaluation timing', es: 'Referencia de la evaluación' },
  hint_nome_ensaio: { pt: 'Nome do ensaio', en: 'Trial name', es: 'Nombre del ensayo' },
  hint_momento_avaliacao: { pt: 'Ex: 3DAA, 7DAA, Pré-aplicação', en: 'Ex: 3DAA, 7DAA, Pre-application', es: 'Ej: 3DAA, 7DAA, Pre-aplicación' },
  hint_numero_tratamentos: { pt: 'Número de tratamentos', en: 'Number of treatments', es: 'Número de tratamientos' },
  hint_numero_repeticoes: { pt: 'Número de repetições', en: 'Number of replications', es: 'Número de repeticiones' },
  hint_tipos_avaliacao: { pt: 'Ex: Controle, Fitotoxicidade, Severidade', en: 'Ex: Control, Phytotoxicity, Severity', es: 'Ej: Control, Fitotoxicidad, Severidad' },
  hint_item_avaliado: { pt: 'Ex: Planta daninha, Cultura, Doença, Inseto', en: 'Ex: Weed, Crop, Disease, Insect', es: 'Ej: Maleza, Cultivo, Enfermedad, Insecto' },
  hint_pests_avaliadas: { pt: 'Ex: Buva, Capim-amargoso, Picão-preto', en: 'Ex: Horseweed, Sourgrass, Black-jack', es: 'Ej: Rama negra, Capín amargo, Amor seco' },
  hint_escala_notas: { pt: 'Ex: 0-100, Davis 0-9, 1-8, contagem', en: 'Ex: 0-100, Davis 0-9, 1-8, count', es: 'Ej: 0-100, Davis 0-9, 1-8, conteo' },
  hint_numero_subamostras: { pt: 'Número de subamostras', en: 'Number of subsamples', es: 'Número de submuestras' },
  lbl_escala_notas: { pt: 'Escala de notas', en: 'Rating scale', es: 'Escala de notas' },
  lbl_subamostras: { pt: 'Haverá subamostras por parcela?', en: 'Will there be subsamples per plot?', es: '¿Habrá submuestras por parcela?' },
  status_gravando: { pt: 'Gravando...', en: 'Recording...', es: 'Grabando...' },
  status_avaliacao_finalizada: { pt: 'Avaliação finalizada. Pronta para transmissão.', en: 'Evaluation completed. Ready to submit.', es: 'Evaluación finalizada. Lista para transmitir.' },
  status_audio_pausado: { pt: 'Pausado. Toque no microfone para continuar gravando.', en: 'Paused. Tap the microphone to continue recording.', es: 'Pausado. Toque el micrófono para continuar grabando.' },
  status_audio_inicio: { pt: 'Toque no microfone para iniciar a gravação.', en: 'Tap the microphone to start recording.', es: 'Toque el micrófono para iniciar la grabación.' },
  btn_concluir_trecho: { pt: 'Concluir trecho de áudio', en: 'Finish audio clip', es: 'Finalizar fragmento de audio' },
  btn_remover_ultima_foto: { pt: 'Remover última foto', en: 'Remove last photo', es: 'Quitar última foto' },
  btn_confirmar: { pt: 'Confirmar', en: 'Confirm', es: 'Confirmar' },
  lbl_trechos_audio: { pt: 'Trechos de áudio:', en: 'Audio clips:', es: 'Fragmentos de audio:' },
  lbl_fotos: { pt: 'Fotos:', en: 'Photos:', es: 'Fotos:' },
  btn_iniciar_avaliacao: { pt: 'Iniciar avaliação de ensaio', en: 'Start trial evaluation', es: 'Iniciar evaluación del ensayo' },
  btn_transmissoes_pendentes: { pt: 'Transmissões pendentes', en: 'Pending transmissions', es: 'Transmisiones pendientes' },
  btn_atualizar_lista: { pt: 'Atualizar lista', en: 'Refresh list', es: 'Actualizar lista' },
  btn_transmitir_todas: { pt: 'Transmitir todas', en: 'Submit all', es: 'Transmitir todas' },
  btn_voltar: { pt: 'Voltar', en: 'Back', es: 'Volver' },
  msg_transmissao_sucesso: { pt: 'Transmissão bem sucedida.', en: 'Transmission successful.', es: 'Transmisión exitosa.' },
  msg_avaliacao_salva_offline: { pt: 'Avaliação salva offline. Transmita quando possível.', en: 'Evaluation saved offline. Submit when possible.', es: 'Evaluación guardada sin conexión. Transmita cuando sea posible.' },
  msg_todas_pendencias_sucesso: { pt: 'Todas as pendências foram transmitidas com sucesso.', en: 'All pending transmissions were submitted successfully.', es: 'Todas las transmisiones pendientes se enviaron correctamente.' },
  btn_proximo: { pt: 'Próximo', en: 'Next', es: 'Siguiente' },
  btn_finalizar_avaliacao: { pt: 'Finalizar avaliação', en: 'Finish evaluation', es: 'Finalizar evaluación' },
  btn_transmitir_avaliacao: { pt: 'Transmitir avaliação', en: 'Submit evaluation', es: 'Transmitir evaluación' },
  btn_tirar_foto: { pt: 'Tirar foto', en: 'Take photo', es: 'Tomar foto' },
  btn_ensaios_salvos: { pt: 'Ensaios salvos', en: 'Saved trials', es: 'Ensayos guardados' },
  btn_limpar_ensaios: { pt: 'Limpar ensaios salvos', en: 'Clear saved trials', es: 'Limpiar ensayos guardados' },
  btn_selecionar: { pt: 'Selecionar', en: 'Select', es: 'Seleccionar' },
  btn_transmitir_pendencia: { pt: 'Transmitir pendência selecionada', en: 'Submit selected evaluation', es: 'Transmitir evaluación seleccionada' },
  btn_salvar_offline: { pt: 'Salvar avaliação offline', en: 'Save evaluation offline', es: 'Guardar evaluación sin conexión' },
  btn_instalar_app: { pt: 'Instalar aplicativo', en: 'Install app', es: 'Instalar aplicación' },
  btn_cancelar: { pt: 'Cancelar', en: 'Cancel', es: 'Cancelar' },
  btn_configurar_pasta: { pt: 'Escolher pasta local do OneDrive (computador)', en: 'Choose local OneDrive folder (desktop)', es: 'Elegir carpeta local de OneDrive (equipo)' },
  msg_ensaios_limpos: { pt: 'Ensaios salvos removidos.', en: 'Saved trials cleared.', es: 'Ensayos guardados eliminados.' },
  msg_confirma_limpar_ensaios: { pt: 'Deseja remover todos os ensaios salvos deste dispositivo?', en: 'Remove all trials saved on this device?', es: '¿Eliminar todos los ensayos guardados en este dispositivo?' },
  msg_preencha_campos: { pt: 'Preencha os campos obrigatórios.', en: 'Fill in the required fields.', es: 'Complete los campos obligatorios.' },
  msg_sem_registro_finalizar: { pt: 'Grave ao menos um áudio ou tire uma foto antes de finalizar.', en: 'Record at least one audio clip or take a photo before finishing.', es: 'Grabe al menos un audio o tome una foto antes de finalizar.' },
  msg_erro_microfone: { pt: 'Não foi possível acessar o microfone. Verifique as permissões do navegador.', en: 'Could not access the microphone. Check browser permissions.', es: 'No fue posible acceder al micrófono. Verifique los permisos del navegador.' },
  msg_erro_camera: { pt: 'Não foi possível acessar a câmera.', en: 'Could not access the camera.', es: 'No fue posible acceder a la cámara.' },
  msg_nenhuma_pendencia: { pt: 'Nenhuma avaliação pendente encontrada neste dispositivo.', en: 'No pending evaluation found on this device.', es: 'No se encontró ninguna evaluación pendiente en este dispositivo.' },
  msg_selecione_pendencia: { pt: 'Selecione uma pendência na lista.', en: 'Select a pending item from the list.', es: 'Seleccione una pendencia de la lista.' },
  msg_exportado_local: { pt: 'Arquivos baixados neste dispositivo. Mova-os manualmente para o OneDrive/SharePoint.', en: 'Files downloaded to this device. Move them manually to OneDrive/SharePoint.', es: 'Archivos descargados en este dispositivo. Muévalos manualmente a OneDrive/SharePoint.' },
  msg_pasta_configurada: { pt: 'Pasta de sincronização configurada.', en: 'Sync folder configured.', es: 'Carpeta de sincronización configurada.' },
  lbl_status_online: { pt: 'online', en: 'online', es: 'en línea' },
  lbl_status_offline: { pt: 'offline', en: 'offline', es: 'sin conexión' },
  lbl_idioma_fala: { pt: 'Idioma da fala', en: 'Speech language', es: 'Idioma del habla' },
  lbl_modo_transcricao: { pt: 'Transcrição', en: 'Transcription', es: 'Transcripción' },
  modo_transcricao_nuvem: { pt: 'Nuvem (rápida, precisa internet)', en: 'Cloud (fast, needs internet)', es: 'Nube (rápida, requiere internet)' },
  modo_transcricao_local: { pt: 'No dispositivo (offline, mais lenta)', en: 'On-device (offline, slower)', es: 'En el dispositivo (sin conexión, más lenta)' },
  modo_transcricao_desativada: { pt: 'Desativada', en: 'Off', es: 'Desactivada' },
  status_transcrevendo: { pt: 'Transcrevendo…', en: 'Transcribing…', es: 'Transcribiendo…' },
  status_transcricao_ok: { pt: 'Transcrição concluída.', en: 'Transcription done.', es: 'Transcripción completada.' },
  status_transcricao_indisponivel: { pt: 'Transcrição indisponível (áudio salvo).', en: 'Transcription unavailable (audio saved).', es: 'Transcripción no disponible (audio guardado).' },
  status_baixando_modelo: { pt: 'Baixando modelo local ({{pct}}%)…', en: 'Downloading local model ({{pct}}%)…', es: 'Descargando modelo local ({{pct}}%)…' },
  lbl_idioma_pt: { pt: 'Português', en: 'Portuguese', es: 'Portugués' },
  lbl_idioma_en: { pt: 'Inglês', en: 'English', es: 'Inglés' },
  lbl_idioma_es: { pt: 'Espanhol', en: 'Spanish', es: 'Español' },
  btn_revisar_excel: { pt: 'Revisar dados e exportar', en: 'Review data and export', es: 'Revisar datos y exportar' },
  titulo_revisao: { pt: 'Revisão dos dados', en: 'Data review', es: 'Revisión de los datos' },
  msg_revisao_vazia: { pt: 'Nenhuma parcela foi reconhecida na transcrição. Adicione linhas e colunas manualmente.', en: 'No plot was recognized in the transcription. Add rows and columns manually.', es: 'No se reconoció ninguna parcela en la transcripción. Agregue filas y columnas manualmente.' },
  btn_add_linha: { pt: '+ Parcela', en: '+ Plot', es: '+ Parcela' },
  btn_add_coluna: { pt: '+ Coluna', en: '+ Column', es: '+ Columna' },
  btn_exportar_excel: { pt: 'Exportar e transmitir tudo', en: 'Export and submit everything', es: 'Exportar y transmitir todo' },
  lbl_ver_transcricao: { pt: 'Ver transcrição reconhecida', en: 'View recognized transcription', es: 'Ver transcripción reconocida' },
  lbl_ver_fotos: { pt: 'Fotos por parcela', en: 'Photos by plot', es: 'Fotos por parcela' },
  lbl_foto_sem_parcela: { pt: 'sem parcela', en: 'no plot', es: 'sin parcela' },
  lbl_coluna_parcela: { pt: 'Parcela', en: 'Plot', es: 'Parcela' },
  msg_nome_coluna: { pt: 'Nome da coluna (ex.: BUVA, item avaliado):', en: 'Column name (e.g. BUVA, evaluated item):', es: 'Nombre de la columna (ej.: BUVA, ítem evaluado):' },
  msg_excel_exportado: { pt: 'Planilha Excel gerada.', en: 'Excel spreadsheet generated.', es: 'Hoja de Excel generada.' },
  msg_revisao_sem_dados: { pt: 'Adicione ao menos uma parcela antes de exportar.', en: 'Add at least one plot before exporting.', es: 'Agregue al menos una parcela antes de exportar.' },
  aria_remover_linha: { pt: 'Remover parcela', en: 'Remove plot', es: 'Quitar parcela' },
  aria_remover_coluna: { pt: 'Remover coluna', en: 'Remove column', es: 'Quitar columna' }
};

const SUPPORTED = ['pt', 'en', 'es'];
const STORAGE_KEY = 'voiceeval_lang';
let currentLang = 'en';

export function detectLanguage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED.includes(stored)) return stored;

  const candidates = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  for (const raw of candidates) {
    const base = String(raw || '').slice(0, 2).toLowerCase();
    if (SUPPORTED.includes(base)) return base;
  }
  return 'en';
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = SUPPORTED.includes(lang) ? lang : 'en';
  localStorage.setItem(STORAGE_KEY, currentLang);
  applyTranslations();
  document.documentElement.lang = currentLang;
}

export function t(key, vars) {
  const entry = DICT[key];
  let text = entry ? (entry[currentLang] || entry.en || key) : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{{${k}}}`, v);
  }
  return text;
}

export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
}

export function initI18n() {
  currentLang = detectLanguage();
  document.documentElement.lang = currentLang;
  applyTranslations();
  return currentLang;
}
