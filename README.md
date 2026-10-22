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

## Releases (instaladores)

```bash
npm run release -- 0.3.0     # ajusta a versão, faz commit e cria a tag v0.3.0
git push && git push origin v0.3.0
```
O workflow **Release** gera Linux (DEB, RPM, AppImage), Windows (MSI, NSIS) e macOS (DMG universal) e publica no GitHub Releases.
O macOS é compilado na nuvem, então você não precisa de um Mac para ter o app para Apple.
O atualizador silencioso dentro do app (Tauri Updater) exige uma chave de assinatura nos *secrets* do GitHub e entra numa etapa futura.

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
