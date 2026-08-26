# Memórias do projeto — VoiceEval Web

Registro vivo de tudo que foi implementado, **como** e **por quê**. Cada mudança nova entra aqui.
Mais recente no topo de cada seção.

---

## Tabela guiada pela estrutura esperada (sem lixo) — feito e validado

Feedback do usuário: a tabela de revisão não pode ter lixo (coluna "FÓ" do ruído do ASR, parcelas
fantasma 114/115, parcelas que só vieram do áudio das fotos). O contexto da avaliação (config + mapa
do ensaio) — o mesmo que o `resumo.md` documenta — passa a ser o **gabarito**.

- `js/postprocess/pipeline.js`: `guideFromSession(session)` = { expectedParcelas, expectedPests }.
  Parcelas esperadas vêm do **mapa do ensaio** (chaves de `parcelaToTreatment`) ou, na ausência, são
  derivadas de **tratamentos × repetições** (`r*100 + tratamento`). Pragas esperadas do
  `pestsAvaliadasTexto`. `applyGuide(tabela, columns, guide)` remove colunas-lixo (sem valor e não
  esperadas) e parcelas fora do esperado, e — havendo universo esperado — gera **1 linha por parcela
  esperada** (vazia onde faltou), servindo de guia para preencher/corrigir.
- Aplicado na **Revisão** (`review.js`) e no **Excel automático** (`summary.js buildEvaluationXlsx`),
  para transmissão com ou sem revisão. Sem config/guia, é passthrough (não arrisca dropar nada).
- **Validação (dados reais):** transcrição do áudio real (whisper-small) → tabela só `AMARGOSO`
  (coluna "FÓ" removida), **39 parcelas esperadas** (101-113/201-213/301-313), 16 valores reais
  preenchidos (105-110, 303-313), 114/115 fantasma removidas. `service-worker.js` → `v15`.

---

## Teste real (áudio + fotos de campo) — 2 correções no parser

Rodando o app com dados reais de uma avaliação (2 áudios + 13 fotos, ensaio `BR26X01007H-GRP02`,
praga única `amargoso`, escala 0-100) surgiram e foram corrigidos dois problemas no `parser.js`:
- **Item padrão para praga única**: quando o avaliador diz só `"Parcela 105 78"` (sem falar a praga,
  porque é praga única), o valor agora vai para o item configurado (ex.: `AMARGOSO`) em vez de ser
  descartado. Usa `defaultItem` (derivado de `pestsAvaliadasTexto`) também no modo sem subamostra.
- **Parcela tolerante ao ASR**: `isParcelaMarker` reconhece qualquer token que comece com `parc`
  (parcela/parcelsa/parcellas/parceras/parcels/parcelso…), além de lote/plot/clot. Antes, variações
  do reconhecimento viravam colunas-lixo.
- Regressão conferida (caso1/2, ausência, subamostra, Davis, correção). `service-worker.js` → `v14`.
- **Nota do teste**: os `.ogg` do app na verdade são **AAC** (assinatura `ff f9`); o Chromium
  headless não decodifica AAC, então converti p/ WAV (PyAV) e transcrevi com `whisper-small` (o
  `tiny` do app aluciona em áudio longo). No device real, o modo Nuvem (Web Speech) transcreve limpo.
  Resultado: tabela `parcela→AMARGOSO` + boxplot por tratamento (UNTREATED=0, demais 62–94%) + Excel.

---

## Mapa do ensaio (Excel do ARM) + Boxplots por praga — feito e validado

Recurso **opcional**: na Identificação, o usuário pode carregar o mapa do ensaio exportado do ARM em
`.xlsx`. Se carregar, o app extrai tudo; se não, segue como antes.

- `js/postprocess/xlsx_read.js`: lê `.xlsx` **no próprio navegador**, sem dependências — desempacota o
  ZIP (diretório central) e infla cada parte com `DecompressionStream('deflate-raw')`, depois lê
  sharedStrings + worksheets → matrizes por aba. (best-effort; navegador sem DecompressionStream cai
  no catch e segue sem o mapa.)
- `js/postprocess/trialmap.js`: acha a tabela de tratamentos (linha `Trt`/`Description`) e a grade de
  casualização (células `parcela`⏎`tratamento`, ex.: `301`⏎`13`) por conteúdo (não depende do nome da
  aba). **Regra V/V = adjuvante**: partes com `% V/V` saem do rótulo do tratamento (viram `adjuvant`).
  Extrai `trialId`, nº de tratamentos e nº de repetições (blocos 1xx/2xx/3xx).
