# PrinChat Extension MVP v2.0 — Brownfield Enhancement PRD

**Autor:** Morgan (PM) | **Data:** 2026-03-05 | **Status:** Draft  
**Fonte técnica:** Project Structure Analysis — Aria (Architect)  
**Versão:** 1.0.0

---

## 1. Visão Geral do Projeto Existente

### Fonte da Análise
- Project Structure Analysis da Aria (Architect) — 2026-03-05
- Análise direta do código-fonte (`src/`, `docs/`, `src/supabase/schema.sql`)
- Knowledge Items: HeyGen Subscription System, Admin Panel, Extension Architecture, Notification System

### Estado Atual
**PrinChat** é uma extensão Chrome (Manifest V3) para automação do WhatsApp Web. Permite envio de mensagens e áudios pré-configurados, scripts (sequências), gatilhos (beta), e um CRM Kanban integrado ao WhatsApp Web.

**Stack:** TypeScript + React 18 + Vite + Tailwind CSS + IndexedDB (Dexie) + WPPConnect + Supabase

### Documentação Disponível
- ✅ Arquitetura (`docs/ARCHITECTURE.md`)
- ✅ Solução Áudio PTT (`docs/AUDIO_PTT_SOLUTION.md`)
- ✅ Guia de Desenvolvimento (`docs/DEVELOPMENT.md`)
- ✅ README completo
- ✅ Schema Supabase (`src/supabase/schema.sql`)

---

## 2. Escopo da Melhoria

### Tipo de Melhoria
- ✅ Nova Feature (Dashboard Analytics, Modal Chat)
- ✅ Modificação Major (Kanban Cards enriquecidos)
- ✅ Melhorias de Performance/Estabilidade (Dívida Técnica)
- ✅ Melhoria UI/UX (Dashboard visual, Chat Modal)

### Descrição
Preparar o PrinChat Extension para monetização elevando a qualidade técnica (dívida técnica), enriquecendo o Kanban com informações acionáveis nos cartões, implementando um modal de chat completo (réplica do WhatsApp com funcionalidades da extensão), e adicionando um Dashboard de Analytics com gráficos e métricas para tomada de decisão.

### Avaliação de Impacto
- **Impacto Significativo** — Alterações substanciais no código existente, especialmente nos content scripts monolíticos, adição de novos módulos e componentes de UI.

### Visão de Produto (Fases Futuras)

> [!NOTE]
> Este PRD foca **exclusivamente na Fase 1 (Extension MVP)**. As fases seguintes serão planejadas em PRDs separados.

| Fase | Escopo | Horizonte |
|------|--------|-----------|
| **Fase 1** (este PRD) | Extension MVP completo para monetização | Agora |
| **Fase 2** | CRM Web em `app.princhat.com.br` com funcionalidades completas | Próxima versão |
| **Fase 3** | Omnichannel (API oficial WhatsApp, Instagram, Facebook, chat do site) + Automação de atendimento | Futuro |

---

## 3. Objetivos

- Resolver dívida técnica crítica apontada pela análise arquitetural, tornando a base de código sustentável
- Enriquecer os cartões do Kanban com informações de scripts, agendamentos e notas
- Implementar modal de chat completo como réplica do WhatsApp, com todas as funcionalidades da extensão
- Criar dashboard de analytics visual e completo para tomada de decisão dos clientes
- Preparar o produto para venda e monetização como MVP final da extensão
- Estabelecer infraestrutura de testes para garantir qualidade contínua

---

## 4. Contexto de Negócio

O PrinChat está em fase de pré-lançamento comercial. A extensão já possui funcionalidades core robustas (mensagens, scripts, gatilhos, Kanban CRM), mas precisa de polimento e features de alto valor percebido para justificar a monetização.

O Dashboard e o Chat Modal são diferenciais competitivos que transformam a extensão de uma "ferramenta de automação" em um "mini-CRM integrado ao WhatsApp", aumentando significativamente o valor percebido e a retenção.

A resolução da dívida técnica é pré-requisito para escalar o desenvolvimento em direção ao CRM completo (Fase 2), pois os content scripts monolíticos atuais (619KB o maior arquivo!) inviabilizam manutenção e extensão eficiente.

