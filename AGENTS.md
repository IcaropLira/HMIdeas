# AGENTS.md — HM Ideas (Hiraku Manager Ideas)

Instruções para agentes (Claude Code, Codex, Cursor…). Leia inteiro antes de mexer no código.
Idioma do projeto: **português (pt-BR)** em UI, commits e docs; código e identificadores em inglês.

## O que é

HM Ideas é um app próprio de quadro branco + caderno de anotações com caneta:
- **Base de funções do Excalidraw** (formas, setas, texto, estilo rascunho, bibliotecas, export…).
- **Funções do GoodNotes Pro** (cadernos com páginas, anotação de PDF, caneta com pressão, marca-texto,
  laço de seleção, reconhecimento de formas/escrita, busca em manuscrito, templates, áudio…).
- Desktop (**Linux primeiro**) e tablet (**Android primeiro**). iPad: testar via **PWA** no Safari;
  build nativo iOS só quando houver acesso a um Mac (ou CI com runner macOS).

## Decisões já tomadas (não reabrir sem o dono pedir)

| Tema | Decisão |
|---|---|
| Shell | Tauri 2 (desktop + mobile) |
| UI | React 18 + zustand 5 + TypeScript estrito |
| Canvas | **PixiJS v8 (WebGL)**, escrito do zero — NÃO usar o pacote `@excalidraw/excalidraw` nem fork |
| Dev OS | Linux (WebKitGTK no Tauri), sem Mac |
| Ordem de trabalho | Intercalar: 1 feature "Excalidraw" + 1 feature "GoodNotes" por marco |

## Regras de arquitetura

1. **Modelo ≠ render ≠ UI.** `src/core` é puro (sem Pixi, sem React). `src/render` só desenha o modelo.
   `src/components` só orquestra. Nunca altere o documento a partir do renderer.
2. **Documento imutável.** Elementos nunca são mutados; toda edição cria um novo `HirakuDoc`
   (compartilhando estrutura) via ações do store. Isso dá undo/redo barato e sync por `id`.
3. **Só o documento entra no histórico.** Câmera, ferramenta ativa e UI ficam fora (`useView`, `useTool`).
4. **Coordenadas do mundo vs. tela.** O modelo guarda coordenadas do MUNDO. Converta com `core/camera.ts`.
5. **Entrada unificada.** Ferramentas nunca leem `PointerEvent` direto; usam `input/InputController.ts`.
   Toda função precisa funcionar por **toque e caneta** (sem depender de hover ou teclado).
   Alvos de toque ≥ 44px.
6. **Latência da tinta.** O traço/forma em andamento vive numa camada "live" separada: a cada evento refaz-se
   só a malha DELE (core/strokeMesh.ts, custo linear nos pontos do traço atual; strokes enormes usam `decimateForPreview` só na prévia). Nunca redesenhe a página inteira por
   evento de ponteiro. Se strokes muito longos ficarem lentos, quebrar em trechos.
7. **Formato de arquivo versionado** (`.hiraku`, JSON, campo `version`). Mudou o modelo? Suba a versão
   e escreva migração em `core/serialize.ts`.
8. **Nunca use `alert`/`confirm`/`prompt`** (instáveis no webview do Tauri): use `useUI().showToast` ou UI própria.
9. Sem `localStorage` como fonte de verdade do documento; persistência vai por `core/serialize.ts`
   (e depois por comandos Tauri no desktop/Android).

## Roadmap (marque ao concluir)

### M0 — Fundação
- [x] Scaffold Tauri 2 + Vite + React + zustand + PixiJS
- [x] Canvas infinito: pan (espaço / botão do meio / dedo / ferramenta mão) e zoom (scroll+Ctrl / pinça)
- [x] InputController: caneta, mouse, toque, rejeição de palma simples, coalesced events
- [x] Modelo + undo/redo + salvar/abrir `.hiraku`
- [x] Caneta com pressão (traço ao vivo + commit)
- [ ] **Validar no Linux (WebKitGTK), no Android e no iPad (PWA)** — medir latência e fluidez
- [ ] Ícones do Tauri: `npm run icons`

### M0.5 — Polimento da caneta
- [x] Borracha de traço inteiro (pré-visualização "fantasma", um único passo de undo por gesto)
- [x] Ponta-borracha da caneta (S Pen/Wacom) apaga automaticamente
- [x] Papéis: liso, pautado, quadriculado, pontilhado + 3 cores de folha (desenhados em espaço de tela, com nível de detalhe por zoom)
- [x] Traço com curvas suaves (pontos médios) + sensibilidade à pressão + estabilização ajustáveis
- [ ] Validar o "feeling" com caneta real (Android e iPad/PWA) e calibrar os valores padrão
- [ ] Borracha de pixel (exige cortar traços em pedaços)

### Depois do M0 (sempre em pares: Excalidraw + GoodNotes)
- [x] M1a: Retângulo/elipse/losango (contorno sólido/tracejado/pontilhado, preenchimento, cantos, Shift/Alt) + **traço com afilamento nas pontas** (hoje malha própria, ver “Brushes”)
- [ ] M1a: validar no Linux/Android/iPad; elipses grandes usam polígono (re-tesselar por zoom se aparecerem facetas)
- [x] M1b: Seleção/transformação (clique, Shift, caixa, mover, redimensionar com Shift/Alt, girar com snap de 15°) + **laço** (modos "só dentro" / "tocando"), Delete, Ctrl+A/C/X/V/D, setas, recolorir seleção, barra de ações para toque
- [ ] M1b: validar no tablet (dedo seleciona com a ferramenta Selecionar; 2 dedos = pan/zoom)
- Limitações conhecidas do M1b: redimensionar NÃO uniformemente uma seleção múltipla que contém formas já giradas é aproximado
  (sem cisalhamento); copiar/colar é interno (não usa a área de transferência do sistema); sem agrupar nem ordem de camadas ainda.