- Identificação (`identification.js` + `#inputTrialFile`): ao carregar, guarda `session.trialMap` e
  **pré-preenche** nome do ensaio (Trial ID), nº de tratamentos e repetições. Falha → toast e segue.
- `js/postprocess/boxplot.js`: estatística (min/Q1/mediana/Q3/máx/média) + desenho em `<canvas>` puro.
- Revisão: se há mapa, aparece um botão **"Boxplot: <praga>"** por praga; abre um modal com o gráfico
  **agrupado por tratamento** (rótulo = `Nº - descrição`), rolável no eixo X. Valor da parcela =
  média das subamostras. Recalcula na hora → reflete edições feitas na tabela antes de exportar.
- `service-worker.js` → `voiceeval-v13` + os 3 módulos novos no APP_SHELL.
- **Validação (browser real, injetando o `Book1.xlsx` do ARM):** 13 tratamentos, 3 repetições,
  `BR26X01007H-GRP02`; V/V separado (GF-4866/SELECT com adjuvante, ZAPP QI sem); mapa 39 parcelas
  (301→13, 205→2, 113→13); boxplot do ELEIN abre com 13 grupos desenhados.

---

## Excel dentro do pacote de entrega (não é mais produto separado) — feito

Antes: "Exportar Excel" gerava só o `.xlsx` solto e "Transmitir" mandava o ZIP sem o Excel.
Agora o **Excel faz parte do pacote único de entrega**, dentro da pasta `<ensaio>_<data>_<momento>/`
junto de `MD/resumo.md`, `Transcricao/transcricao.txt`, `Audios/`, `Fotos/`.

- `js/summary.js`: `buildZipEntries(..., extraFiles)` recebe arquivos extra (o Excel vai na raiz da
  pasta). Novos `buildEvaluationXlsx(evaluation, audios, {tabelaFinal?, columns?, language})` (usa a
  tabela revisada se vier, senão roda o pipeline = Excel automático) e `buildDeliveryFiles(...)` que
  monta o **ZIP completo com o Excel dentro**.
- Três caminhos de transmissão agora incluem o Excel:
  1. **Revisão → "Exportar e transmitir tudo"**: usa a tabela editada, empacota tudo, transmite,
     limpa a pendência e volta ao início (conclui a entrega).
  2. **Captura → "Transmitir avaliação"** (sem revisar): Excel gerado automático das transcrições.
  3. **Pendências → transmitir** (avaliação salva offline): idem, Excel automático; agora reconstrói
     `id`/`audioAnteriorId` da mídia salva para o renomeio de fotos por parcela funcionar também aqui.
- `js/postprocess/pipeline.js`: `subsampleOptionsFromSession(session)` compartilhado (revisão + Excel
  automático). Rótulos: botão da captura "Revisar dados e exportar"; botão da revisão "Exportar e
  transmitir tudo". `service-worker.js` → `voiceeval-v12`.
- Validação em navegador ficou pendente nesta sessão (ferramenta de browser travou); mudança é
  composição de peças já validadas (exportEvaluationXlsx via openpyxl, buildZipEntries/createZipBlob
  já usados na transmissão atual).

---

## Correção por voz — feito e validado

O parser reconhece comandos de correção ditos durante a narração e **sobrescreve valores já ditos**,
sem nenhuma configuração extra (funciona automático dentro de `parseTranscript`):
- Gramática: `<verbo> [parcela P] <ITEM|tudo> [para/a/to/fica/is…] <valor>`.
- Verbos PT/ES/EN: `corrigir/corrige/substituir/trocar/mudar/alterar/ajustar`, `corregir/sustituir/
  cambiar/modificar`, `correct/fix/change/replace/update`. Aceita frases de resultado (`fica`,
  `deve ser`, `is`, `becomes`, `should be`).
- Alvo: um item específico (só sobrescreve coluna já existente — nunca cria coluna nova) ou `tudo/
  todo/all` (todas as colunas da parcela, inclusive subamostras `_S0N`).
- Parcela: a atual por padrão, ou uma explícita (`corrigir parcela 101 …`).
- A cláusula para no 1º par (alvo, valor) e não vaza para os dados seguintes.
- **Validação:** 12 casos no parser (PT/ES/EN, tudo, parcela explícita, sem-vazar, item inexistente,
  subamostra, 2 correções, regressão) + teste ponta a ponta no app (`corrigir parcela 101 ELEIN para
  30` → só 101; `corrigir tudo para zero` → parcela atual). `service-worker.js` → `voiceeval-v10`.