---

## 5. Requisitos

### 5.1 Requisitos Funcionais

**Dívida Técnica:**

> [!NOTE]
> **Restrição IIFE:** Os content scripts são compilados individualmente como IIFE via `build-content.cjs`. A decomposição em módulos funciona no source code (Vite/Rollup faz inline dos imports), mas o output de cada content script permanece como um único arquivo `.js`. Testes unitários devem importar módulos fonte (pré-bundling).

- **FR1:** O arquivo `whatsapp-ui-overlay.ts` (619KB, 15.701 linhas, 309 métodos) deve ser decomposto em módulos por domínio (Kanban com sub-módulos, Messaging, Scripts, Schedules, Notes, Signatures, Header, Notifications, Utils), cada módulo com no máximo **500 linhas (soft limit)** e **800 linhas (hard limit)** para domínios com UI complexa. O estado compartilhado (~100 campos) deve ser gerenciado via singleton state object
- **FR2:** O arquivo `whatsapp-page-script.ts` (200KB, 4.735 linhas, 230 funções) deve ser modularizado por responsabilidade (chat-identity, photo-resolution, store-api, messaging, event-handlers, triggers)
- **FR3:** O arquivo `whatsapp-injector.ts` (137KB, 3.323 linhas) deve ser decomposto em: `ScriptExecutor` (classe já isolada), message-handlers (decomposição do `init()` de 946 linhas em handler registry), media, injection, chat-info
- **FR3.1:** Código duplicado entre `whatsapp-injector.ts` e `whatsapp-page-script.ts` (~600 linhas de Chat Identity + Photo Resolution) deve ser extraído para módulos `shared/` importados por ambos
- **FR4:** O arquivo `db.ts` (71KB, 2.114 linhas, 89 métodos) deve ser separado por domínio (messages, scripts, triggers, kanban-columns, kanban-leads, tags, folders, settings, signatures, schedules, notes, lead-utils)
- **FR5:** Infraestrutura de testes unitários deve ser implementada usando Vitest com pelo menos testes para módulos de storage e services (importando módulos fonte, não output IIFE)
- **FR6:** Arquivos `.bak` devem ser removidos do source tree (2 arquivos identificados: `whatsapp-injector.ts.bak`, `whatsapp-ui-overlay.ts.bak`)

**Kanban — Cartões Enriquecidos:**
- **FR7:** Cada cartão do Kanban deve exibir badges/contadores de scripts enviados para aquele contato
- **FR8:** Cada cartão deve exibir badges/contadores de agendamentos ativos para aquele contato
- **FR9:** Cada cartão deve exibir badges/contadores de notas registradas para aquele contato
- **FR10:** Ao clicar no cartão, deve abrir um modal com abas (Chat, Notas, Agendamentos, Scripts Enviados)

**Kanban — Modal de Chat (Réplica WhatsApp):**
- **FR11:** O modal deve exibir o histórico de mensagens do contato em formato de chat (balões, timestamps, status de entrega)
- **FR12:** O modal deve permitir enviar mensagens de texto para o contato
- **FR13:** O modal deve permitir enviar áudios (gravação + upload) para o contato
- **FR14:** O modal deve permitir executar scripts (sequências) para o contato
- **FR15:** O modal deve permitir criar e visualizar agendamentos para o contato
- **FR16:** O modal deve permitir criar, editar e visualizar notas do contato
- **FR17:** O modal deve suportar envio de mídia (imagens, vídeos, documentos) quando suportado pelo WPPConnect
- **FR18:** O modal deve exibir informações do contato (nome, foto, telefone, tags, coluna atual)

