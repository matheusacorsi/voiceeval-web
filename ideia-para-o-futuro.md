# Ideias para o futuro — VoiceEval Web

Backlog de melhorias pensadas mas **deliberadamente adiadas**. Cada item traz o motivo de estar
aqui e não no produto agora.

---

## 1. Gatilho de foto por voz (mão-livre)

**Ideia:** o avaliador narra continuamente e, ao dizer a palavra-chave *"foto"* (ex.: "foto
parcela 101"), o app **abre a câmera sozinho**, sem tocar na tela.

**Por que está adiado:** exige reconhecimento de fala **ao vivo** rodando o tempo todo (Web Speech
API / modo Nuvem). Isso é razoavelmente confiável no **Android/Chrome**, mas **frágil no iPhone**:
o iOS tende a dar acesso **exclusivo** ao microfone e, ao abrir a câmera nativa, a página vai para
segundo plano e o reconhecimento é encerrado. Cross-platform confiável não é viável hoje.

**Como poderia ser feito:** modo opcional "mão-livre" (só habilitável quando o motor Nuvem estiver
ativo e a plataforma for Android), detectando a palavra-chave no stream de reconhecimento ao vivo e
disparando a mesma ação do botão "Tirar foto". Manter o botão como caminho padrão.

**Decisão atual:** foto é acionada por **botão** "Tirar foto" (Opção 1), confiável em iOS e Android.

---

## 2. Câmera dentro do app (sem interromper o áudio)

**Ideia:** capturar a foto com uma câmera **in-app** (`getUserMedia({video})` + snapshot em
`<canvas>`), em vez do app de câmera nativo, para permitir tirar foto **com o microfone ainda
gravando** de fato ao mesmo tempo.

**Por que está adiado:** a câmera nativa dá **melhor qualidade** de foto (HDR, foco, processamento
do fabricante). A câmera in-app é mais pobre e mais complexa. Como o fluxo real é narrar → tocar →
fotografar → voltar (áudio auto-segmentado a cada foto já resolve), a simultaneidade real de mic +
câmera não é necessária hoje.

**Quando reconsiderar:** se algum fluxo exigir fotografar **sem** interromper a narração no mesmo
instante.

---

## 3. Normalização dos dados falados + geração de Excel

**Ideia:** pegar a transcrição bruta de cada áudio, aplicar regras de padronização e gerar um
**Excel final** pronto para o usuário copiar/colar.

**Por que está adiado:** o usuário **já possui um conjunto próprio de regras e condições de
padronização** que pretende trazer depois. A saída (Excel real via ZIP+XML reaproveitando
`js/zip.js`, ou CSV mais simples) e a forma de aplicar as regras (determinístico/regex vs IA) serão
decididas num plano separado quando essas regras chegarem.

**Base já pronta para isso:** cada áudio já guarda `transcript` + `transcricaoStatus`, e o vínculo
`foto ↔ trecho de áudio anterior` é registrado no estado e no `resumo.md` — insumo direto para a
normalização.

---

## 4. Upload direto opcional (Microsoft Graph)

**Ideia:** enviar o pacote automaticamente para uma biblioteca do SharePoint / pasta do OneDrive,
como fazia o app Power Apps original.

**Por que está adiado:** depende de registro de app no **Azure AD** e do **Microsoft Graph**, hoje
bloqueados/restritos pela TI corporativa (sem admin do tenant; gateway Zscaler observado).

**Como poderia ser feito:** módulo opcional e **desligado por padrão** em `js/sync.js` (a estrutura
já isola toda a lógica de exportação nesse arquivo), ativado só se/quando a TI liberar um registro
de app.

---

## 5. Upload automático de 1 toque via Power Automate (gatilho HTTP) — lado do PWA

**Ideia:** ao "Transmitir", o PWA envia o pacote automaticamente para uma **biblioteca específica
do SharePoint** com um único toque — sem o usuário escolher pasta manualmente e **sem login Azure
no app** (contorna o bloqueio de Graph/Azure AD da TI/Zscaler).

**Como funcionaria:**
- O usuário cria um fluxo no **Power Automate** com o gatilho **"Quando uma solicitação HTTP é
  recebida"**, que gera uma URL de POST.
- O fluxo recebe o pacote e usa a ação **SharePoint → Criar arquivo** para salvar na biblioteca
  compartilhada.
- No PWA (a parte que eu implementaria): um campo de configuração para colar a URL do fluxo + um
  `fetch(URL, { method: 'POST', body })` no "Transmitir", com **fallback para o Web Share atual**
  se o POST falhar.
- Divisão de trabalho: o **usuário** cria o fluxo no Power Automate e testa o Zscaler; **eu** faço
  só o lado do PWA.

**Dois pontos a confirmar antes de implementar (lado do PWA):**
1. **Formato do envio:** o fluxo recebe o **`.zip` inteiro (base64)** no corpo do POST, ou prefere
   **um arquivo por vez** (Excel, áudios, fotos separados)?
2. **URL do fluxo:** o usuário **cola a URL nas configurações do app** (recomendado — fica só no
   aparelho dele) ou fica **fixa** no código?

**Cuidados:**
- A URL do fluxo é um **segredo** — não pode ir no código público do GitHub. Por isso o recomendado
  é colar nas configurações (fica só no dispositivo) + o fluxo validar um **cabeçalho secreto**.
- Precisa **testar se o Zscaler libera** o endpoint do Power Automate (`*.azure.com` /
  `*.powerautomate.com`) — costuma liberar por ser M365, mas não é garantido.
- Limite de tamanho da requisição (~100 MB; os zips com áudio ficam bem abaixo).

**Por que está adiado:** decisão do usuário — registrado como plano futuro. Depende de o usuário
criar o fluxo no Power Automate do lado dele. Os caminhos já prontos (Web Share no celular; pasta
do OneDrive/SharePoint sincronizada no PC — itens já implementados em `js/sync.js`) cobrem a
necessidade enquanto isso.

**Relação com o item 4:** este (opção C) é o caminho **recomendado e viável** para upload
automático; o item 4 (Graph/SharePoint REST direto, "opção D") exige registro de app no Azure com
consentimento de admin, hoje bloqueado pela TI.