- [x] M1c (parte GoodNotes): **páginas e cadernos** — barra lateral com miniaturas SVG, nova (herda o papel)/duplicar/renomear/mover/excluir (tudo desfazível), câmera por página, PageUp/PageDown, botões anterior/próxima
- [x] M1c (parte Excalidraw): **linhas e setas** — pontas (seta, triângulo, ponto, barra), traço contínuo/tracejado/pontilhado, retas ou curvas (Catmull-Rom), Shift trava 15°, edição de pontos com Selecionar (arrastar, inserir pelo ponto-médio, Alt+clique remove)
- [x] M1c (parte Excalidraw): **setas conectadas a formas** — ponta solta sobre uma forma liga (foco guardado em coords normalizadas), a ponta grudada no contorno com folga de 4; mover/redimensionar/girar a forma recalcula as setas ao vivo e no mesmo passo de histórico; apagar a forma solta a seta; mover só a seta desliga; copiar/duplicar remapeia as ligações (`core/binding.ts`)
- [x] M1c (parte Excalidraw): **texto** — <textarea> sobre o canvas (IME/teclado nativos), Pixi `Text` para o confirmado (re-rasteriza ao dar zoom), 4 famílias do sistema, 4 tamanhos, alinhamento; criar com a ferramenta Texto ou duplo toque no vazio; editar com clique (Texto), duplo toque ou Enter (Selecionar); mover/girar/redimensionar (escala a fonte); borracha e miniaturas; setas ligam a texto
- Pendências de texto: texto dentro de formas (rótulo com quebra automática), fontes embutidas (Excalifont/Virgil etc.), espessura/negrito, listas
- **M1c concluído.** Próximo: M1d (export PNG/SVG, import/export `.excalidraw`, estilo rascunho) + marca-texto
- Pendências de páginas: arrastar-e-soltar para reordenar, título do caderno, fundo de PDF por página (M2)
- [x] Brushes (parte A): **registro de brushes** (`core/brushes.ts`) + 6 de contorno (caneta, esferográfica, nanquim, marcador, marca-texto, pincel), painel de pincéis com pré-visualização, opacidade, **seletor de cor** (HSV + hex, 4 paletas, recentes, cor lembrada por brush) e **conta-gotas** (pega a cor do desenho sob o toque)
- [ ] M1d: Estilo rascunho (rough.js), export PNG/SVG, import/export `.excalidraw` + **marca-texto e borracha por traço**
- [ ] M2: Molduras, bibliotecas, mermaid, laser pointer + **anotação de PDF**
- [x] 0.6: camadas, barras lego (grupos), papel com qualquer cor e 11 padrões, galeria de modelos, grafos + algoritmos, sólidos/planos/
  gráficos/calculadora, temas de mapa mental, tela inicial, temas da interface e modo foco
- [ ] 0.6: validar no tablet o arraste de grupos de barras e o modo "Controlar player" do vídeo (WebView2/WebKitGTK)
- [x] 0.7: blocos nativos (post-it, cartão, tarefas, tabela, linha do tempo, kanban, slide, documento, destaque, código), modelos feitos
  de blocos, ferramentas Vértice/Aresta (Tab cria vizinho ligado, arestas com peso/direção) e correção da tela em branco
- [ ] 0.7: validar no tablet o toque na caixinha de tarefa e o arraste de aresta com o dedo
- [x] 0.8 (Blocks Update): registro de blocos (40+ tipos, 140 variações, adesivos), biblioteca, transformar bloco, edição no próprio bloco,
  bloco Página (editor do Hiraku Comic Manager), cadernos com páginas de tamanho fixo, setas puxadas das bordas, laser em dois modos
- [ ] 0.8: validar no tablet a edição no bloco (teclado virtual), o editor de Página (contenteditable no WebKitGTK/Android) e a caneta laser
- [x] 0.9 (Docking Update): atalhos personalizáveis para tudo, grupos hierárquicos (entrar/sair sem desagrupar), seleção inteligente,
  barra contextual, alinhar/distribuir/grade/guias, painel de objetos, 12 fontes e edição de texto, painéis acopláveis, menus,
  barra de opções/status e áreas de trabalho
- [ ] 0.9: validar no tablet o arraste de abas/painéis com o dedo, o toque longo nas ferramentas agrupadas e a barra contextual
- [x] 0.9.1: barras de bloquinhos sem alças, Inserir separado de Blocos, painéis mais limpos, vértices numerados e redondos,
  Shift+arrastar cria aresta
- [ ] 0.9.1: validar no tablet arrastar bloquinhos com a caneta/dedo (limiar de 12 px) sem disparar a ferramenta
- [x] 0.10 (Ferramentas): ferramentas temporárias (segurar tecla, Ctrl = Selecionar, Alt = conta-gotas), presets, favoritas,
  recentes, histórico de ajustes, macros/sequências, busca por intenção na paleta (com blocos e sugestões)
- [x] 0.11 (Cadernos): pastas e capas (cor, degradê, padrão, título) na Home, papéis Cornell/cabeçalho/caligrafia (+ partitura),
  modelos de página do usuário, arrastar páginas para reordenar, girar folha, índice automático, páginas favoritas e marcadores
- [x] 0.12 (Escrita à mão): filtros por tipo no laço/caixa e na borracha, fita (esconde; toque revela), janela de zoom,
  segurar no fim do traço = forma, rabisco apaga, canetas favoritas
- [ ] M3: **Reconhecimento de formas, escrita→texto, busca em manuscrito**, templates, adesivos, áudio

## Brushes (pincéis)

- **`core/brushes.ts`** só DESCREVE cada brush (puro); **`core/strokeMesh.ts`** (via `core/ink.ts`) calcula a malha do traço
  (puro, testável em Node); `render/strokeDraw.ts` pinta no Pixi. Novo brush = nova entrada no registro, sem tocar no resto.
- O traço guarda `brush` (id), `color`, `width`, `sens`, `taper` e `opacity`. **`width` e `opacity` guardados já são os EFETIVOS**
  (espessura do controle × `size` do brush; opacidade do controle × a do brush), para seleção, hit-test, escala e miniatura
  continuarem funcionando sem conhecer brushes. Brush desconhecido cai na caneta (`getBrush`).
- Arquivo `.hiraku`: `brush` é campo opcional novo, completado em `normalizeDoc` (traço antigo vira `"pen"`). Segue **versão 1**
  porque é aditivo (mesmo critério das migrações leves anteriores).
- Cor: `core/color.ts` (puro). `applyColor` é o único ponto que muda a cor ativa: `commit:false` durante arrastes
  (não enche o histórico), `commit:true` ao soltar (recolore seleção/texto, entra nos recentes).

### Motor de traço (0006)
- O traço NÃO é mais um polígono de contorno (perfect-freehand + earcut): cruzar o próprio traço quebrava a triangulação
  (miolo preenchido no marca-texto, travamentos). Agora é uma **fita de triângulos** (trapézio por trecho + leques redondos nas
  curvas e pontas): custo linear, sem triangulação, ao vivo = gravado. Pontas redondas por padrão; afilamento nunca vira agulha.
- Brush translúcido/`multiply` usa o Mesh como **máscara de stencil** de um retângulo (opacidade de grupo; filtros do Pixi perdem
  a cor com multiply). Opaco + normal pinta o Mesh direto.
- O traço guarda `dyn` (fotografia da dinâmica do brush) e `taper` já resolvido: editar/apagar um brush não muda o que já foi feito.
  `openStart/openEnd` marcam pontas cortadas pela borracha de pixel (retas, sem afilar).
- Entrada: filtro One Euro (`core/oneEuro.ts`) no lugar da média móvel (sem "ponta puxada"); previsão de pontos (`getPredictedEvents`) só para caneta, só na prévia.
- Brushes personalizáveis no painel (duplicar → editar), salvos em localStorage e carregados na partida (`initCustomBrushes`).
- Borracha: modo **traço inteiro** ou **pixel** (`core/erase.ts` corta o traço; gesto = um passo de desfazer via `previewElements/endPreview`).