**Dashboard de Analytics:**
- **FR19:** Botão de acesso ao Dashboard deve ser posicionado logo após o botão do Kanban na interface
- **FR20:** Exibir contagem de conversas do dia, semana e mês com gráfico de barras/linhas comparativo
- **FR21:** Exibir taxa de resposta média (tempo entre mensagem recebida e resposta enviada)
- **FR22:** Exibir distribuição de leads por coluna do Kanban (gráfico de pizza/donut)
- **FR23:** Exibir top 10 contatos mais ativos (por quantidade de mensagens trocadas)
- **FR24:** Exibir histórico de scripts executados (quantidade por dia/semana) com gráfico de linha
- **FR25:** Exibir agendamentos pendentes vs. enviados vs. falhos (gráfico de status)
- **FR26:** Exibir horários de maior atividade (heatmap semanal — hora x dia da semana)
- **FR27:** Exibir total de mensagens enviadas/recebidas no período selecionado
- **FR28:** Exibir tendência de novos leads adicionados ao Kanban por semana
- **FR29:** Filtro de período personalizável (Hoje, 7 dias, 30 dias, personalizado)
- **FR30:** Design premium com gráficos animados, cores harmoniosas e responsivo

### 5.2 Requisitos Não-Funcionais

- **NFR1:** A decomposição técnica não pode quebrar nenhuma funcionalidade existente — zero regressão
- **NFR2:** O Dashboard deve renderizar em menos de 2 segundos com até 10.000 mensagens
- **NFR3:** O modal de chat deve carregar o histórico em menos de 1 segundo para até 500 mensagens
- **NFR4:** O modal de chat deve manter atualização em tempo real das mensagens (via eventos do WhatsApp Web)
- **NFR5:** O Dashboard deve funcionar 100% offline usando dados do IndexedDB
- **NFR6:** O pacote final da extensão (dist/) não deve exceder 5MB
- **NFR7:** Cobertura de testes unitários mínima de 40% nos novos módulos criados

### 5.3 Requisitos de Compatibilidade

- **CR1:** Todas as APIs existentes (Store API, WPPConnect, message passing) devem continuar funcionando identicamente após refatoração
- **CR2:** Schema do IndexedDB deve manter backward compatibility — migrações sem perda de dados do usuário
- **CR3:** A UI existente (popup, options, FAB) deve manter consistência visual com os novos componentes
- **CR4:** Integração com Supabase (sync, auth, realtime) deve continuar funcionando sem alteração nas tabelas/policies existentes

---

## 6. Metas de UI

### Integração com UI Existente
Os novos componentes (Dashboard, Chat Modal) devem seguir o design system existente: Tailwind CSS + Radix UI + Lucide Icons, com a paleta de cores já utilizada no Kanban/WhatsApp overlay.

### Telas Novas/Modificadas
| Tela | Tipo | Descrição |
|------|------|-----------|
| Dashboard Analytics | **Nova** | Página/seção com gráficos e métricas (botão após Kanban) |
| Chat Modal | **Nova** | Modal fullscreen-like com réplica do chat WhatsApp |
| Kanban Cards | **Modificada** | Badges de scripts/agendamentos/notas nos cartões |
| Kanban Header | **Modificada** | Novo botão "Dashboard" após botão do Kanban |

### Consistência Visual
- Usar Tailwind CSS tokens existentes
- Componentes Radix UI para modais, tabs, tooltips
- Ícones Lucide React
- Gráficos com biblioteca leve (Chart.js ou Recharts)
- Tema escuro alinhado com o WhatsApp Web

---

## 7. Restrições Técnicas e Integração

### Stack Existente
- **Linguagem:** TypeScript 5.3
- **Framework UI:** React 18 + Tailwind CSS 3.4
- **Build:** Vite 5
- **Database Local:** IndexedDB via `idb` (anteriormente Dexie)
- **Database Cloud:** Supabase (PostgreSQL + Auth + Realtime)
- **Extensão:** Chrome Manifest V3
- **WhatsApp:** WPPConnect wa-js 3.20

### Abordagem de Integração
- **Database:** Novas tabelas Supabase para analytics (ou views/queries nas existentes), IndexedDB para cache local de métricas
- **API:** Reutilizar event system existente (CustomEvents entre ISOLATED/MAIN world) para o chat modal
- **Frontend:** Novos componentes React injetados via `whatsapp-ui-overlay` (após decomposição)
- **Testes:** Vitest para unit tests, sem test-runner de integração neste momento

### Organização do Código (Pós-Refatoração)

> Revisado pela análise arquitetural da Aria (Architect) — 2026-03-05