---

## Subamostras + Renomeio de fotos por parcela — feito e validado

**Subamostras (Davis + genérica):** quando a avaliação está configurada com "Haverá subamostras por
parcela?" ligado e um número N, o parser passa a interpretar valores após um item como subamostras:
- **Genérica** (item + N valores): `Parcela 101 cigarrinha 3 5 2 4 1` → colunas `CIGARRINHA_S01..S05`.
- **Davis / por planta** (`planta K nota V` ou números soltos posicionais): `Parcela 101 planta 1
  nota 3 planta 2 nota 1` → `<ITEM>_S01=3, _S02=1...`, onde `<ITEM>` vem da config (1ª pest/item) ou
  `NOTA`. Também aceita sequência crua `Parcela 101 3 1 1 2 ...` (posicional) e cap em N.
- Item vira coluna em MAIÚSCULA (consistência), resolvendo o termo falado quando está no dicionário.
- No Excel: FORMATO_FINAL mostra `<ITEM>1..<ITEM>N` e a aba LISTA_COPIAR_COLAR vira a lista vertical
  (Parcela / item) pronta para copiar. Validado abrindo o `.xlsx` com openpyxl.
- Config passada via `js/screens/review.js` (`subsampleOptions()` lê `usarSubamostras`,
  `numeroSubamostras`, `pestsAvaliadasTexto`/`itemAvaliado`) → `runPipeline(text, options)` → parser.

