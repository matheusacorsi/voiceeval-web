# VoiceEval Web

Reimplementacao do PoC "VoiceEval" (originalmente em Power Apps) como um **PWA estatico**
(HTML + CSS + JavaScript puro, sem framework, sem bundler, sem Node/npm e sem Azure AD /
Microsoft Graph). O objetivo e resolver os problemas de compartilhamento/licenciamento do
Power Apps, permitindo publicar o app no Netlify e os usuarios acessarem (e instalarem) pelo
navegador do celular ou computador.

## Por que sem Node/npm e sem Azure/Microsoft Graph?

- O ambiente corporativo do usuario final pode nao ter Node/npm instalado nem permissao para
  instalar pacotes — entao o projeto **nao depende de build**: e HTML/CSS/JS puro, ES Modules
  nativos do navegador.
- Registro de aplicativo no Azure AD e uso do Microsoft Graph costumam esbarrar em politicas de
  TI corporativa (falta de acesso de administrador do tenant, conditional access, etc.) — por
  isso a transmissao dos dados **nao depende de login/Graph**. Em vez disso, o app usa recursos
  nativos do navegador/SO:
  1. **Web Share API** (`navigator.share` com arquivos): abre o seletor nativo do sistema para
     enviar os arquivos gerados (resumo + audios + fotos) para o app OneDrive, Teams, e-mail,
     WhatsApp etc. ja autenticados no aparelho do usuario.
  2. **File System Access API** (Chrome/Edge no computador): permite escolher, uma unica vez,
     uma pasta local (por exemplo, a pasta do OneDrive sincronizada no PC) e o app passa a
     salvar os arquivos diretamente ali.
  3. **Download simples**: se nada acima estiver disponivel, o navegador baixa os arquivos e o
     usuario os move manualmente para o OneDrive/SharePoint.
- Se no futuro a TI liberar um registro no Azure AD, e possivel adicionar um modulo de upload via
  Microsoft Graph como uma opcao adicional em `js/sync.js` — a estrutura ja isola toda a logica
  de exportacao nesse arquivo, então nao muda o restante do app.

## Estrutura do projeto

```
index.html              tela unica com as 5 "telas" do fluxo original (secoes mostradas/ocultadas)
manifest.webmanifest     manifesto do PWA (nome, icones, cores)
service-worker.js        cache do app shell para uso offline
netlify.toml             configuracao de deploy estatico no Netlify
css/styles.css           estilos
icons/                   icones do PWA (SVG de placeholder — troque pela marca real)
js/
  app.js                 bootstrap, roteador (hash) e wiring geral
  i18n.js                dicionario PT/EN/ES + deteccao de idioma do navegador
  db.js                  IndexedDB (historico de ensaios, fila de pendencias, midias, config)
  state.js               estado em memoria do ensaio em andamento
  recorder.js             gravacao de audio via MediaRecorder
  photo.js               captura de foto via camera nativa (input[capture])
  summary.js             geracao do resumo em Markdown e nomes de arquivo
  sync.js                exportacao (Web Share / File System Access / download)
  screens/               logica de cada tela (inicio, identificacao, config, captura, pendencias)
```

## Fluxo (equivalente ao Power Apps)

1. **Inicio** — iniciar nova avaliacao, ver pendencias offline, limpar ensaios salvos.
2. **Identificacao** — nome do ensaio (com autocomplete/historico), data, referencia (ex.: 7DAA),
   numero de tratamentos e repeticoes.
3. **Configuracao** — tipos de avaliacao, item avaliado, pragas avaliadas, escala de notas,
   subamostras.
4. **Captura** — grava trechos de audio (com pausa/retomada e "concluir trecho"), tira fotos,
   finaliza a avaliacao (grava tudo no IndexedDB) e tenta transmitir.
5. **Pendencias** — lista avaliacoes finalizadas que ainda nao foram transmitidas (ficam salvas no
   dispositivo mesmo sem internet), permite transmitir uma ou todas.

Todos os dados (audios, fotos, textos) ficam gravados no **IndexedDB do navegador** ate serem
transmitidos com sucesso — funciona 100% offline depois do primeiro carregamento (graças ao
service worker).

## Rodando localmente (sem precisar instalar Node)

Como e um site estatico, basta servir a pasta por HTTP (nao abra por `file://`, pois service
worker e camera/microfone exigem contexto seguro). Qualquer uma destas opcoes funciona:

- **VS Code**: instale a extensao "Live Server" e clique em "Go Live" — nao precisa de Node.
- **Python** (se disponivel): `python -m http.server 5500` na pasta do projeto.
- Qualquer outro servidor estatico simples.

Depois acesse `http://localhost:<porta>`.

## Deploy no Netlify

Nao ha passo de build. Duas formas simples:

1. **Arrastar e soltar**: em https://app.netlify.com/ , va em "Add new site" → "Deploy manually" e
   arraste a pasta do projeto inteira.
2. **Via Git** (recomendado para atualizacoes continuas): suba este projeto para um repositorio
   (GitHub/GitLab/Bitbucket), conecte no Netlify e configure:
   - Build command: (deixe vazio)
   - Publish directory: `.`

O `netlify.toml` ja inclui esses ajustes e cabecalhos de seguranca basicos (permissoes de camera/
microfone restritas ao proprio site, `X-Frame-Options`, `X-Content-Type-Options`).

O Netlify fornece HTTPS automaticamente, exigido para PWA, camera e microfone.

## Icones do PWA

Os arquivos em `icons/` sao SVG de placeholder para o app ja funcionar/instalar. Para producao,
gere icones PNG 192x192 e 512x512 com a marca real (qualquer gerador de favicon/PWA icon) e
atualize as referencias em `manifest.webmanifest` e `index.html`.

## Limitacoes conhecidas

- Sem Microsoft Graph, nao ha upload automatico e silencioso para o SharePoint como no Power
  Apps original — a transmissao depende do usuario escolher o destino no seletor de
  compartilhamento do sistema (ou apontar uma pasta local no computador).
- `navigator.share` com arquivos exige interacao/gesto do usuario; ao "Transmitir todas" varias
  pendencias em sequencia, o navegador pode negar o compartilhamento nativo apos a primeira
  chamada — nesse caso o app cai automaticamente para gravar a pasta configurada ou baixar os
  arquivos.
- A API File System Access (pasta local) so existe em navegadores baseados em Chromium no
  computador; no celular, a melhor opcao e o Web Share API.
- Idioma detectado automaticamente pelos idiomas do navegador (PT/EN/ES); pode ser trocado
  manualmente no seletor no topo, e a escolha fica salva no dispositivo.