```
src/content/
├── shared/                        # Módulos compartilhados entre content scripts
│   ├── chat-identity.ts           # Normalização de chat IDs (desduplicado)
│   └── photo-resolution.ts        # Resolução de fotos de perfil (desduplicado)
├── overlay/                       # whatsapp-ui-overlay decomposition
│   ├── index.ts                   # Entry point slim (~100 lines)
│   ├── types.ts                   # Interfaces compartilhadas
│   ├── state.ts                   # Singleton state (refs DOM, flags)
│   ├── modules/
│   │   ├── messaging.ts           # Envio + delay + status (~400 lines)
│   │   ├── script-execution.ts    # Execução + status popup (~300 lines)
│   │   ├── schedules.ts           # CRUD + popups (~600 lines)
│   │   ├── notes.ts               # CRUD + editor modal (~700 lines)
│   │   ├── signatures.ts          # CRUD + form modal (~500 lines)
│   │   ├── header.ts              # Header customizado + popups (~500 lines)
│   │   ├── notifications.ts       # Dropdown (~250 lines)
│   │   └── kanban/
│   │       ├── index.ts           # Kanban orchestrator
│   │       ├── board.ts           # Board rendering + layout
│   │       ├── cards.ts           # Card rendering + badges
│   │       ├── drag-drop.ts       # Sortable integration
│   │       ├── realtime.ts        # Realtime listeners
│   │       ├── move-column.ts     # Move-to-column popup
│   │       └── column-mgmt.ts     # Column CRUD + modal
│   └── utils/
│       ├── dom.ts                 # Helpers DOM
│       ├── comms.ts               # requestFromContentScript, events
│       └── formatters.ts          # escapeHtml, formatTime, etc.
├── injector/                      # whatsapp-injector decomposition
│   ├── index.ts                   # Entry point slim
│   ├── script-executor.ts         # Classe ScriptExecutor (já isolada)
│   ├── message-handlers.ts        # Handler registry (ex-init() 946 lines)
│   ├── media.ts                   # restoreTempMediaData
│   ├── injection.ts               # injectScripts, injectUIOverlay, injectFAB
│   ├── sending.ts                 # sendText, sendAudio, sendImage, sendVideo, sendFile
│   └── chat-info.ts               # getActiveChat, getChatInfo, getAllLabels
├── page-script/                   # whatsapp-page-script decomposition
│   ├── index.ts                   # Entry point IIFE wrapper
│   ├── chat-identity.ts           # (imports shared/chat-identity)
│   ├── photo-resolution.ts        # (imports shared/photo-resolution)
│   ├── store-api.ts               # window.Store wrappers
│   ├── messaging.ts               # sendText, sendAudio via Store API
│   ├── event-handlers.ts          # CustomEvent listeners
│   └── triggers.ts                # Message observers, keyword matching
├── whatsapp-ui-overlay.ts         # → import overlay/index + instanciar
├── whatsapp-injector.ts           # → import injector/index + instanciar
├── whatsapp-page-script.ts        # → import page-script/index
├── script-loader.ts
├── whatsapp-store-accessor.ts
└── whatsapp-fab.ts

src/storage/
├── db.ts                          # Core DB setup + schema + migrations
├── stores/
│   ├── messages-store.ts          # Messages CRUD
│   ├── scripts-store.ts           # Scripts CRUD
│   ├── triggers-store.ts          # Triggers CRUD
│   ├── tags-store.ts              # Tags CRUD
│   ├── folders-store.ts           # Folders CRUD
│   ├── settings-store.ts          # Settings operations
│   ├── signatures-store.ts        # Signatures CRUD
│   ├── schedules-store.ts         # Schedules CRUD
│   ├── notes-store.ts             # Notes CRUD
│   ├── kanban-columns-store.ts    # Kanban columns operations
│   ├── kanban-leads-store.ts      # Kanban leads operations
│   └── analytics-store.ts         # Analytics data (Epic 4)
├── lead-utils.ts                  # Lead normalization/merge (~430 lines)
└── chrome-storage.ts              # (existente)
```

