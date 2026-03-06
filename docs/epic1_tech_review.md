# 🏛️ Revisão Técnica — Epic 1: Remediação de Dívida Técnica

**Autora:** Aria (Architect) | **Data:** 2026-03-05 | **Fonte:** PRD Brownfield v2.0  
**Escopo:** Revisão técnica das Stories 1.1 a 1.4 do Epic 1

---

## 1. Resumo Executivo

O Epic 1 propõe decompor 4 arquivos monolíticos (~1MB total de código-fonte) em módulos menores. A intenção é correta e o diagnóstico do PRD sobre a dívida técnica é preciso. Porém, **identifiquei uma restrição arquitetural crítica** no pipeline de build que impacta diretamente a viabilidade da estratégia de decomposição proposta.

> [!CAUTION]
> **Restrição IIFE:** Os content scripts (`whatsapp-ui-overlay.ts`, `whatsapp-page-script.ts`, `whatsapp-injector.ts`) são compilados individualmente como **IIFE** (Immediately Invoked Function Expression) via `build-content.cjs`. Cada script gera um único arquivo `.js` autocontido. Isso significa que **módulos ES (`import`/`export`) entre arquivos separados não funcionam em runtime** — eles serão inlined pelo bundler durante o build. A decomposição é viável, mas o mecanismo de modularização é diferente do que o PRD implica.

---

## 2. Análise por Arquivo

### 2.1 `whatsapp-ui-overlay.ts` — 619KB / 15.701 linhas / 309 métodos

| Aspecto | Detalhe |
|---------|---------|
| **Classe** | `WhatsAppUIOverlay` — God Class com 309 métodos |
| **World** | `MAIN` (injetado via `<script>`, tem acesso ao DOM do WhatsApp) |
| **Build** | IIFE individual via `build-content.cjs` |
| **Dependências** | Apenas `sortablejs` (import no topo) |

**Domínios identificados (por faixas de linhas):**

| Domínio | Linhas aprox. | Métodos | Percentual |
|---------|:----------:|:-------:|:----------:|
| Messaging (send, delay, status) | 1–2100 | ~35 | 13% |
| Script Execution (execute, pause, status) | 2100–2840 | ~20 | 5% |
| Header & Popups (UI chrome) | 2840–3700 | ~15 | 6% |
| Schedules (CRUD, popup, global) | 3700–6250 | ~40 | 16% |
| Notes (CRUD, editor modal, rich text) | 4420–5710 | ~25 | 8% |
| Signatures (CRUD, form modal) | 7980–8820 | ~12 | 5% |
| Executions Popup (unified scripts/msgs) | 8820–9340 | ~15 | 3% |
| Header/Auth/Settings | 9340–10280 | ~20 | 6% |
| **Kanban Board** (board, cards, drag-drop, columns, realtime) | 10280–15700 | ~80 | **35%** |
| Utility & Setup (init, data load, comms) | diversos | ~47 | 3% |

> [!IMPORTANT]
> **O Kanban é o maior domínio** (~35% do arquivo, ~5.500 linhas). Decompor este domínio sozinho já justifica a refatoração inteira.

**Parecer sobre Story 1.1:**
- ✅ A decomposição é **tecnicamente viável** via Vite/Rollup bundling — os módulos serão inlined no output IIFE final
- ⚠️ O objetivo de **"200 linhas por módulo"** é **irrealista** para domínios como Kanban (~5.500 linhas) e Notes (~1.300 linhas com editor rich text). Recomendo **500 linhas como limite soft**, aceitando até 800 para módulos com UI complexa (Kanban board rendering)
- ⚠️ A `WhatsAppUIOverlay` acumula ~100 campos privados compartilhados entre domínios (ex: `this.kanbanOverlay`, `this.scheduleButton`, `this.notesPopup`). A decomposição exige um **padrão de acesso a estado compartilhado** — sugestão: manter a classe principal como "orquestradora" slim que delega para módulos de domínio via composição
- ✅ O barrel export (`index.ts`) sugerido no PRD faz sentido para organização, mas o output final será um único arquivo IIFE

**Proposta de estrutura revisada:**

