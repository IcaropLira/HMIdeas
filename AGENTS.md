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