### Avaliação de Riscos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Refatoração quebra funcionalidade existente | ALTA | Testes antes de refatorar, feature flags, rollback plan |
| IIFE impede ES imports cross-file em runtime | ALTA | Vite/Rollup inline imports no build — decomposição funciona no source; testes importam módulos fonte |
| Estado compartilhado na WhatsAppUIOverlay (~100 campos) | ALTA | Singleton state object type-safe, composição por domínio |
| `WhatsAppInjector.init()` de 946 linhas | ALTA | Decompor em handler registry por domínio |
| Código duplicado chat-identity/photo (~600 linhas) | MÉDIA | Extrair para `shared/` — Vite inline para cada IIFE automaticamente |
| Modal de chat perde sync com WhatsApp | ALTA | Reutilizar event listeners existentes, polling como fallback |
| Performance do Dashboard com muitos dados | MÉDIA | Lazy loading, agregação de dados, IndexedDB queries otimizadas |
| Tamanho do bundle aumenta demais | MÉDIA | Code splitting, tree shaking, monitoramento de bundle size |
| WhatsApp atualiza e quebra Store API | ALTA | Pattern matching com fallbacks (já implementado), WPPConnect como abstração |

---

## 8. Estrutura de Épicos

### Decisão de Estrutura

Optei por **4 Épicos sequenciais** com dependências claras. O Epic 1 (Dívida Técnica) é pré-requisito para todos os outros, pois modularizar o código primeiro torna seguro e eficiente adicionar novas features.

```
Epic 1: Tech Debt ──→ Epic 2: Kanban+ ──→ Epic 3: Chat Modal ──→ Epic 4: Dashboard
  (base sólida)      (cartões ricos)      (réplica chat)         (analytics)
```

---

## 9. Detalhes dos Épicos

### Epic 1: Remediação de Dívida Técnica

**Objetivo:** Tornar a base de código sustentável e extensível, preparando-a para as novas features.

**Requisitos de Integração:** Zero regressão — tudo que funciona hoje deve continuar funcionando identicamente.

**Revisão Técnica:** Aprovada por Aria (Architect) — 2026-03-05. Veja `docs/epic1_tech_review.md` para análise completa.

**Ordem de Execução Recomendada (pela Architect):**
```
1. Story 1.4 (parcial) → Setup Vitest + remoção .bak
2. Story 1.3             → Modularização db.ts (menor risco, warm-up)
3. Story 1.1             → Decomposição whatsapp-ui-overlay.ts (maior impacto)
4. Story 1.2             → Decomposição page-script + injector
5. Story 1.4 (restante)  → Testes unitários nos novos módulos
```

#### Story 1.1 — Decomposição do `whatsapp-ui-overlay.ts`
> Como desenvolvedor, quero que o arquivo monolítico de 619KB (15.701 linhas, 309 métodos na God Class `WhatsAppUIOverlay`) seja decomposto em módulos por domínio, para que eu consiga manter e estender o código com segurança.

**Critérios de Aceitação:**
1. O arquivo original é substituído por módulos em `src/content/overlay/modules/`: `kanban/` (com sub-módulos board, cards, drag-drop, realtime, move-column, column-mgmt), `messaging.ts`, `script-execution.ts`, `schedules.ts`, `notes.ts`, `signatures.ts`, `header.ts`, `notifications.ts`
2. Cada módulo tem no máximo **500 linhas (soft limit)** e **800 linhas (hard limit)** para domínios com UI complexa
3. Estado compartilhado (~100 campos privados) gerenciado via **singleton state object** em `overlay/state.ts`
4. Todas as funcionalidades existentes do overlay continuam funcionando
5. Imports/exports seguem padrão barrel (index.ts) — Vite/Rollup inline no output IIFE
6. Utilitários DOM, comunicação e formatação extraídos para `overlay/utils/`

**Verificação de Integração:**
- IV1: Kanban board renderiza e opera normalmente (drag-drop, criar/editar colunas, mover leads)
- IV2: Notes, Schedules e Tags funcionam como antes
- IV3: FAB button continua funcionando
- IV4: Bundle size do IIFE output não aumenta mais que 5%
- IV5: Estado compartilhado acessível por todos os módulos sem circular dependencies
- IV6: Envio de mensagens com delay, pause e cancel funciona
- IV7: Assinaturas (signatures) CRUD funciona