```
src/content/
├── overlay/
│   ├── index.ts                  # Entry point (slim orchestrator ~100 lines)
│   ├── types.ts                  # Interfaces compartilhadas
│   ├── state.ts                  # Estado compartilhado (refs DOM, flags)
│   ├── modules/
│   │   ├── messaging.ts          # Envio de mensagens + delay + status (~400 lines)
│   │   ├── script-execution.ts   # Execução de scripts + status popup (~300 lines)
│   │   ├── schedules.ts          # CRUD + popups de agendamentos (~600 lines)
│   │   ├── notes.ts              # CRUD + editor modal + rich text (~700 lines)
│   │   ├── signatures.ts         # CRUD + form modal (~500 lines)
│   │   ├── header.ts             # Header customizado + popups (~500 lines)
│   │   ├── notifications.ts      # Dropdown de notificações (~250 lines)
│   │   └── kanban/
│   │       ├── index.ts          # Kanban orchestrator
│   │       ├── board.ts          # Board rendering + layout (~800 lines)
│   │       ├── cards.ts          # Card rendering + badges (~500 lines)
│   │       ├── drag-drop.ts      # Sortable integration (~300 lines)
│   │       ├── realtime.ts       # Realtime listeners (~600 lines)
│   │       ├── move-column.ts    # Move-to-column popup (~400 lines)
│   │       └── column-mgmt.ts    # Column CRUD + modal (~500 lines)
│   └── utils/
│       ├── dom.ts                # Helpers DOM compartilhados
│       ├── comms.ts              # requestFromContentScript, event dispatch
│       └── formatters.ts         # escapeHtml, formatTime, etc.
└── whatsapp-ui-overlay.ts        # Import de overlay/index.ts + instanciação
```

---

### 2.2 `whatsapp-page-script.ts` — 200KB / 4.735 linhas / 230 funções

| Aspecto | Detalhe |
|---------|---------|
| **Estrutura** | IIFE anônima — **não é uma classe** |
| **World** | `MAIN` (acesso a `window.Store`, WhatsApp internals) |
| **Build** | IIFE individual |
| **Dependências** | Nenhuma (autossuficiente, usa APIs do WhatsApp) |

**Domínios identificados:**

| Domínio | Funções | Descrição |
|---------|:-------:|-----------|
| Chat Identity | ~25 | `sanitizeScopedChatId`, `normalizeChatIdWithDomain`, `buildChatIdVariants` |
| Photo Resolution | ~20 | `probeChatPhotoUrl`, `classifyChatPhotoStability`, `fetchWppProfilePhotoByIds` |
| Store API Access | ~15 | Wrappers para `window.Store.*`, `getContactModel` |
| Message Sending | ~20 | `sendTextMessage`, `sendAudio`, `sendImage` (via CustomEvents) |
| Event Handlers | ~30 | Listeners de CustomEvents do `whatsapp-injector` |
| Kanban Data | ~25 | `getChatInfo`, `getBulkChatInfo`, `resolveLidToPhoneVariant` |
| Trigger System | ~15 | Message observers, keyword matching |
| Utilities | ~20 | Debug panel, logging, normalization |

**Parecer sobre Story 1.2 (parte page-script):**
- ✅ Viável — funções top-level dentro de IIFE são fáceis de extrair para módulos separados
- ⚠️ O IIFE precisa manter a mesma closure global — módulos devem ser importados no topo e suas funções referenciadas internamente
- ⚠️ **Variáveis de estado compartilhadas** no escopo da IIFE (ex: `activePhotoProbeCount`, `inFlightPhotoProbes`, `photoProbeWaitQueue`) precisam ser encapsuladas em objetos de estado
- ✅ Decomposição natural em: `chat-identity.ts`, `photo-resolution.ts`, `store-api.ts`, `messaging.ts`, `event-handlers.ts`, `triggers.ts`

---

### 2.3 `whatsapp-injector.ts` — 137KB / 3.323 linhas / 69 métodos

| Aspecto | Detalhe |
|---------|---------|
| **Classes** | `ScriptExecutor` (L41–482) + `WhatsAppInjector` (L484–3280) |
| **World** | `ISOLATED` (content script nativo Chrome, chrome.runtime access) |
| **Build** | IIFE individual |
| **Dependências** | Nenhuma importada, usa `chrome.runtime.*` |

**Domínios identificados:**

| Domínio | Linhas | Descrição |
|---------|:------:|-----------|
| `ScriptExecutor` | 41–482 | Execução de scripts sequenciais — **já isolado como classe!** |
| Chat Identity | 505–600 | `normalizeChatIdentifier`, `buildChatIdVariants` (duplicado com page-script!) |
| Photo Resolution | 600–900 | `refreshLeadPhotoFromChat`, `isRenderablePhotoUrl` (duplicado!) |
| Instance/Scope | 900–1050 | Multi-instância, `getCurrentInstanceId` |
| **`init()` mega-handler** | 1048–1994 | **946 linhas!** — handler de chrome.runtime.onMessage |
| Media | 1996–2058 | `restoreTempMediaData` |
| Script Injection | 2060–2216 | `injectScripts`, `injectUIOverlay`, `injectFAB` |
| Message Sending | 2278–2840 | `handleAction`, `sendTextMessage`, `sendAudio`, `sendImage`, `sendVideo`, `sendFile` |
| Script Steps | 2843–3064 | `executeScriptWithSteps` |
| Chat Info | 3066–3250 | `getActiveChat`, `getChatInfo`, `getAllLabels` |

