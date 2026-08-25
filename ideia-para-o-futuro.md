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