### Mapa mental e quadros (0007)
- Dois tipos novos de elemento, ambos **caixas** (x, y, w, h): `node` (nó do mapa) e `frame` (quadro). Seleção, binding de setas,
  miniaturas e hit-test reaproveitam o caminho das formas. Arquivo `.hiraku` segue **versão 1** (campos aditivos, saneados em `normalizeDoc`).
- A **árvore** é `parentId` (pai inexistente = raiz). `core/mindmap.ts` é puro: `relayout` posiciona (raiz fixa; layouts both/right/left/down,
  sem sobreposição) e deriva `hidden` (ancestral recolhido). Nós guardam x/y/hidden já calculados para o desenho ser barato; ramos NÃO são
  elementos: o renderer os desenha a partir do pai (`render/mindDraw.ts`). Toda operação grava com `replaceElements` = 1 passo de desfazer.
- Arrastar um nó: leva o ramo; soltar sobre outro nó **reparenta** (sem ciclos), soltar perto reordena entre irmãos (`settleMoved`).
- **Conectores livres** = setas normais ligadas a nós (`isBindable` inclui `node`): seguem os nós ao mover/recolher. Atalho K liga 2 selecionados.
- **Quadros** (`core/frames.ts`): pertencer = `frameId`; aninham; `settleFrames` escolhe o quadro mais interno que contém o centro e nunca
  um descendente. Mover o quadro leva os membros (`withDependents`). Não recortam o conteúdo. Apagar quadro solta o conteúdo; apagar nó apaga o ramo.
- A borracha (traço/pixel) ignora nós e quadros. Atalhos: Tab filho, Enter irmão, Shift+Enter irmão acima, F2 editar, C recolher, setas navegam,
  K ligar, Ctrl+G / Ctrl+Shift+G quadro, M/F ferramentas, Shift+1 / Shift+2 ver tudo / seleção. Painel "Mapa & quadros" na barra.

### Site, downloads e atualização automática (0008)
- Web: Vite `base` vem de `VITE_BASE` (workflow `pages.yml`); PWA em modo **prompt** (nunca recarrega sozinho). `download.html` é a segunda
  página do build; `core/repo.ts` descobre o repositório (`VITE_GH_REPO` ou o endereço `dono.github.io/repo`) e classifica os arquivos da release.
- Desktop: plugins Tauri `updater` + `process` (só desktop; capability `desktop.json`), pacotes assinados (`createUpdaterArtifacts`),
  endpoint `.../releases/latest/download/latest.json` ajustado no CI por `scripts/set-repo.mjs`. A chave PÚBLICA está no `tauri.conf.json`;
  a privada nunca entra no git (`npm run updater:keys`).
- Android/DEB/RPM: `core/updater.ts` compara a versão com a última release e abre o download (`plugin-opener`). APK assinado no CI com a keystore dos secrets.
- `core/autosave.ts` (IndexedDB) restaura a sessão: é o que torna seguro atualizar/recarregar. Não substitui o arquivo `.hiraku`.

### Barras personalizáveis (0014)
> **0.9.1:** os "blocos" e as alças de 6 pontos foram substituídos por bloquinhos por ferramenta (ver "Barras de bloquinhos (0.9.1)").
> O texto abaixo é histórico.
- A barra de ferramentas é feita de **blocos** (`core/layout.ts`: ferramentas, formas, histórico, pincéis, cores, espessura, mapa, papel/ajustes).
  Cada bloco fica embaixo, na lateral esquerda/direita ou oculto; o padrão deixa embaixo só o essencial. O usuário escolhe em
  Configurações (engrenagem do canto superior direito, que NUNCA some). Layout salvo em localStorage (`hm-ideas-layout-v1`); `normalizeLayout`
  aceita qualquer JSON (versão futura/corrompido) e devolve um layout válido. Bloco novo = entrada em `BLOCKS` + `DEFAULT_LAYOUT` + JSX em `Toolbar.tsx`.
- Painéis (pincéis, cores…) abrem em cima da barra de baixo ou, se o botão está numa lateral (ou veio do botão direito), flutuam junto dele (`panel-float`).
  "Clicar fora fecha" vale para todas as áreas (`core/outside.ts`: `isInsideAny`).
- **Etapa 2 (feita):** cada bloco tem uma alça de 6 pontos (2 colunas × 3) que o arrasta (`components/BlockHandle.tsx`). Ele vira `"float"` com posição
  em pixels (`floats`), segue o ponteiro com ímã nas bordas e no centro (`snapPosition`: 24px, cola em barra vertical nas laterais e horizontal em cima/embaixo,
  respeita a barra de páginas aberta) e **nunca sai da tela** (`clampPosition`, reaplicado ao abrir e ao redimensionar a janela). A orientação só muda ao soltar
  (trocar no meio mudaria o tamanho e tremeria). Duplo clique na alça gira o bloco flutuante. Configurações: "Flutuante", "Girar" e "Travar posições"
  (esconde as alças). O gesto usa listeners na JANELA (o bloco troca de contêiner no meio do arraste e o React recria o botão). Layout subiu para `version: 2`;
  `normalizeLayout` aceita o formato 1. Alça é só para ponteiro; teclado/leitor de tela usam o menu de Configurações.

## Como rodar

```bash
npm install
npm run icons          # gera src-tauri/icons a partir de app-icon.png (1 vez)
npm run tauri dev      # desktop (Linux)
npm run dev            # só o front no navegador (PWA / debug rápido)
npm run typecheck
npm test               # Vitest: lógica pura (core/*, parsers) e fumaça dos painéis
```
Android: `npm run tauri android init` (1 vez) e depois `npm run tauri android dev`.
Requer Android Studio, SDK, NDK e `JAVA_HOME`/`ANDROID_HOME`/`NDK_HOME` configurados.

## Testes e verificação

- Antes de concluir qualquer tarefa: `npm run typecheck`, `npm test` e `npm run build` devem passar.
- Lógica pura (`core/*`, geometria, serialização, parsers) ganha testes com **Vitest** (`*.test.ts` ao lado do código;
  `vitest.config.ts` roda em Node, sem o PWA do Vite).
- Mudanças em input/render: descreva como testou (mouse, caneta, toque) e em qual plataforma.

## Uso do REA (engenharia reversa assistida)