> [!WARNING]
> **`WhatsAppInjector.init()` tem 946 linhas** — é um switch/case gigante para message handling. Este é o principal candidato para decomposição neste arquivo.

**Parecer sobre Story 1.2 (parte injector):**
- ✅ `ScriptExecutor` já é uma classe separada — pode virar arquivo próprio trivialmente
- ✅ A separação é natural: `script-executor.ts`, `message-handlers.ts`, `media.ts`, `injection.ts`, `chat-info.ts`
- ⚠️ **Código duplicado** entre `whatsapp-injector.ts` e `whatsapp-page-script.ts`: Chat Identity + Photo Resolution (~600 linhas duplicadas). Recomendo criar `shared/chat-identity.ts` e `shared/photo-resolution.ts` importados por ambos
- ⚠️ O `init()` precisa ser decomposto em handlers registrados por domínio (ex: `registerMessageHandlers()`, `registerKanbanHandlers()`)

---

### 2.4 `db.ts` — 71KB / 2.114 linhas / 89 métodos

| Aspecto | Detalhe |
|---------|---------|
| **Classe** | `DatabaseService` — singleton exportado como `db` |
| **Contexto** | Usado em service worker (`background/`) e popup |
| **Build** | Bundled normalmente (não é content script IIFE) |
| **Dependências** | `idb`, types, sync-service, utils |

**Domínios já organizados por comentários no código:**

| Domínio | Linhas | Métodos |
|---------|:------:|:-------:|
| Schema + Init + Migrations | 89–209 | 3 |
| Lead Normalization/Merge | 211–649 | ~15 |
| Defaults | 651–665 | 1 |
| Messages CRUD | 669–950 | 6 |
| Scripts CRUD | 952–985 | 4 |
| Triggers CRUD | 987–1011 | 5 |
| Tags CRUD | 1013–1052 | 4 |
| Folders CRUD | 1054–1095 | 4 |
| Settings | 1097–1124 | 2 |
| Signatures | 1126–1208 | 6 |
| Schedules | 1210–1315 | 8 |
| Notes | 1317–1430 | 6 |
| Kanban Columns | 1430–1750 | ~10 |
| Kanban Leads | 1750–2110 | ~20 |

**Parecer sobre Story 1.3:**
- ✅ **Mais fácil dos 4 arquivos** — já organizado por seções com comentários claros
- ✅ Não tem restrição IIFE — pode usar imports/exports ES normais
- ✅ Estratégia: manter `db.ts` com schema, init e migrations; extrair stores por domínio
- ⚠️ Dependência do `syncService` — precisa ser injetável ou importada em cada store
- ⚠️ Lead Normalization/Merge (~430 linhas) é complexo e crosscutting — recomendo mantê-lo em `lead-utils.ts` ao invés de espalhá-lo por stores

---

## 3. Riscos Técnicos Identificados

| # | Risco | Severidade | Status no PRD | Parecer |
|:-:|-------|:----------:|:-------------:|---------|
| R1 | **IIFE impede ES imports cross-file em runtime** | ALTA | ❌ Não mencionado | O Vite/Rollup **inline os imports** no build, então a decomposição funciona no source, mas o output continua monolítico. Isso é OK para organização, mas **testes unitários ficam complexos** (precisam mockar o bundling) |
| R2 | Estado compartilhado na `WhatsAppUIOverlay` | ALTA | ❌ Não mencionado | ~100 campos privados compartilhados entre domínios exigem padrão de estado compartilhado |
| R3 | `WhatsAppInjector.init()` de 946 linhas | ALTA | Parcial (FR3) | PRD menciona decomposição mas não aborda o mega-handler |
| R4 | Código duplicado entre injector e page-script | MÉDIA | ❌ Não mencionado | ~600 linhas de Chat Identity + Photo Resolution duplicadas |
| R5 | Limite de 200 linhas por módulo | BAIXA | FR1 | Irrealista para domínios complexos — propor 500 linhas como soft limit |
| R6 | Testes unitários em IIFE context | MÉDIA | FR5 | Vitest não executa IIFE nativamente — testes precisam importar módulos individuais antes do bundling |

---

## 4. Revisão das Stories