#### Story 1.2 — Decomposição do `whatsapp-page-script.ts` e `whatsapp-injector.ts`
> Como desenvolvedor, quero os scripts de conteúdo modularizados por responsabilidade, para facilitar manutenção e debugging.

**Critérios de Aceitação:**
1. `whatsapp-page-script.ts` é decomposto em módulos em `src/content/page-script/`: chat-identity, photo-resolution, store-api, messaging, event-handlers, triggers
2. `whatsapp-injector.ts` é decomposto em módulos em `src/content/injector/`: script-executor (classe já isolada), message-handlers (handler registry, ex-`init()` de 946 linhas), media, injection, sending, chat-info
3. Código duplicado (~600 linhas de Chat Identity + Photo Resolution) extraído para `src/content/shared/` e importado por ambos os scripts
4. `WhatsAppInjector.init()` decomposto em handlers registrados por domínio (handler registry pattern)
5. Envio de texto, áudio, scripts e gatilhos continuam funcionando
6. Event system (CustomEvents) mantém mesma API

**Verificação de Integração:**
- IV1: Enviar mensagem de texto funciona via popup
- IV2: Enviar áudio funciona via popup
- IV3: Executar script completo funciona
- IV4: Gatilhos detectam e respondem a mensagens
- IV5: Shared modules são inlined corretamente em ambos os IIFE outputs

#### Story 1.3 — Modularização do `db.ts`
> Como desenvolvedor, quero o storage modularizado por domínio, para isolar responsabilidades e facilitar testes.

**Critérios de Aceitação:**
1. `db.ts` é separado em stores em `src/storage/stores/`: `messages-store`, `scripts-store`, `triggers-store`, `tags-store`, `folders-store`, `settings-store`, `signatures-store`, `schedules-store`, `notes-store`, `kanban-columns-store`, `kanban-leads-store`
2. Lead Normalization/Merge (~430 linhas) extraído para `src/storage/lead-utils.ts`
3. Arquivo principal `db.ts` mantém apenas schema `PrinChatDB`, `DatabaseService` init/upgrade e migrations
4. Todas as queries existentes continuam funcionando
5. Migração de schema é backward compatible
6. `syncService` acessível por stores que dependem dele

**Verificação de Integração:**
- IV1: CRUD de mensagens funciona
- IV2: CRUD de scripts funciona
- IV3: Dados existentes do usuário não são perdidos
- IV4: Sync com Supabase continua funcionando
- IV5: Kanban leads normalization funciona corretamente

#### Story 1.4 — Infraestrutura de Testes e Limpeza
> Como desenvolvedor, quero ter Vitest configurado e arquivos desnecessários removidos, para garantir qualidade contínua.

**Critérios de Aceitação:**
1. Vitest configurado com scripts no `package.json`
2. Pelo menos 10 testes unitários cobrindo módulos de storage (importando módulos fonte, não output IIFE)
3. Arquivos `.bak` removidos do source tree (`whatsapp-injector.ts.bak`, `whatsapp-ui-overlay.ts.bak`)
4. `.gitignore` atualizado para prevenir `.bak` no futuro
5. Comando `npm test` executa com sucesso

**Verificação de Integração:**
- IV1: `npm test` roda sem erros
- IV2: Build de produção não é afetado
- IV3: `.bak` files não existem mais no repositório

---

### Epic 2: Kanban Cards Enriquecidos

**Objetivo:** Exibir informações acionáveis diretamente nos cartões do Kanban (scripts, agendamentos, notas).

**Requisitos de Integração:** Aproveitar os campos `notesCount`, `schedulesCount`, `scriptsCount` já definidos no type `LeadContact`.

#### Story 2.1 — Ativar Badges Existentes nos Cartões do Kanban
> Como usuário, quero que os badges de scripts, agendamentos e notas que já existem visualmente nos cartões do Kanban sejam conectados aos dados reais e funcionem corretamente, para ter visão rápida do relacionamento.

> **Nota:** Os badges já existem no UI e os campos `notesCount`, `schedulesCount`, `scriptsCount` já estão definidos no type `LeadContact`. O trabalho é conectá-los aos dados reais e mantê-los atualizados.

