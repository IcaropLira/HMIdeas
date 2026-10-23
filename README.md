# HM Ideas

**Hiraku Manager Ideas**: quadro branco e caderno de anotações com caneta, parte da família Hiraku.
Tauri 2 + React + zustand + PixiJS.

Estado atual: **v0.2.0** — canvas infinito, caneta com pressão, motor de traço próprio (sem glitches ao cruzar o traço), pincéis personalizáveis (caneta, escrita, esferográfica, nanquim, marcador, marca-texto, pincel), borracha de traço ou de pixel, seletor de cor completo e conta-gotas, formas, linhas e setas conectadas, texto, borracha, seleção/laço, várias páginas com miniaturas, papéis, desfazer/refazer, salvar/abrir `.hiraku`.

Veja `AGENTS.md` para decisões, arquitetura e roadmap.

## Atualizar por patches (sem baixar zip nem reinstalar tudo)

Cada atualização chega como um arquivo `.patch` (formato `git format-patch`, com a mensagem do commit).
Coloque-o na pasta `patches/` (ela é ignorada pelo Git) e rode:

```bash
npm run patch                                  # aplica todos os de ./patches ainda não aplicados
npm run patch -- patches/0003-feat-texto.patch # ou um arquivo específico
npm run patch -- --dry-run                     # só confere se aplicaria, sem mexer em nada
```

O script:
- exige a árvore de trabalho limpa (faça commit ou `git stash` antes);
- aplica com `git am --3way`, **mantendo o histórico** (cada patch vira um commit);
- se algo falhar, desfaz tudo (`git am --abort`) e mostra o motivo, sem deixar o projeto pela metade;
- roda `npm install` **só se** o `package.json` mudou, e avisa quando o Rust/Tauri mudou;
- roda `npm run typecheck` ao final (se as dependências estiverem instaladas).

Para desfazer um patch já aplicado: `git revert <commit>`.

## Publicar e atualizar (site, Windows, Linux, Android, macOS)

Tudo roda no GitHub Actions; você só precisa fazer a configuração abaixo **uma vez**.

**1. Site (PWA) + página de download** — `Settings → Pages → Source: GitHub Actions`. A cada push na `main` o workflow **Site**
publica o app em `https://dono.github.io/repositorio/` e a página de download em `.../download.html` (ela lê a última release e
destaca o instalador do sistema de quem abriu). O site é instalável (Chrome/Edge/Android/iPad) e funciona offline. Domínio próprio:
crie a variável de repositório `SITE_BASE` = `/`.

**2. Chave das atualizações do desktop** (uma vez):

```bash
npm run updater:keys     # gera ~/.tauri/hm-ideas.key e grava a chave PÚBLICA no tauri.conf.json (faça commit)
```
Cadastre em `Settings → Secrets and variables → Actions`: `TAURI_SIGNING_PRIVATE_KEY` (conteúdo do arquivo) e, se pôs senha,
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Sem essa chave o app recusa qualquer atualização (é a proteção contra pacote falso).

**3. Chave do APK (Android)** (uma vez, e use SEMPRE a mesma — o Android só atualiza por cima se a assinatura for igual):

```bash
npm run android:keystore # imprime os 3 secrets: ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS
```

**4. Publicar uma versão**:

```bash
npm run release -- 0.3.0
git push && git push origin v0.3.0
```
O workflow **Release** gera Windows (EXE + MSI), Linux (AppImage, DEB, RPM), macOS (DMG) e Android (APK), publica na release e cria o
`latest.json`. A página de download já mostra os arquivos novos.

**Como cada um se atualiza**
- Windows / macOS / Linux AppImage: o app verifica ao abrir e a cada 6 h; mostra “Nova versão” → **Atualizar** baixa o pacote
  assinado, instala e reinicia. O botão `vX.Y.Z` no topo verifica na hora.
- Linux DEB/RPM e Android: o app avisa e abre o download da versão nova (instale por cima).
- Site/PWA: o aviso pede um clique para recarregar. O desenho é guardado automaticamente no navegador (IndexedDB) e restaurado ao abrir,
  então atualizar não perde nada. (“Salvar” continua gerando o arquivo `.hiraku`.)