### Story 1.1 — Decomposição do `whatsapp-ui-overlay.ts`

| Critério de Aceitação | Parecer |
|----------------------|---------|
| CA1: Módulos kanban/, notes/, schedules/, tags/, ui-components/ | ✅ Viável, mas adicionar: messaging/, signatures/, header/, kanban/submodules |
| CA2: Máximo 200 linhas por módulo | ⚠️ **Revisar para 500 linhas (soft) / 800 linhas (hard)** |
| CA3: Funcionalidades existentes continuam | ✅ Garantido se manter output IIFE único |
| CA4: Barrel exports (index.ts) | ✅ Funciona para organização, Vite inline tudo |

**IVs adicionais necessários:**
- IV5: Estado compartilhado (refs DOM) acessível por todos os módulos sem circular dependencies
- IV6: Bundle size do IIFE output não aumenta mais que 5% (tree-shaking limitado em IIFE)

---

### Story 1.2 — Decomposição do `whatsapp-page-script.ts` e `whatsapp-injector.ts`

| Critério de Aceitação | Parecer |
|----------------------|---------|
| CA1: page-script em messaging, media, store-access, event-handlers | ✅ Viável + adicionar chat-identity, photo-resolution, triggers |
| CA2: injector em módulos por tipo de ação | ✅ Viável + separar ScriptExecutor, message-handlers, injection |
| CA3: Envios continuam funcionando | ✅ CustomEvents mantém mesma API |
| CA4: Event system mantém mesma API | ✅ Interface de CustomEvents é o contrato |

**CAs adicionais recomendados:**
- CA5: Código duplicado (Chat Identity, Photo Resolution) extraído para `shared/` e importado por ambos
- CA6: `WhatsAppInjector.init()` decomposto em handlers registrados por domínio

---

### Story 1.3 — Modularização do `db.ts`

| Critério de Aceitação | Parecer |
|----------------------|---------|
| CA1: Separação em stores por domínio | ✅ Natural, já organizado por comentários |
| CA2: `db.ts` mantém setup/schema/migrations | ✅ Correto |
| CA3: Queries funcionando | ✅ Imports diretos, sem restrição IIFE |
| CA4: Backward compatible | ✅ Schema IndexedDB não muda |

**Sem objeções.** Esta é a Story com menor risco. Recomendo executá-la primeiro como "warm-up" para a equipe.

---

### Story 1.4 — Testes e Limpeza

| Critério de Aceitação | Parecer |
|----------------------|---------|
| CA1: Vitest configurado | ✅ Direto — `npm i -D vitest` + config |
| CA2: 10 testes nos módulos de storage | ✅ Viável — storage modules terão imports limpos |
| CA3: `.bak` removidos | ✅ 2 arquivos identificados |
| CA4: `.gitignore` atualizado | ✅ Trivial |
| CA5: `npm test` funciona | ✅ Direto |

> [!NOTE]
> Testar content scripts (IIFE) via Vitest exige que os testes importem os **módulos fonte** (pré-bundling), não o output IIFE. Isso funciona naturalmente se a decomposição seguir o padrão proposto.

---

## 5. Ordem de Execução Recomendada

```
1. Story 1.4 (parcial) — Setup Vitest + remoção .bak
2. Story 1.3 — Modularização db.ts (menor risco, warm-up)
3. Story 1.1 — Decomposição whatsapp-ui-overlay.ts (maior impacto)
4. Story 1.2 — Decomposição page-script + injector
5. Story 1.4 (restante) — Testes unitários nos novos módulos
```

**Justificativa:** Começar pelo db.ts valida o pipeline (build + testes) com risco mínimo. O overlay é o maior job mas depende de ter testes prontos. Os content scripts (1.2) podem ser feitos em paralelo com 1.1 se houver mais de um dev.

---

## 6. Decisões Arquiteturais Pendentes

| # | Decisão | Opções | Recomendação |
|:-:|---------|--------|--------------|
| D1 | Padrão de estado compartilhado no overlay | (a) Singleton state object, (b) Event bus, (c) Mixin pattern | **(a) Singleton state** — simples, type-safe, sem overhead |
| D2 | Limite de linhas por módulo | (a) 200, (b) 500, (c) sem limite | **(b) 500 soft / 800 hard** |
| D3 | Código duplicado chat-identity/photo | (a) Copiar em ambos, (b) Shared module | **(b) Shared** — o Vite inline para cada IIFE |
| D4 | Decomposição do `init()` do injector | (a) Switch-case inline, (b) Handler registry | **(b) Handler registry** — escalável para novas features |

---

*— Aria, arquitetando o futuro 🏗️*