**Critérios de Aceitação:**
1. Badge de Scripts exibe contagem real de scripts executados para o contato
2. Badge de Agendamentos exibe contagem real de agendamentos pendentes
3. Badge de Notas exibe contagem real de notas registradas
4. Contadores atualizados em tempo real quando dados mudam (criar nota → badge incrementa)
5. Tooltip com detalhes ao passar o mouse nos badges
6. Queries de contagem otimizadas para não impactar performance do board

**Verificação de Integração:**
- IV1: Cartões com dados existentes exibem contadores corretos
- IV2: Mover cartão entre colunas mantém badges
- IV3: Performance do board não é afetada com 50+ cartões

#### Story 2.2 — Modal de Detalhes do Cartão (com Abas)
> Como usuário, quero clicar num cartão do Kanban e ver um modal com abas organizando todas as informações do contato (Chat, Notas, Agendamentos, Scripts), para gerenciar o relacionamento sem sair do Kanban.

**Critérios de Aceitação:**
1. Clique no cartão abre modal com header (nome, foto, telefone, tags, coluna)
2. Abas: Chat | Notas | Agendamentos | Scripts
3. Aba Notas: lista de notas com CRUD inline
4. Aba Agendamentos: lista com status, criar novo agendamento
5. Aba Scripts: histórico de scripts executados para esse contato
6. Modal fecha com ESC ou clique fora
7. Design alinhado com o estilo do WhatsApp/Kanban existente

**Verificação de Integração:**
- IV1: Modal abre e fecha sem bugs visuais
- IV2: Dados de notas/agendamentos/scripts carregam corretamente
- IV3: CRUD de notas funciona dentro do modal

---

### Epic 3: Modal de Chat (Réplica WhatsApp)

**Objetivo:** Implementar chat completo como réplica do WhatsApp diretamente do Kanban, com todas as funcionalidades da extensão.

**Requisitos de Integração:** Reutilizar event system (CustomEvents) e WPPConnect para envio de mídia. Integrar com Store API para histórico de mensagens.

#### Story 3.1 — Exibição do Histórico de Chat
> Como usuário, quero ver o histórico de mensagens do contato no modal de chat, com visual idêntico ao WhatsApp (balões, timestamps, status), para acompanhar a conversa sem trocar de tela.

**Critérios de Aceitação:**
1. Histórico carregado via Store API (Chat.getMessages)
2. Visual inspirado no WhatsApp: balões verdes (enviadas), brancos (recebidas)
3. Timestamps formatados
4. Status de entrega (enviada, entregue, lida) com check marks
5. Scroll infinito para mensagens antigas
6. Mensagens de mídia mostram thumbnail

**Verificação de Integração:**
- IV1: Histórico carrega corretamente para contatos com mensagens
- IV2: Mensagens de texto e mídia renderizam adequadamente
- IV3: Performance aceitável com 500+ mensagens

#### Story 3.2 — Envio de Mensagens e Áudio pelo Modal
> Como usuário, quero enviar mensagens de texto e áudio diretamente do modal de chat, para atender o cliente sem sair do Kanban.

**Critérios de Aceitação:**
1. Campo de texto com botão enviar (Enter para enviar)
2. Botão de gravação de áudio (hold-to-record ou toggle)
3. Upload de arquivo de áudio
4. Mensagem enviada aparece imediatamente no histórico
5. Feedback visual de envio (loading → sent → delivered)
6. Integração com WPPConnect para áudio PTT

**Verificação de Integração:**
- IV1: Texto enviado aparece no WhatsApp Web e no chat real do contato
- IV2: Áudio enviado é recebido como PTT pelo contato
- IV3: Mensagem enviada pelo modal aparece no histórico do WhatsApp nativo

#### Story 3.3 — Funcionalidades da Extensão no Chat Modal
> Como usuário, quero acessar scripts, agendamentos e envio de mídia diretamente do chat modal, para ter todas as ferramentas do PrinChat integradas.

**Critérios de Aceitação:**
1. Botão/menu para selecionar e executar scripts no contato
2. Botão para criar agendamento para o contato
3. Botão para enviar mídia (imagem, vídeo, documento)
4. Execução de script mostra progresso no modal
5. Agendamento criado aparece na aba de agendamentos
6. Atualização em tempo real do chat (novas mensagens aparecem automaticamente)