Avisos honestos: sem certificado pago, o Windows (SmartScreen) e o macOS (Gatekeeper) mostram um alerta no primeiro uso; a
atualização automática funciona mesmo assim. iPhone/iPad só têm a versão web (PWA).

## Releases (instaladores)

```bash
npm run release -- 0.3.0     # ajusta a versão, faz commit e cria a tag v0.3.0
git push && git push origin v0.3.0
```
O workflow **Release** gera Linux (DEB, RPM, AppImage), Windows (MSI, NSIS) e macOS (DMG universal) e publica no GitHub Releases.
O macOS é compilado na nuvem, então você não precisa de um Mac para ter o app para Apple.
O atualizador automático está descrito em “Publicar e atualizar”, acima.

## Pré-requisitos (Linux)

Node 20+, Rust (https://rustup.rs) e as dependências do Tauri. No Debian/Ubuntu:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```
Em outras distros, consulte https://tauri.app/start/prerequisites/.

## Rodar

```bash
npm install
npm run tauri dev     # os ícones já vêm no repositório (para trocar: npm run icons)
```

## Testar no iPad sem Mac (PWA)

```bash
npm run dev -- --host
```
Abra `http://<ip-do-seu-pc>:1420` no Safari do iPad (mesma rede Wi-Fi) → Compartilhar → *Adicionar à Tela de Início*.
Para HTTPS e service worker, publique o resultado de `npm run build` (pasta `dist`) em qualquer hospedagem estática.

## Android

```bash
npm run tauri android init     # 1ª vez
npm run tauri android dev
```
Requer Android Studio, SDK/NDK e as variáveis `ANDROID_HOME`, `NDK_HOME` e `JAVA_HOME`.

## Controles

| Ação | Como |
|---|---|
| Desenhar | Caneta, mouse (ferramenta Caneta); dedo só se ativar "Desenhar com o dedo" |
| Mover a tela | Ferramenta Mão, Espaço+arrastar, botão do meio/direito, scroll, ou 1 dedo |
| Zoom | Ctrl+scroll, pinça no trackpad ou 2 dedos |
| Desfazer / refazer | Ctrl+Z / Ctrl+Shift+Z (ou Ctrl+Y) |
| Borracha | Ferramenta Borracha (apaga o traço inteiro) ou a ponta-borracha da caneta |
| Papel e ajustes | Botões *Papel* (liso, pautado, quadriculado, pontilhado) e *Ajustes da caneta* (pressão e estabilização) |
| Formas | Retângulo (R), elipse (O), losango (D): arraste. Shift = quadrado/círculo, Alt = a partir do centro |
| Selecionar / Laço | V / L. Selecionar: clique, Shift+clique, arrastar em área vazia = caixa. Laço: desenhe em volta (botão alterna *Só dentro* / *Tocando*) |
| Transformar | Arraste o corpo para mover, alças para redimensionar (Shift = proporção, Alt = do centro) e a alça de cima para girar (Shift = 15°) |
| Edição | Delete, Ctrl+A / C / X / V / D, setas (Shift = 10) |
| Páginas | Botão no canto superior esquerdo abre a barra de páginas (nova, duplicar, renomear, mover, excluir). PageUp/PageDown navegam; cada página lembra seu pan/zoom |
| Linhas e setas | Arraste (A / 5 = seta, 6 = linha). Shift trava em 15°. Com a linha selecionada, arraste os pontos; a bolinha do meio cria um ponto; Alt+clique remove. Pontas e curvas no botão de estilo das formas |
| Conectar setas | Solte a ponta de uma seta sobre uma forma: ela liga e acompanha a forma quando você a move, redimensiona ou gira. Arrastar a ponta para o vazio desliga |
| Texto | T / 8: clique no canvas e escreva (Enter = nova linha; Esc, Ctrl+Enter ou clicar fora confirma). Duplo clique/toque num texto edita; no vazio cria. Botão *Aa* muda fonte, tamanho e alinhamento |
| Atalhos de ferramenta | V = selecionar, L = laço, P = caneta, E = borracha, H = mão |
# HMIdeas