O REA (https://github.com/morluto/rea) é um MCP para investigar binários/apps. Instalação: `npx rea-agents setup`
e reiniciar o agente. Regras para este projeto:

- **Excalidraw é MIT e open source:** NÃO use REA nele. Leia o código-fonte em
  https://github.com/excalidraw/excalidraw para entender o comportamento e reimplemente à nossa
  maneira (PixiJS). Se copiar trechos, preserve o aviso de licença MIT.
- **GoodNotes e outros apps proprietários:** NÃO decompilar/desmontar para copiar implementação.
  Implemente a partir do **comportamento observável**, da documentação/lista pública de funções
  e de padrões conhecidos (perfect-freehand, rough.js, pdf.js, etc.).
- Uso legítimo do REA aqui: analisar software **que o dono possui ou está autorizado a examinar**
  ou que é open source/permissivo, para aprender técnicas (ex.: como um app Electron organiza IPC),
  sempre citando a evidência e registrando a fonte em `docs/`.

## Bibliotecas candidatas (adicionar só quando a feature chegar)

`perfect-freehand` (traço), `roughjs` (estilo rascunho), `pdfjs-dist` (PDF), `mermaid`, `idb` (IndexedDB),
`vitest`. Para OCR/escrita→texto, avaliar modelos locais (ex.: ONNX/WASM) antes de APIs na nuvem.

## Convenções

- Commits pequenos, em pt-BR, no formato `tipo: resumo` (`feat:`, `fix:`, `refactor:`, `docs:`).
- Sem dependências novas sem justificar no PR/commit.
- Acessibilidade mínima: foco visível, `aria-label` em botões de ícone, respeitar `prefers-reduced-motion`.

## Entrega por patches (agentes que gerem mudanças para o dono)

O dono NÃO baixa zip a cada mudança. Ele aplica **patches** com `npm run patch` (`scripts/apply-patch.mjs`).

- Trabalhe em commits pequenos e coerentes, mensagem `tipo: resumo` em pt-BR. Um patch por assunto.
- Entregue com `git format-patch` (arquivos numerados `0001-….patch`), gerados SOBRE o último estado que o dono tem.
  Nunca reescreva histórico já entregue; correções viram patch novo.
- Mudou dependência? Edite `package.json`; o aplicador roda `npm install` sozinho. NÃO edite `package-lock.json` à mão.
- Mudou o modelo de dados? Suba a versão do `.hiraku` e migre em `core/serialize.ts` no mesmo patch.
- Ícones (`src-tauri/icons`) estão versionados; mudanças binárias entram no patch normalmente.
- O workflow `ci.yml` roda `typecheck` + `build` a cada push. Se o dono colar um erro de CI, responda com um patch de correção.
- Versão e publicação: `npm run release -- x.y.z` (tag `v*` dispara `release.yml`).

### Remodelagem visual, colar e re-encaixe das barras (0023)
- **Colar:** `components/clipboard.ts` é o único caminho (Ctrl+V, botão Inserir, arrastar-e-soltar). O Ctrl+V NÃO é interceptado no `keydown`
  (um `preventDefault` ali cancela o evento `paste` e o print nunca chegava); o ouvinte `paste` da janela decide: imagem > link > cópia interna
  (marcador `INTERNAL_MARK` gravado na área de transferência ao copiar) > texto. Imagens acima de 2048 px são reduzidas.
- **Barras:** além de arrastar, dá para juntar de volta: durante o arraste aparecem zonas de encaixe (esquerda/embaixo/direita) e soltar sobre outra
  barra encaixa antes/depois dela (`placeBlockAt`). Barra solta tem o botão "encaixar" (`homeBlock`). Bloco novo `insert` (Inserir). Layout segue `version: 2`.
- **Tema:** `core/theme.ts` (auto/claro/escuro + densidade), tokens CSS em `:root[data-theme]`. Configurações agora têm abas (`Settings.tsx`).
- **Topo:** esquerda = páginas + chip do caderno (abre o gerenciador, estado em `useUI.notebooksOpen`) + navegação; direita = zoom, Salvar, Abrir, ⋯, ⚙.
- Logo novo em `public/logo.svg` (sem metadados C2PA) e `public/icon.svg`; ícones regenerados.

### Incorporados: imagem, vídeo do YouTube e PDF (0.4.1 – 0.5.0)
- Tudo é `AttachmentElement` (`kind`: `image | link | file | video | pdf`), então seleção, mover, redimensionar, desfazer e salvar já funcionam.
  Formato `.hiraku` continua `version: 1` (campos novos são opcionais; `normalizeDoc` → `cleanAttachment` sanitiza: vídeo sem link válido vira `link`, PDF sem `data` vira `file`).
- **Imagem:** `render/imageTexture.ts` decodifica o data URL antes de virar textura (`Texture.from(dataURL)` no Pixi v8 é assíncrono e dava imagem branca).
  O renderer mostra um quadro "carregando" e troca pelo sprite quando a textura chega.
- **YouTube:** `core/embed.ts` (puro, testado) reconhece o link. O Pixi desenha só a miniatura + play; o player é um `<iframe>` em `components/EmbedLayer.tsx`
  (camada DOM sobre o canvas que acompanha a câmera). Um vídeo toca por vez (`core/embedView.ts`); fora da tela o iframe é desmontado. Sempre há "Abrir no navegador" (`core/openExternal.ts`).
- **PDF:** `render/pdfDoc.ts` carrega o pdf.js (build `legacy`, import dinâmico, fora do pacote principal) e rasteriza cada página em textura sob demanda (LRU de 14 páginas).
  Dois modos guardados no elemento (`mode`): **carrossel** (uma página; ‹ › / setas / PageUp-PageDown) e **rolagem** (páginas empilhadas com máscara; roda do mouse sobre o PDF selecionado).
  A página atual e a rolagem ficam em `useEmbedView` (NÃO entram no desfazer: virar página não é edição); só trocar o modo é um passo de desfazer.
  O PDF fica embutido no `.hiraku` como data URL (limite de 15 MB). PPTX não é lido: exporte para PDF.
- **Player (iframe) sem glitch:** o iframe é uma camada própria do compositor do WebView2. Por isso `EmbedLayer` (a) posiciona por `transform` e deixa o iframe com o tamanho
  do mundo + `scale(zoom)`; (b) esconde o iframe (`visibility`, o vídeo segue tocando) enquanto a câmera se move e enquanto o vídeo é arrastado/redimensionado: a miniatura do Pixi fica no lugar com o aviso "Reproduzindo" (sem isso o WebView2 deixa rastros do quadro anterior; testado, mover o iframe sempre visível piora); o player que toca NUNCA é desmontado ao sair da tela (só fica invisível);
  (c) liga `html.embed-live`, que zera `--shadow` (sombras grandes das barras viravam blocos pretos sobre o player); (d) só deixa o iframe receber o mouse com o vídeo
  selecionado (clicar num vídeo solto seleciona e permite arrastar; pan/zoom por cima dele funcionam).
- **(0.6)** O iframe agora tem o tamanho da TELA (sem `scale`; redimensiona só quando o zoom assenta) e só recebe o mouse no modo
  **"Controlar player"** (`useEmbedView.interact`), que sai sozinho ao tirar o mouse do vídeo, clicar fora ou Esc. Antes, com o vídeo
  selecionado, a roda/pinça ficavam presas no YouTube. Pausar/continuar usam a API do player (`enablejsapi=1`, `youtubeCommand`).
  Trocar de página ou apagar o vídeo encerra o player.

### Papel (0.6)
- `core/paper.ts` gera o padrão em espaço de tela (`drawPaperPattern` → linhas/pontos por camada: fina, forte, destaque). O Renderer e as
  miniaturas SVG (`PaperSwatch`) usam o mesmo gerador. 11 padrões (`PAPER_KINDS`), cor de fundo livre (`HsvField`), cor das linhas
  automática pelo brilho do fundo (`autoLineColor`) ou escolhida, espaçamento. `Page.paperScale` e `Page.lineColor` são opcionais.
  Arrastar a cor usa `previewPaper` + um único passo de desfazer.

### Barras "lego" (0.6)
- `Layout.group` (bloco → líder) forma **grupos flutuantes**: o líder guarda a posição em `floats`, os membros vão juntos na ordem de `order`.
  Funções puras em `core/layout.ts`: `leaderOf`, `groupMembers`, `floatLeaders`, `detachBlock` (o próximo herda a liderança), `joinGroup`,
  `mergeGroups`, `moveGroup`, `dockGroup`, `floatSide` (arranca a barra inteira de um lado), `homeGroup`, `snapToRects` (ímã entre barras).
- `components/BlockHandle.tsx`: um único gesto (`startDrag`) para bloco (6 pontos), grupo e barra lateral/de baixo (`BarHandle`, a pílula).
  Ao soltar: zona → encaixa o grupo; sobre bloco de outra barra (encaixada ou flutuante) → junta ali; senão flutua. A orientação só
  troca se o PONTEIRO estiver perto da borda (`snapPosition(..., { pointer })`). Layout segue `version: 2`.

### Camadas (0.6)
- `Page.layers` (de baixo para cima) e `layerId` nos elementos; `normalizeDoc` garante ≥ 1 camada; elemento sem camada (ou com camada
  inexistente) pertence à primeira (`layerIdOf`). Elementos novos recebem a camada ativa (`stamp` no store; `useLayerUI` guarda a ativa
  por página, fora do desfazer).
- Interação SEMPRE passa por `interactiveElements(page)` (camadas visíveis e destravadas; cacheado por página). Desenho usa todas;
  miniaturas e o player usam `visibleElements` (também cacheado — seletores do React exigem a mesma referência).
- Renderer: um contêiner por camada (`syncLayers`) com [quadros, resto]; `zIndex` = índice na página (trazer para frente/enviar para trás).
- `reorder` (frente/trás/um passo) e Ctrl+] / Ctrl+[ (Shift = extremos).

### Modelos prontos (0.6)
- `core/templates.ts`: cada modelo é um `build(measure?)` que devolve elementos nativos dentro de um quadro (`Builder`: box, text, label,
  line, connect com setas ligadas, open = quadro). `placeAt` centraliza. Mapas mentais entram na mesma lista (categoria `mapas`,
  `core/mapTemplates.ts`). Galeria: `components/TemplateGallery.tsx` (`GalleryShell`/`GalleryCard` reaproveitáveis).
- `components/ElementsPreview.tsx`: prévia SVG de qualquer lista de elementos com texto de verdade (galerias, exemplos, temas).

### Grafos e matemática (0.6)
- `core/expr.ts`: análise de expressões própria (sem `eval`): precedência, `^` à direita, `!`, multiplicação implícita, vírgula decimal,
  funções em pt/en. `compile` (função de x) e `calc` (calculadora) devolvem erros em português.
- `core/graph.ts`: `parseGraph` (A - B : 4, A -> B, CSV, lista de adjacência; nomes com hífen funcionam), `layoutGraph` (círculo, força
  determinística, camadas, árvore, grade), `buildGraphElements` (vértices = nós `ellipse` sem pai; arestas = setas ligadas com `label`),
  `graphFromElements` (lê do quadro) e algoritmos (BFS, DFS, Dijkstra, componentes, Kahn, Welsh–Powell, Kruskal, bipartição, graus).
- `core/figures.ts`: figura = `AttachmentElement` com `kind: "figure"` e `figure: FigureSpec` (sólido, gráfico, espaço 3D, reta numérica,
  círculo trigonométrico, transferidor), saneada em `cleanFigure`. Gera PRIMITIVAS em coordenadas locais; `Renderer.paintFigure` (Pixi,
  tracejado manual) e `render/figureSvg.ts` (SVG) desenham as mesmas. Sólidos: malha + faces de frente pela normal; arestas "suaves"
  (laterais de cilindro/cone) só aparecem no contorno; ocultas tracejadas.
- `LinearElement.label` (opcional): rótulo no meio da linha (o renderer passou a usar Container para linhas/setas).
- UI: `components/SciencePanel.tsx` (abas Grafos, Geometria, Funções, Calculadora). Controles deslizantes usam `previewElements` +
  `endPreview` (um passo de desfazer por gesto).

### Mapas mentais (0.6)
- Temas (`MAP_THEMES`, `applyMapTheme`), `numberBranches`, `sortChildren`, `balanceSides`, `toMarkdown` em `core/mindmap.ts`.
  Painel com prévias (temas, layout, ligações, formas) e modelos.

### Grafos passo a passo, GeoGebra e conteúdo rico (0.6)
- `core/graphAlgo.ts`: algoritmos como LISTA DE PASSOS (`Step`: atual, fronteira, concluídos, árvore, descartadas, rótulos,
  estrutura auxiliar, frase). `runAlgorithm` (BFS, DFS, Dijkstra, Prim, Kruskal, Kahn, pontes/articulações de Tarjan, percursos
  de árvore), `generate` (12 geradores com semente), `bstEdges`, `adjacencyMatrix`/`matrixToEdges`.
- `core/algoView.ts` (UI, fora do desfazer) + `components/AlgoPlayer.tsx` (barra flutuante): o passo vira um `AlgoOverlay` que o
  `Renderer.setAlgoOverlay` desenha numa camada própria acima dos elementos. Ver o algoritmo NUNCA muda o documento.
- Figuras novas: `revolution` (volume por discos/cascas), `surface` (z = f(x, y), pintor de trás para frente em `paintMesh`),
  `vectors` (soma, projeção, ângulo, transformação 2×2), `points` (fecho convexo, Delaunay, par mais próximo, círculo mínimo) e
  áreas entre curvas no `plot` (`areas`). `clipPrims` recorta à caixa. Matemática pura em `core/linalg.ts` e `core/compgeo.ts`.
- Nós de mapa: `note` (linhas "- [ ]" = tarefas → progresso automático), `link`, `tags`, `progress`, `due`, `image`/`imageRatio`,
  forma `card`. `nodeLayout` (puro) posiciona tudo e dá o tamanho; `render/mindDraw.ts` desenha num 5º filho (`extras`).
- `core/recognize.ts` (traço → linha/retângulo/elipse/losango/polígono), ferramenta `laser` (camada de tela que se apaga sozinha),
  `Layer.blend` (normal/multiplicar/tela/somar).

### Tela inicial e aparência (0.6)
- `components/NotebookManager.tsx` virou a **Home** (`useUI.notebooksOpen`): capas com a primeira página, criar com papel, favoritos,
  ordenação, cores de capa, importar. Abre ao iniciar (`hm-ideas:start-home`, desligável).
- `core/theme.ts`: temas (`THEMES`, CSS em `:root[data-theme]`), cor de destaque (`ACCENTS` → `--accent`, `--accent-2`, `--accent-strong`,
  `--accent-soft` em estilo inline do `<html>`), densidade, alças discretas (`data-grips`) e modo foco (`html.focus-mode`, Ctrl+.).

### Blocos nativos (0.7)
- (0.8: `core/blocks.ts` virou a pasta `core/blocks/` — ver "Blocks Update" abaixo.)
- Bloco = `AttachmentElement` com `kind: "block"` e `block: BlockSpec` (`core/blocks/`, puro; saneado em `cleanBlock`). Cada tipo tem DADOS
  próprios (post-it: texto+cor; tarefas: itens com `done`; tabela: `rows`; linha do tempo: marcos; kanban: colunas…). `.hiraku` segue `version: 1`.
- `blockPrims(spec, w, h, measure)` gera retângulos/linhas/círculos/textos em coordenadas locais + `hits` (áreas clicáveis: caixinha da tarefa).
  `render/blockDraw.ts` desenha as MESMAS primitivas no Pixi (`paintBlock`) e em SVG (`blockSvg`, prévias/miniaturas); a medida de texto é o
  canvas 2D (`canvasMeasure`), então a quebra de linha bate. Post-it encolhe a fonte até caber; cartão/tarefas/destaque crescem (`fitBlock`).
- Comportamento: toque na caixinha → `blockTap` (um passo de desfazer); duplo toque, Enter ou "Editar" → `components/BlockEditor.tsx`
  (`useBlockEdit`), que edita AO VIVO com `previewElements` e grava um único passo ao fechar. Setas ligam blocos (`isBindable` inclui blocos).
- Modelos (`core/templates.ts`) são CONJUNTOS de blocos (`Builder.block`, `Builder.fit` ajusta o quadro ao conteúdo); diagramas seguem com
  formas + setas ligadas. A aba "Blocos avulsos" da galeria e o painel Inserir criam um bloco por vez.

### Ferramentas de grafo (0.7)
- `core/graphEdit.ts`: ferramenta **Vértice** (N; toque no vazio cria A, B, C…; arrastar de um vértice liga/cria vizinho) e **Aresta** (G; arraste
  de vértice a vértice, soltar no vazio cria vértice). Opções em `useGraphTool` (direcionada, ponderada). `NodeElement.vertex` marca vértices
  (não viram filhos de mapa ao serem soltos sobre outro nó). Tab no vértice selecionado → `connectedVertex` (direção mais livre, `freeSpotNear`).
- Peso/rótulo: `components/EdgeLabelEditor.tsx` (`useEdgeLabel`) — abre ao criar aresta ponderada, com duplo toque numa seta ou Enter com ela
  selecionada. Apagar vértice apaga as arestas dele (`incidentEdges` em `deleteSelection`). Os algoritmos leem tudo por `graphFromElements`.

### Blocks Update (0.8)
- **Registro** (`core/blocks/`): `types.ts` (união `BlockSpec` com os dados de cada tipo), `kit.ts` (primitivas, `wrap`, cores, saneamento,
  `getAt/setAt` por caminho "items.2.text"), `def.ts` (`BlockDef`: `make`, `size`, `clean`, `draw`, `minH`, `tap`, `fields`, `split`, `form`,
  `text`, `toContent`/`fromContent`, `resize`), `defs/*.ts` (um arquivo por família) e `index.ts` (API: `blockPrims`, `cleanBlock`, `fitBlock`,
  `convertBlock`, `blockFields`, `splitField`, `removeFieldItem`…). **Novo tipo = um objeto `defineBlock({...})` em `defs/` + entrada em `ALL`.**
  O `.hiraku` segue `version: 1` (tipos novos são aditivos; tipo desconhecido vira arquivo em `cleanAttachment`).
- **Comportamentos** são `hits` (áreas com `action`) + `tap`: marcar tarefa, virar flashcard, escolher alternativa, estrelas, hábito, −/+ da meta,
  dia do calendário, status do projeto, ícone do destaque, "Abrir página". O renderer só desenha; `selectTool` aplica o toque (1 passo de desfazer).
- **Edição no bloco**: `fields()` devolve retângulos com fonte/cor/fundo; duplo toque num campo abre `components/BlockInlineEditor.tsx`
  (input/textarea do sistema sobre o canvas, acompanhando câmera e giro). Enter em item de lista chama `split` (novo item), Backspace em item
  vazio remove (`removeFieldItem`, só listas de tamanho livre), Tab percorre os campos. Ao vivo via `previewElements`, 1 passo ao sair.
- **Editor flutuante** (`BlockEditor.tsx`) é gerado do `form` de cada tipo; "Transformar em…" usa `toContent`/`fromContent` (conteúdo neutro:
  título, texto, itens com feito/sub) — `blockActions.ts`: `transformBlock`, `blockToMap` (bloco → mapa mental), `nodeToBlock`.
- **Biblioteca** (`core/blocks/library.ts` + `components/BlockGallery.tsx`, tecla B): presets (tipo + campos + tamanho) por categoria, busca
  sem acento, arrastar para o quadro (`LIB_MIME` em `clipboard.ts`) e abas de ferramentas (mapas, conexões, mídia, desenho).
- Desenho: `render/blockDraw.ts` (medida de texto + SVG, SEM Pixi — usado em Node/testes) e `render/blockPaint.ts` (Pixi). Primitivas aceitam
  `dash`, `fill` em polilinhas (pizza, fita), `italic`, `angle` e `tilt` do bloco inteiro (adesivos).
- **Página** (`kind: "page"`): `md` + `pages` (subpáginas `{id,parentId,title,icon,md}`). `core/pageMd.ts` lê/escreve o MESMO Markdown das
  Páginas do Hiraku Comic Manager (títulos, listas, tarefas, toggles `<details>`, callouts `> [!tip]`, código, `$$`, tabelas, `<!--sheet-->`,
  `[toc]`, `---`, imagens, `▤ [[np:id]]`) e calcula a planilha sem `eval` (`sheetEval`). `core/pageTree.ts`: árvore, mover sem ciclo, apagar com
  filhas, exportar tudo em toggles. UI: `components/PageEditor.tsx` (modal; desliga os atalhos do quadro) + `components/page/PageBlocks.ts`
  (editor contenteditable em TS puro, sem globais: `/`, `@`, barra de formatação, menu do bloco, arrastar, colar Markdown/imagem).
  Soltar um `.md` no quadro cria uma Página. Interop com o Manager = copiar/colar/exportar/importar Markdown.
- **Cadernos com páginas**: `Page.size` (`core/pageSize.ts`: A4, carta, A5, 16:9, quadrado). Renderer desenha mesa + folha (`sheetLayer`),
  mascara padrão e elementos na folha; `pageView.ts` enquadra (`fitSheet`), prende (`clampToSheet`) e vira a página rolando (`wheelFlip`).
  Formato na Home (ao criar) e no painel Papel (todas as páginas); `addPage` herda formato e papel.
- **Conexão rápida** (`core/quickConnect.ts` + `selectTool` gesto `connect`): pontos nas bordas do item selecionado (e/s/w; blocos também n) ou
  sob o mouse (4 lados). Soltar sobre item liga; no vazio (ou toque) cria irmão do mesmo tipo ligado e abre o texto dele.
- **Laser**: ferramentas `laser` (Z, ponteiro em tela com rastro 0–2 s; segue o mouse pelo `hover`) e `laserpen` (Shift+Z, traços no mundo que
  somem juntos após `laserHold`). Opções em `useTool` (`laserColor`, `laserTrail`, `laserHold`, persistidas). Nunca entram no documento.

### Docking Update (0.9)
- **Atalhos**: `components/commands.ts` é o registro ÚNICO de ações (id, nome, categoria, teclas padrão, `scope`, `when`, `run`).
  Teclado (`handleKey`, o único `keydown` global do app), menus, paleta (Ctrl+K), barra contextual, dicas (`withKey`) e o editor
  de atalhos leem dele. `core/keymap.ts` (puro) normaliza teclas pela POSIÇÃO física (`code`: Shift+1 é "Shift+1"), guarda só as
  sobreposições do usuário (`hm-ideas:keymap-v1`) e acusa conflito apenas no MESMO contexto (`scope`: vertex > line > node > group >
  selection > global; o mais específico responde primeiro). **Ação nova = um item no registro**, nunca um `if` no teclado.
  Ctrl+V continua com o evento `paste` (comando `fixed`). Teclas de sistema operacional/navegador evitadas nos padrões.
- **Grupos** (`core/groups.ts`, puro): `Page.groups` = estrutura (id, nome, `parentId`, `locked`, `hidden`); elemento aponta para o
  grupo mais interno por `groupId`. A ordem de empilhamento continua sendo `page.elements` (agrupar junta os membros). `prune` tira
  grupos vazios/ciclos (roda no `normalizeDoc`). O **contexto** (grupo aberto por duplo clique; Esc/clicar fora sai um nível) é UI:
  `useGroupCtx` em `core/groupActions.ts`. No contexto, um clique pega a unidade logo abaixo dele (`unitOf`/`idsForHit`); Ctrl+A,
  caixa e laço só pegam o que está dentro. A seleção continua sendo lista de ids de elementos: mover/girar/duplicar não mudaram.
  Duplicar/colar recriam grupos copiados inteiros (`cloneGroups` via `addCopies`). Campos novos opcionais em TODO elemento
  (`ElementMeta`): `groupId`, `locked`, `invisible` (≠ `NodeElement.hidden`, que é do mapa) e `name`. `.hiraku` segue `version: 1`.
  Travados/ocultos saem de `interactiveElements`; ocultos não são desenhados (`hiddenIds` → `Renderer.syncPage`).
- **Seleção**: caixa da esquerda p/ direita = só o que está dentro; da direita p/ esquerda = o que toca (verde, tracejada) —
  `useTool.boxMode`. Alt ao começar a arrastar = arrasta uma cópia. Guias inteligentes e grade: `core/align.ts#snapMove`
  (bordas, centros, espaço igual; Ctrl segurado desliga), desenhadas pelo renderer (`SelectionUI.guides`, `context`).
- **Alinhar** (`core/align.ts` puro + `core/alignActions.ts`): grupos contam como um objeto; com um só, alinha à folha/área visível.
- **Janelas** (`core/docking.ts`, puro): 4 áreas (pilhas de abas com peso, largura/altura, recolher em ícones) + janelas
  flutuantes + `last` (fechar e reabrir no mesmo lugar). `dropPanels` é a única operação de mover (aba, dividir, borda, flutuar).
  UI em `components/DockHost.tsx` (`WindowChrome`): indicadores de encaixe por `targetAt`, divisórias, `clampFloats` ao abrir/
  redimensionar. As medidas viram variáveis CSS no `<body>` (`--insetT/B/L/R`, `--chromeT`, `--statusH`…): todo elemento fixo
  antigo se afasta delas — **elemento fixo novo deve usar essas variáveis**. Painel novo = id em `PANELS` + caso em `PanelView`
  + ícone em `PANEL_ICON` (os painéis antigos com `.panel` perdem a moldura dentro do encaixe pelo CSS).
- **Áreas de trabalho** (`core/workspace.ts`): dock + barras "lego" (`useLayout`) + `Chrome` (menu, opções, status, pílulas).
  7 prontas (Geral, Desenho, Mapas mentais, Escrita, Estudos, Organização, Minimalista = visual clássico); alterações são salvas na
  área ativa; "Restaurar" volta ao padrão; criar/duplicar/renomear/excluir/importar/exportar. Tela estreita começa na Minimalista.
  Trocar de área nunca toca no documento.
- **Barras**: `MenuBar` (itens = ids de comando), `OptionsBar`/`ToolOptions` (mesma lógica no painel Propriedades, modo
  "bar"/"panel"), `StatusBar`, `ContextBar` (um objeto / vários / grupo; some durante arraste via `useUI.busy`), `ToolGroup`
  (ferramentas agrupadas: segurar, botão direito ou seta ↓ abre o flyout; lembra a última por grupo).
- **Texto**: 12 fontes embutidas (`src/fonts.ts`, @fontsource, subconjunto latin) + as do sistema; `TextElement` ganhou `bold`,
  `italic`, `underline`, `strike`, `lineHeight`, `letterSpacing`, `bg` (opcionais). `measureBlock(text, family, size, fx)`.
  `loadFonts()` + `Renderer.repaintText()` redesenham quando as fontes chegam. `TextBar`/`TextPanelBody` (components/TextControls)
  valem para o texto em edição, a seleção e o padrão dos próximos.

### Barras de bloquinhos (0.9.1)
- `core/layout.ts` (`version: 3`): cada ferramenta/botão é um **item** (`ITEMS`); itens ficam em **barras** (`Bar`: `items`, `dock` =
  esquerda/direita/embaixo ou `null` = solta em `x/y`, `vertical`). Barras do mesmo lado ficam lado a lado na ordem da lista.
  `moveItems` (um item: para dentro de uma barra num índice, para uma borda = barra nova encaixada, ou solto = barra nova
  flutuante) e `moveBar` (barra inteira; soltar sobre outra funde). Barra que fica vazia some. Numa barra solta de um item só,
  soltar em cima/embaixo forma coluna e dos lados forma linha (`vertical` do alvo). `normalizeLayout` migra o formato 2 (blocos)
  e aceita lixo. Item novo = entrada em `ITEMS` + JSX no `items` do `Toolbar.tsx` (+ onde entra nos padrões/áreas de trabalho).
- Gesto sem alças (`components/BarDrag.tsx`): pressionar um item e passar de 6 px (mouse) / 12 px (caneta/dedo) arrasta; o clique
  seguinte é engolido. Pressionar o espaço da barra arrasta a barra. `dropTargetAt` acha barra próxima (38 px) → borda (56 px) →
  solto. Cópia fantasma segue o ponteiro; `.ins-mark` mostra onde entra; `.dropzones` acendem a borda. Travar = nada se arrasta.
- Opções contextuais saíram das barras: o item **Opções da ferramenta** abre `PropsPanel` (mesmo conteúdo do painel Propriedades).
  **Blocos** (biblioteca) e **Imagem e arquivos** (colar, arquivo, vídeo/link) são itens separados.
- Grafos: vértices nomeados 1, 2, 3… (`nextVertexName`, geradores e matriz); `nodeLayout` mantém vértice redondo/cápsula;
  `LabelEditor` redondo e centralizado; Selecionar + Shift+arrastar de um vértice = aresta dirigida, Ctrl+Shift = não dirigida
  (gesto `gedge` em `selectTool`; Shift+clique sem arrastar continua somando à seleção).

### Ferramentas (0.10)
- `core/toolKit.ts` (localStorage `hm-ideas:toolkit-v1`): presets (`snapshot` guarda só as chaves da FAMÍLIA da ferramenta — `KEYS`),
  favoritas e recentes como **ids de comando** (`tool.pen`, `brush.marker`, `preset.<id>`, `macro.<id>`), registro de comandos
  (`noteCommand`, chamado por `runCommand` e `handleKey`), histórico de AJUSTES (`initToolKit` observa o `useTool`; rajadas de mudança
  viram um passo após 900 ms) e macros (gravar = registrar comandos; `runMacro` repete pulando o que não se aplica).
  Presets e macros viram comandos dinâmicos (o cache de `allCommands` usa a assinatura de pincéis + presets + macros).
- Ferramenta temporária (`commands.ts`): segurar a tecla de uma ferramenta ≥ 350 ms e soltar volta à anterior (`hold`); Ctrl
  segurado sozinho 220 ms com ferramenta de desenho = Selecionar; Alt = conta-gotas (`handleModifierDown`/`handleKeyUp`; `blur` solta).
- Busca: `core/search.ts` (sem acento, sem palavras vazias, plural→singular, metade das palavras basta) + `keywords` nos comandos
  (`KEYWORDS`). A paleta mostra recentes + sugestões pelo contexto quando vazia e blocos da biblioteca nos resultados.
- UI: `components/QuickPanel.tsx` (painel "Acesso rápido" e item da barra).

### Cadernos (0.11)
- `core/notebook.ts` (puro): `reorderPages`, `rotatePage` (só folhas de tamanho fixo: troca w/h), índice (`pageHeadings`: textos com
  fonte ≥ 22 ou negrito ≥ 18, quadros, raízes de mapa; `buildIndex`/`filterIndex`), modelos de página (`pageToTemplate`/`pageFromTemplate`
  recriam ids de elementos, camadas e grupos), pastas/capas da Home (`Folder`, `Cover`, `coverCss`, `cleanCover`/`cleanFolders`).
- `Page.bookmark` (#hex) e `Page.starred` são opcionais (saneados em `normalizeDoc`; `.hiraku` segue `version: 1`). Store: `reorderPage`,
  `rotatePage`, `setPageMeta`, `insertPage` (todos desfazíveis).
- Papéis novos: `cornell`, `header`, `calligraphy` (`HEADER_Y`, `CUE_X`; o resumo do Cornell usa `PaperOpts.sheetH`, passado pelo Renderer).
  A prévia (`paperSvgPaths`) desses mostra o canto de cima da folha.
- Modelos de página do usuário: `core/pageTemplateStore.ts` (localStorage `hm-ideas:page-templates-v1`, até 60; falta de espaço vira aviso).
  Aparecem no menu ⋯ da barra de páginas e na linha "Novo caderno" da Home.
- Barra lateral (`components/Pages.tsx`): abas Páginas/Índice; arrastar a miniatura reordena (mouse: 6 px; caneta/dedo: segurar 300 ms,
  senão a lista rola); menu ⋯ (renomear, subir/descer, girar, favoritar, marcador, modelos); `goToElement` centraliza um título do índice.
- Home: pastas em localStorage (`hm-ideas:folders-v1`); o caderno guarda `folder` e `cover` no registro do IndexedDB (não no documento).
  Arrastar um cartão (HTML5 drag, mouse) para a pasta move; no toque use ⋯ → Mover para.

### Escrita à mão (0.12)
- `core/handwriting.ts` (puro): categorias (`categoryOf`: tinta, marca-texto, formas, texto, mapas, mídia), `passes`/`filterIds`,
  rabisco (`isScribble`: vai-e-vem ao longo do eixo PRINCIPAL do traço — ≥ 5 inversões com histerese de 18%, caminho ≥ 3,2× a extensão;
  zigue-zague que avança não conta) e `scribbleTargets` (≥ 2 amostras tocando; nós/quadros/travados ficam), janela de zoom
  (`advanceTarget`, `newLine`, `padToWorld`).
- `useTool`: `selectFilter` (laço e caixa em `selectTool`), `eraserFilter` (traço inteiro e pixel em `CanvasView.eraseTo`), `holdShape`,
  `scribbleErase`, `tapeColor`/`tapePattern` (persistidos).
- Segurar parado 600 ms no fim do traço (`armHold` em `CanvasView`) mostra a forma reconhecida como prévia; soltar grava a forma.
- **Fita**: bloco `tape` (`core/blocks/defs/study.ts`; `revealed`, `label`, `pattern`) — toque com Selecionar alterna. Ferramenta `tape` (U)
  arrasta uma caixa (clique = 220×40). `cleanAttachment` deixa a fita ser fina (mín. 12×8). `setAllTapes` (comandos revelar/esconder todas).
- **Janela de zoom** (`components/ZoomWriter.tsx`, Ctrl+Alt+W): faixa embaixo, caixa-alvo realçada no quadro (`.zw-target`), traço gravado
  com o pincel atual; passou de 80% da faixa, a caixa anda (`auto`); ↵ muda de linha para a margem marcada.
- **Canetas favoritas**: `FavPen` em `core/toolKit.ts` (`pens`, `addFavPen`, `applyFavPen`, `activeFavPen`); UI `components/FavPens.tsx`
  (item de barra `pens` + opções da caneta).