**Verificação de Integração:**
- IV1: Script executado pelo modal envia todas as mensagens programadas
- IV2: Agendamento criado no modal aparece na aba Agendamentos e funciona no horário
- IV3: Mídia enviada é recebida corretamente pelo contato

---

### Epic 4: Dashboard de Analytics

**Objetivo:** Implementar dashboard visual e completo com métricas de conversas, leads e atividade para tomada de decisão.

**Requisitos de Integração:** Dados do IndexedDB (mensagens, scripts) + Supabase (leads, schedules, notes). Botão posicionado após o botão do Kanban.

#### Story 4.1 — Infraestrutura de Dados e Métricas
> Como sistema, quero coletar e agregar métricas de conversas, scripts e leads, para alimentar o dashboard com dados precisos.

**Critérios de Aceitação:**
1. Store de analytics no IndexedDB para dados agregados
2. Funções de agregação: conversas por período, tempo médio de resposta, leads por coluna
3. Cache de métricas para não recalcular a cada render
4. Dados atualizados em background periodicamente

**Verificação de Integração:**
- IV1: Métricas calculadas correspondem aos dados reais
- IV2: Performance aceitável com 10.000+ mensagens
- IV3: Cache invalida corretamente quando novos dados chegam

#### Story 4.2 — Interface Visual do Dashboard
> Como usuário, quero visualizar um dashboard bonito e completo com gráficos animados e métricas claras, para tomar decisões informadas sobre meu atendimento.

**Critérios de Aceitação:**
1. Botão "Dashboard" posicionado após botão do Kanban
2. Cards de resumo no topo: Conversas Hoje, Mensagens Enviadas, Leads Ativos, Taxa de Resposta
3. Gráfico de linha/barras: Conversas por período (dia/semana/mês)
4. Gráfico de donut: Leads por coluna do Kanban
5. Gráfico de barras: Top 10 contatos mais ativos
6. Heatmap semanal: horários de maior atividade (hora x dia)
7. Gráfico de linha: Scripts executados por período
8. Gráfico de status: Agendamentos (pendentes vs. enviados vs. falhos)
9. Gráfico de tendência: Novos leads por semana
10. Filtro de período: Hoje | 7 dias | 30 dias | Personalizado
11. Design premium com animações suaves, gradientes e tema escuro
12. 100% funcional offline

**Verificação de Integração:**
- IV1: Todos os gráficos renderizam com dados reais
- IV2: Filtro de período atualiza todos os gráficos
- IV3: Dashboard funciona sem conexão internet (dados locais)
- IV4: Renderiza em menos de 2 segundos

---

## 10. Change Log

| Mudança | Data | Versão | Descrição | Autor |
|---------|------|--------|-----------|-------|
| Criação inicial | 2026-03-05 | 1.0.0 | PRD Brownfield Enhancement para Extension MVP v2.0 | Morgan (PM) |
| Revisão técnica Epic 1 | 2026-03-05 | 1.1.0 | Revisão arquitetural completa do Epic 1: limites de linhas revisados (200→500/800), restrição IIFE documentada, código duplicado identificado, estrutura de código detalhada, CAs e IVs expandidos, ordem de execução recomendada | Aria (Architect) |

---

## 11. Plano de Verificação

### Testes Automatizados
- `npm test` — Vitest unit tests (criados no Epic 1)
- `npm run build` — Build de produção sem erros
- `npm run type-check` — TypeScript sem erros

### Verificação Manual
1. **Pós-Epic 1:** Carregar extensão e validar todos os fluxos existentes (enviar texto, áudio, script, gatilho, Kanban)
2. **Pós-Epic 2:** Validar badges nos cartões e modal de detalhes com abas
3. **Pós-Epic 3:** Validar chat modal com envio de texto, áudio, scripts e mídia
4. **Pós-Epic 4:** Validar dashboard com gráficos, filtros e dados reais

---

*PRD gerado por Morgan (PM) via workflow create-doc + brownfield-prd-tmpl*
