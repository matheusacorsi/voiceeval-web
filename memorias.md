# Memórias do projeto — VoiceEval Web

Registro vivo de tudo que foi implementado, **como** e **por quê**. Cada mudança nova entra aqui.
Mais recente no topo de cada seção.

---

## Pós-transcrição (porte da ferramenta Python → PWA) — em andamento

**Objetivo:** portar o pós-transcrição da ferramenta `2voice_eval_tool` (Python/Streamlit) para a
PWA em JS puro, descartando os motores de ASR (Whisper/Canary/Gemini) — a PWA já transcreve.
Pipeline: **normalizar → resolver termos → parsear → exportar Excel + renomear fotos**.

**Fase 1 (feita e validada) — fundação em `js/postprocess/`:**
- `program_rules_dictionary.json` — dicionário real copiado da ferramenta (term_aliases +
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

**Próximas fases:** subamostras (Davis/genérica/terço), correção por voz, exportador `.xlsx`
(FORMATO_FINAL + LISTA_COPIAR_COLAR via `js/zip.js`), renomeio de fotos por parcela (reusando o
vínculo foto→áudio anterior que a PWA já grava), e a tela de revisão + integração na Captura.

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