**Renomeio de fotos por parcela:** `js/postprocess/photos.js` usa o vínculo foto→áudio anterior
(que a PWA já grava) + `extractParcelaFromText` (última parcela dita no trecho, ex.: "...foto parcela
101") para nomear cada foto como `parcela_<P>_<NN>.<ext>` (NN = sequência por parcela); sem parcela
reconhecida cai em `foto_<NN>.<ext>`. Aplicado no ZIP de transmissão + resumo.md + transcricao.txt
(`js/summary.js`) e mostrado como preview (somente leitura) na tela de Revisão ("Fotos por parcela").
`service-worker.js` → `voiceeval-v9` + `photos.js` no APP_SHELL.

**Validação (app real, cache limpo):** sessão com subamostras → tabela `CIGARRINHA_S01..S05`; fotos →
`parcela_101_01/02`, `parcela_102_01`, `foto_04` (sem parcela); export `.xlsx` conferido no openpyxl.

---

## Tela de Revisão + Exportar Excel (integração na PWA) — feito e validado

**O que:** depois de **Finalizar avaliação**, aparece o botão **"Revisar dados e exportar Excel"**
que abre uma nova tela (`#screen-revisao`). Ela roda o pós-transcrição sobre as transcrições dos
trechos e mostra uma **tabela editável por parcela** (uma coluna por alvo), com botões **+ Parcela**,
**+ Coluna** e remover linha/coluna, além de um bloco recolhível **"Ver transcrição reconhecida"**.
O botão **Exportar Excel (.xlsx)** gera a planilha e usa o mesmo fluxo de compartilhamento/download
já existente (`js/sync.js`: Web Share → pasta local → download).

**Por quê:** torna o motor de pós-transcrição utilizável ponta a ponta no celular — o avaliador
revisa/corrige o que foi reconhecido e exporta o Excel na hora, sem depender de ferramenta externa.

**Como (arquivos):**
- `js/postprocess/pipeline.js` — junta as transcrições dos trechos (por espaço) e roda
  normalize → resolve termos → parse. `runPipeline(texto)` e `runPipelineFromAudios(audios)`.
- `js/screens/review.js` — `onEnterReview` monta o modelo editável a partir do parser; render de
  tabela com inputs; +linha/+coluna; `exportEvaluationXlsx` + `exportFiles` no botão exportar.
- `index.html` — nova `<section id="screen-revisao">` + botão `#btnRevisarExcel` na Captura.
- `js/app.js` — rota `revisao` registrada. `js/screens/capture.js` — mostra o botão após finalizar.
- `js/i18n.js` — textos PT/EN/ES da tela. `css/styles.css` — estilo da tabela editável.
- `service-worker.js` — `CACHE_VERSION` → `voiceeval-v8` + `js/postprocess/*` e `review.js` no APP_SHELL.

**Escopo (decisão do usuário):** pular as heurísticas de recuperação de ASR da ferramenta Python
(dígitos fundidos, valores vazados, 2ª passada) — a PWA transcreve limpo e a revisão na tela cobre
erros. Subamostras (Davis/genérica), correção por voz e renomeio de fotos ficam para depois.

**Validação (browser, cache limpo):** navegação → tabela renderiza `Parcela 101 BUVA 10 AMARGOSO 20`
/ `Parcela 102 BUVA 30 AMARGOSO ausente(vazio)`; +coluna/+parcela funcionam; correção de bug do
parser (token "." solto entre trechos virava coluna vazia → agora ignorado); botão Exportar gera o
`.xlsx` e dispara o fluxo de compartilhamento (toast "Planilha Excel gerada.").

---

## Pós-transcrição (porte da ferramenta Python → PWA) — em andamento

**Objetivo:** portar o pós-transcrição da ferramenta `2voice_eval_tool` (Python/Streamlit) para a
PWA em JS puro, descartando os motores de ASR (Whisper/Canary/Gemini) — a PWA já transcreve.
Pipeline: **normalizar → resolver termos → parsear → exportar Excel + renomear fotos**.

**Fase 1 (feita e validada) — fundação em `js/postprocess/`:**- `program_rules_dictionary.json` — dicionário real copiado da ferramenta (term_aliases +
  multilingual_terms PT/ES/EN + EPPO).
- `normalize.js` — limpeza de texto (acentos/espaços/pontuação), equivalente ao
  `transcript_normalizer.py`.
- `rules.js` — carrega o dicionário e resolve termos (alias → código canônico), casando a frase
  mais longa primeiro; exclui `PARCELA` (tratado pelo parser).
- `spoken_numbers.js` — números por extenso PT/ES/EN (0-20, dezenas, cem).
- `parser.js` — `parseTranscript`: blocos por parcela (parcela/plot/lote + variantes ASR),
  item→valor, `"<N> para tudo"` preenche todas as colunas, ausência (`não tem X`/`no hay`) deixa a
  coluna vazia (`.`), tabela ordenada por parcela.
- **Validação (browser):** reproduz `caso_1/2/3` do `test_parser_variacoes.py` e um caso de
  resolução (`capim amargoso`→`AMARGOSO`, `buva`→`BUVA`, ausência→`.`). Todos passam.

**Fase 2 (feita e validada) — exportador Excel `js/postprocess/xlsx.js`:**
- Escritor `.xlsx` (SpreadsheetML/OPC) próprio, sem dependências, reaproveitando o ZIP de
  `js/zip.js` (um `.xlsx` é um ZIP de partes XML). Strings inline (dispensa sharedStrings/styles).
- Aba **FORMATO_FINAL**: linha 1 = `[ensaio, data, ref_fotos]`; linha 2 = cabeçalho (célula vazia
  sobre a coluna Parcela); 1 linha por parcela, ordenada; vazio = `.`. Colunas de subamostra
  `<ITEM>_S01` exibidas como `<ITEM>1`.
- Aba **LISTA_COPIAR_COLAR** (2 colunas): só aparece com exatamente 1 item de subamostra genérica
  OU protocolo de plantas (Davis). Valores empilhados, Parcela só na 1ª linha do bloco, vazio→branco.
- Nome do arquivo: `Avaliacao_<ensaio>_<data DD-MM-AA>_<ref fotos>.xlsx` (rótulos PT/EN/ES).
- **Validação:** gerado no browser e **aberto com openpyxl** (mesma lib da ferramenta) — abas,
  cabeçalhos, renomeio `_S01→1`, empilhamento vertical e células vazias conferem.

**Próximas fases:** parsing de subamostras (Davis/genérica/terço) alimentando as colunas `_S01`/o
protocolo de plantas; correção por voz; renomeio de fotos por parcela (reusando o vínculo
foto→áudio anterior que a PWA já grava); e a tela de revisão pós-transcrição + botão de exportar,
integrando tudo na Captura.

---

## Arquitetura geral (base do projeto)

**O que:** PWA (Progressive Web App) 100% estático — HTML + CSS + JavaScript puro (ES Modules),
sem framework, sem bundler, sem Node/npm e sem Azure AD / Microsoft Graph.

**Como:** arquivos servidos diretamente (ex.: Netlify, `publish = "."`), Service Worker cacheando
o "app shell" para uso offline, dados no navegador via IndexedDB.

**Por quê:**
- A máquina do usuário final pode não ter Node/npm nem permissão para instalar pacotes → nada de
  build.
- Registro de app no Azure AD e Microsoft Graph costumam esbarrar em políticas de TI corporativa
  (sem admin do tenant, conditional access, gateway Zscaler observado na prática) → a "transmissão"
  não depende de login corporativo.

---

## Funcionalidades implementadas

### Teclado numérico + normalização em MAIÚSCULAS nos campos — `index.html`, `css/styles.css`, `js/app.js`
**O que:** "Número de tratamentos", "Número de repetições" e "Número de subamostras" abrem apenas o
teclado numérico no celular (`type="number"` + `inputmode="numeric"` + `pattern="[0-9]*"`). Os demais
campos de texto (nome do ensaio, referência, tipos de avaliação, item avaliado, pragas avaliadas,
escala de notas) são normalizados para MAIÚSCULAS aceitando números e texto — a conversão é no
**valor** salvo (não só visual), preservando a posição do cursor (`initUppercaseInputs` em app.js,
classe `.input-uppercase`).
**Por quê:** pedido do usuário — padroniza os dados de entrada para os outputs/normalização
posterior e facilita a digitação numérica em campo.


**O que:** cada trecho de áudio pode ser transcrito, com o idioma da fala escolhido pelo usuário
(PT-BR / EN-US / ES-ES) e o modo selecionável na tela de Captura:
- **Nuvem:** Web Speech API nativa (`SpeechRecognition`/`webkitSpeechRecognition`), ao vivo em
  paralelo à gravação. Funciona em Android Chrome e iOS Safari 14.5+.
- **No dispositivo (Local):** Whisper via transformers.js (WebAssembly), pós-processando o blob
  já gravado — sem enviar áudio para fora, mas depende de baixar lib/modelo de um CDN.
- **Desativada:** só grava o áudio.

**Como:**
- `CloudTranscriber`: reconhecimento contínuo, reinício automático quando o navegador encerra a
  sessão sozinho (comum no Android), tratamento de erros sem lançar exceção — sempre resolve com
  `{transcript, status}`.
- `LocalTranscriber`: import dinâmico do transformers.js por CDN (sem npm/build), pipeline
  `automatic-speech-recognition` com `Xenova/whisper-tiny`; decodifica o áudio para PCM mono 16 kHz
  (Web Audio API + resample linear) antes de transcrever; cacheia o modelo após o 1º uso.
- Na Captura (`js/screens/capture.js`): ao gravar em modo Nuvem, inicia o transcritor em paralelo;
  ao concluir um trecho (`finishCurrentClip`), coleta o resultado (imediato na Nuvem; assíncrono no
  Local, com status `processando` que atualiza sozinho). Indicador curto de status; **o texto não
  aparece na tela** durante a gravação.
- Persistência: `transcript` + `transcricaoStatus` vão no `meta` do áudio (IndexedDB) e no
  `resumo.md`; o idioma/modo escolhidos ficam em `settings` e são lembrados entre avaliações.

**Por quê:** a ferramenta é para avaliações de voz que depois são transcritas/normalizadas; o
usuário escolhe o idioma para maior assertividade, e o modo conforme conexão/privacidade. Nada
trava a avaliação se a transcrição falhar (sem internet, silêncio, CDN bloqueado): o áudio é salvo
e o status vira `indisponivel`.

### Transcrição bruta em `.txt` separado — `js/summary.js`
**O que:** além de entrar no `resumo.md`, a transcrição sai também como um arquivo de texto puro
`Transcricao/transcricao.txt` dentro do ZIP, com cabeçalho (ensaio, data, referência, idioma, modo)
e, por trecho de áudio, o status, as fotos associadas e o texto transcrito bruto.
**Por quê:** pedido do usuário — a ferramenta de padronização vai ler esse `.txt` depois para
analisar, normalizar e gerar a planilha Excel final. É a "transcrição original" que o usuário acessa
nos outputs; a versão normalizada/Excel é responsabilidade do passo posterior (ver
`ideia-para-o-futuro.md`).

### Foto com áudio auto-segmentado + vínculo foto↔áudio — `js/screens/capture.js`, `js/state.js`
**O que:** no fluxo real de campo, o avaliador narra continuamente ("…foto parcela 101") e toca
**Tirar foto**. Ao tocar, o app **auto-conclui o trecho de áudio atual** (capturando o rótulo
falado), abre a câmera nativa, tira a foto e fica pronto para o próximo trecho. Cada foto grava o
vínculo com o **trecho de áudio imediatamente anterior** (`audioAnteriorId`/`audioAnteriorIndice`),
registrado no estado e no `resumo.md` ("foto X — rotulada pelo áudio #N").
**Por quê:** a câmera nativa interrompe o microfone no celular (limite de hardware), então segmentar
o áudio a cada foto dá a sensação de narração contínua, preserva a ordem e amarra cada foto ao seu
rótulo falado — insumo direto para a normalização futura. Foto por **botão** (confiável em iOS e
Android); gatilho por voz ficou adiado (ver `ideia-para-o-futuro.md`).

---

## Funcionalidades implementadas (base)

### Camada de dados local (IndexedDB) — `js/db.js`
**O que:** stores `trialHistory` (histórico de ensaios p/ autocomplete), `pendingEvaluations`
(fila offline), `mediaFiles` (blobs de áudio/foto), `settings` (preferências).
**Por quê:** o app precisa funcionar 100% offline e guardar áudio/foto até a transmissão; tudo fica
no dispositivo, nada sai automaticamente para servidor nenhum.

### Internacionalização (PT/EN/ES) — `js/i18n.js`
**O que:** dicionário de textos nas 3 línguas; detecção automática pelo idioma do navegador
(`navigator.languages`), com troca manual no seletor do topo, persistida em `localStorage`.
**Por quê:** usuários em PT/EN/ES; decisão explícita de **não** usar IP/geolocalização (VPN
corporativa torna isso não confiável) — só o cabeçalho de idioma do navegador.

### Exportação / "transmissão" sem Azure — `js/sync.js`
**O que:** ao finalizar/transmitir, gera **um único `.zip`** (escritor próprio em `js/zip.js`, sem
dependências) com a estrutura `NomeEnsaio_Data_Referencia/MD|Audios|Fotos/…` e o entrega por, em
ordem de preferência: (1) **Web Share API** com arquivos (abre o seletor nativo → OneDrive, Teams,
e-mail, WhatsApp já logados), (2) **File System Access API** (grava numa pasta local escolhida,
ex.: pasta do OneDrive sincronizada no PC), (3) **download** simples como fallback.
**Por quê:** substitui o upload direto ao SharePoint do app Power Apps original, sem depender de
Graph/login — o usuário decide o destino no seletor do sistema.

### Agrupamento em ZIP com pastas — `js/zip.js` + `js/summary.js`
**O que:** em vez de 3+ arquivos soltos, um `.zip` por avaliação com subpastas `MD/`, `Audios/`,
`Fotos/`; nomes de arquivo padronizados por índice.
**Por quê:** pedido do usuário — facilita mover/organizar; a pasta base carrega nome do ensaio,
data e referência da avaliação.

### Fotos sem pré-visualização
**O que:** as fotos capturadas **não** aparecem em galeria na tela; só um **contador** de fotos e
um botão "Remover última foto". Ficam guardadas no IndexedDB até a transmissão.
**Por quê:** pedido do usuário (privacidade / interface limpa).

### Escala de notas sem valor pré-preenchido
**O que:** o campo "Escala de notas" começa vazio, mostrando só um hint de exemplos
(`Ex: 0-100, Davis 0-9, 1-8, contagem`), sem `0-100` fixo.
**Por quê:** pedido do usuário — era um exemplo, não um padrão a ser assumido.

### Travar "Voltar" após iniciar a captura — `js/screens/capture.js`
**O que:** assim que existe ao menos 1 áudio, 1 foto, ou uma gravação em andamento, o botão
"Voltar" da tela de Captura fica desabilitado; sai-se só por "Finalizar" ou "Salvar offline".
**Por quê:** pedido do usuário — uma vez iniciada a avaliação, ela deve ser finalizada.

### Modal de confirmação próprio (não `window.confirm`) — `js/utils.js`
**O que:** `confirmDialog()` + `#confirmModal` no HTML, no lugar de `window.confirm()`.
**Por quê:** diálogos nativos em PWA instalado (standalone) podem travar o foco/teclado da tela
depois de fechados — foi a causa do bug "parou de deixar digitar após Limpar ensaios salvos".

---

## Notas de manutenção / lições
- Ao mudar arquivos do app shell, **subir `CACHE_VERSION`** em `service-worker.js` (senão o
  navegador serve a versão antiga do cache) e adicionar arquivos novos à lista `APP_SHELL`.
- `get_errors` (diagnóstico do editor) **não** pega toda quebra de sintaxe (ex.: chave `}`
  sobrando) — validar também com contagem de chaves e/ou `import()` dinâmico no navegador.
- Node/npm **não** estão disponíveis no ambiente; servir localmente com `py -3 -m http.server`.
