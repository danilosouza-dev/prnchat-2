# Arquitetura do X1Flox

Este documento explica as decisões arquiteturais e técnicas do projeto X1Flox Chrome Extension.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Decisões Técnicas Principais](#decisões-técnicas-principais)
- [Estrutura de Scripts](#estrutura-de-scripts)
- [Fluxo de Dados](#fluxo-de-dados)
- [Integração com WhatsApp Web](#integração-com-whatsapp-web)
- [Sistema de Injeção de Scripts](#sistema-de-injeção-de-scripts)
- [Armazenamento de Dados](#armazenamento-de-dados)

---

## 🎯 Visão Geral

X1Flox é uma Chrome Extension (Manifest V3) que automatiza o envio de mensagens no WhatsApp Web. A arquitetura foi projetada para:

1. **Acessar APIs internas do WhatsApp Web** - Store API para envio de mensagens
2. **Contornar restrições de segurança** - CSP, CORS, isolated worlds
3. **Gravar e enviar áudio PTT** - MediaRecorder + WPPConnect
4. **Ser mantenível e extensível** - TypeScript, React, documentação

---

## 🔧 Decisões Técnicas Principais

### 1. Manifest V3

**Decisão:** Usar Manifest V3 ao invés de V2

**Razões:**
- Manifest V2 será descontinuado pelo Chrome
- Service Workers são mais seguros e eficientes que background pages
- Preparação para futuro (V3 é obrigatório para novas extensões)

**Desafios:**
- Não há `background.html` persistente
- Service Workers podem ser desligados a qualquer momento
- Necessário usar message passing extensivamente

### 2. TypeScript + React

**Decisão:** Usar TypeScript para todo o código e React para UI

**Razões:**
- **TypeScript:** Type safety, autocomplete, menos bugs em produção
- **React:** Componentização, estado reativo, ecossistema rico
- **Developer Experience:** Melhor DX com ferramentas modernas

**Trade-offs:**
- Build step necessário (Vite)
- Bundlesize maior (mitigado com tree-shaking)

### 3. Vite como Build Tool

**Decisão:** Usar Vite ao invés de Webpack/Rollup direto

**Razões:**
- Build extremamente rápido (esbuild)
- HMR eficiente durante desenvolvimento
- Configuração simples e clara
- Plugin ecosystem

**Configuração:**
```typescript
// vite.config.ts
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'public/manifest.json', dest: '.' },
        { src: 'public/icons/*', dest: 'icons' },
        { src: 'public/wppconnect-wa.js', dest: '.' }  // WPPConnect local
      ]
    })
  ],
  build: {
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        options: 'src/options/index.html',
        background: 'src/background/service-worker.ts',
        content: 'src/content/whatsapp-injector.ts',
        // ... outros entry points
      }
    }
  }
})
```

### 4. IndexedDB para Storage

**Decisão:** Usar IndexedDB para armazenamento principal

**Razões:**
- **Blobs suportados:** Armazenar arquivos de áudio diretamente
- **Sem limite de quota:** chrome.storage tem limite de ~10MB
- **Performance:** Queries assíncronas eficientes
- **Estruturado:** Schema definido, índices, transações

**Implementação:**
```typescript
// src/utils/db.ts
export const db = new Dexie('X1FloxDB');
db.version(1).stores({
  messages: '++id, title, type, *tags',
  scripts: '++id, name',
  triggers: '++id, name, enabled',
  audioBlobs: 'messageId'  // Blobs de áudio
});
```

**Alternativa considerada:** chrome.storage.local
- ❌ Limite de quota
- ❌ Não suporta Blobs nativamente
- ✅ Sincroniza com conta Google (não necessário para este projeto)

### 5. Content Script no MAIN World

**Decisão:** Injetar scripts no MAIN world da página

**Razões:**
- **WhatsApp Store API** só é acessível no contexto da página
- ISOLATED world (padrão) não tem acesso a `window.Store`
- MAIN world permite manipular objetos nativos do WhatsApp

**Como funciona:**
```typescript
// manifest.json - content script no ISOLATED world
{
  "content_scripts": [{
    "matches": ["*://web.whatsapp.com/*"],
    "js": ["content/whatsapp-injector.ts"],
    "run_at": "document_end"
  }]
}

// whatsapp-injector.ts - injeta no MAIN world
const script = document.createElement('script');
script.src = chrome.runtime.getURL('content/script-loader.js');
script.type = 'module';
document.documentElement.appendChild(script);
```

**Security Considerations:**
- Scripts no MAIN world podem ser manipulados pela página
- Não expor APIs sensíveis da extensão
- Usar message passing para comunicação segura

---

## 🏗️ Estrutura de Scripts

### Camadas de Injeção

```
┌─────────────────────────────────────────────────┐
│ ISOLATED WORLD (Extension Context)              │
│                                                  │
│  whatsapp-injector.ts                           │
│  - Recebe mensagens do background               │
│  - Injeta scripts no MAIN world                 │
│  - Bridge entre extension e página              │
└────────────────┬────────────────────────────────┘
                 │ Injeta via DOM
                 ▼
┌─────────────────────────────────────────────────┐
│ MAIN WORLD (Page Context)                       │
│                                                  │
│  script-loader.ts                               │
│  ├─ Carrega wppconnect-wa.js                    │
│  ├─ Carrega whatsapp-store-accessor.ts          │
│  └─ Carrega whatsapp-page-script.ts             │
│                                                  │
│  whatsapp-store-accessor.ts                     │
│  - Acessa window.require (Metro bundler)        │
│  - Extrai WhatsApp Store modules                │
│  - Expõe window.Store                           │
│                                                  │
│  whatsapp-page-script.ts                        │
│  - Escuta eventos customizados                  │
│  - Envia mensagens via Store API / WPPConnect   │
│  - Retorna resultados via eventos               │
│                                                  │
│  wppconnect-wa.js (450KB)                       │
│  - Biblioteca @wppconnect/wa-js                 │
│  - Expõe window.WPP                             │
│  - Usado para envio de mídia                    │
└─────────────────────────────────────────────────┘
```

### Por que essa estrutura em camadas?

1. **script-loader.ts** - Orquestrador
   - Carrega bibliotecas na ordem correta
   - Aguarda inicialização antes de próximos passos
   - Tratamento de erros centralizado

2. **whatsapp-store-accessor.ts** - Accessor Layer
   - Isola lógica de acesso ao WhatsApp internals
   - Facilita manutenção quando WhatsApp atualiza
   - Pode ser substituído por outras técnicas de acesso

3. **whatsapp-page-script.ts** - Business Logic
   - Contém lógica de envio de mensagens
   - Usa Store API e WPPConnect
   - Independente de como Store é acessado

4. **wppconnect-wa.js** - External Library
   - Biblioteca de terceiros especializada
   - Lida com complexidades do WhatsApp Web
   - Atualizada independentemente

---

## 📊 Fluxo de Dados

### 1. Envio de Mensagem de Texto

```
┌─────────┐
│  User   │
│ (Popup) │
└────┬────┘
     │ 1. Click "Send"
     ▼
┌──────────────────┐
│ Popup.tsx        │
│ sendMessage()    │
└────┬─────────────┘
     │ 2. chrome.runtime.sendMessage({
     │      action: 'SEND_TEXT',
     │      content: 'Hello'
     │    })
     ▼
┌──────────────────────┐
│ service-worker.ts    │
│ chrome.tabs.query()  │
└────┬─────────────────┘
     │ 3. chrome.tabs.sendMessage(
     │      tabId,
     │      { action: 'SEND_TEXT', ... }
     │    )
     ▼
┌────────────────────────────┐
│ whatsapp-injector.ts       │
│ (ISOLATED world)           │
└────┬───────────────────────┘
     │ 4. document.dispatchEvent(
     │      new CustomEvent('X1FloxSendText', ...)
     │    )
     ▼
┌────────────────────────────┐
│ whatsapp-page-script.ts    │
│ (MAIN world)               │
│                            │
│ const chat = Store.Chat    │
│   .getActive();            │
│                            │
│ await Store.SendMessage    │
│   .sendTextMsgToChat(      │
│     chat,                  │
│     'Hello'                │
│   );                       │
└────┬───────────────────────┘
     │ 5. Success event
     ▼
┌────────────────────────────┐
│ whatsapp-injector.ts       │
│ Sends response to popup    │
└────────────────────────────┘
```

### 2. Envio de Áudio PTT

```
┌─────────┐
│  User   │
│(Options)│
└────┬────┘
     │ 1. Record audio
     ▼
┌───────────────────┐
│ AudioRecorder.tsx │
│ MediaRecorder API │
└────┬──────────────┘
     │ 2. Save to IndexedDB
     ▼
┌─────────────┐
│ IndexedDB   │
│ audioBlobs  │
└────┬────────┘
     │ 3. User clicks "Send Audio"
     ▼
┌──────────────────┐
│ chrome.runtime   │
│ .sendMessage({   │
│   action:        │
│   'SEND_AUDIO',  │
│   audioData,     │
│   duration       │
│ })               │
└────┬─────────────┘
     │ 4. Background → Content
     ▼
┌────────────────────────────┐
│ whatsapp-page-script.ts    │
│ (MAIN world)               │
│                            │
│ Convert base64 to File     │
│                            │
│ if (window.WPP) {          │
│   await WPP.chat           │
│     .sendFileMessage(      │
│       chatId,              │
│       audioFile,           │
│       {                    │
│         isPtt: true,       │
│         sendAudioAsVoice:  │
│           true             │
│       }                    │
│     );                     │
│ }                          │
└────────────────────────────┘
```

---

## 🔌 Integração com WhatsApp Web

### Store API

WhatsApp Web usa um sistema de módulos interno baseado no Metro bundler. Podemos acessá-lo via `window.require`.

**Modules importantes:**
```javascript
// Collections
WAWebCollections.Chat     // Lista de chats
WAWebCollections.Msg      // Mensagens
WAWebCollections.Contact  // Contatos

// Actions
WAWebSendMsgChatAction.addAndSendMsgToChat()  // Enviar mensagem

// Media
WAWebMediaPrep.MediaPrep            // Preparar mídia
WAWebMediaPrep.sendMediaMsgToChat   // Enviar mídia
WAWebMediaPrep.uploadMediaWithPrep  // Upload mídia

// Utils
WAWebMsgKey          // Geração de IDs de mensagem
WAWebWidFactory      // Factory de WhatsApp IDs
WAWebUserPrefsMeUser // Info do usuário atual
```

### Acesso ao Store

```typescript
// whatsapp-store-accessor.ts

// 1. Verificar disponibilidade do Metro bundler
if (typeof window.require === 'function') {
  // 2. Carregar módulos
  const Collections = window.require('WAWebCollections');
  const SendMsgAction = window.require('WAWebSendMsgChatAction');

  // 3. Expor via window.Store
  window.Store = {
    Chat: Collections.Chat,
    Msg: Collections.Msg,
    SendMessage: SendMsgAction,
    // ... outros módulos
  };
}
```

### Versionamento e Manutenção

**Problema:** WhatsApp atualiza frequentemente e pode mudar nomes de módulos.

**Solução:** Pattern matching com fallbacks
```typescript
const MODULE_PATTERNS = [
  'WAWebSendMessage',
  'WAWebSendMsgChatAction',  // Nome pode variar
  'WAWebSendMsg'
];

for (const pattern of MODULE_PATTERNS) {
  try {
    const module = window.require(pattern);
    if (module && module.addAndSendMsgToChat) {
      Store.SendMessage = module;
      break;
    }
  } catch (e) {
    continue;
  }
}
```

---

## 💉 Sistema de Injeção de Scripts

### Por que não usar chrome.scripting.executeScript()?

**Limitação:** Scripts executados via `executeScript()` rodam no ISOLATED world por padrão.

**O que tentamos:**
```typescript
// ❌ Não funciona - ISOLATED world
chrome.scripting.executeScript({
  target: { tabId },
  files: ['content/whatsapp-page-script.js']
});
// Resultado: window.Store é undefined
```

**Solução:** Injeção via DOM no MAIN world
```typescript
// ✅ Funciona - MAIN world
const script = document.createElement('script');
script.src = chrome.runtime.getURL('content/script-loader.js');
(document.head || document.documentElement).appendChild(script);
```

### web_accessible_resources

**Problema:** Scripts injetados via DOM precisam ser acessíveis pela página.

**Solução:** Declarar no manifest.json
```json
{
  "web_accessible_resources": [{
    "resources": [
      "content/whatsapp-page-script.js",
      "content/whatsapp-store-accessor.js",
      "content/script-loader.js",
      "wppconnect-wa.js"
    ],
    "matches": ["https://web.whatsapp.com/*"]
  }]
}
```

**Security Note:** Esses recursos ficam acessíveis para qualquer script na página. Não incluir dados sensíveis.

---

## 💾 Armazenamento de Dados

### Esquema do IndexedDB

```typescript
// Dexie schema
db.version(1).stores({
  // Mensagens de texto e referências de áudio
  messages: '++id, title, type, *tags, createdAt',

  // Scripts (sequências de mensagens)
  scripts: '++id, name, createdAt',

  // Gatilhos automáticos
  triggers: '++id, name, enabled, createdAt',

  // Blobs de áudio (separado para performance)
  audioBlobs: 'messageId, blob'
});
```

### Tipos de Dados

```typescript
interface Message {
  id?: number;
  title: string;
  type: 'text' | 'audio';
  content?: string;      // Para texto
  audioData?: string;    // Base64 data URL
  duration?: number;     // Duração em segundos
  tags: string[];
  createdAt: Date;
}

interface Script {
  id?: number;
  name: string;
  messageIds: number[];  // IDs das mensagens
  delays: number[];      // Delays entre mensagens (ms)
  createdAt: Date;
}

interface Trigger {
  id?: number;
  name: string;
  enabled: boolean;
  conditions: Condition[];
  scriptId: number;
  createdAt: Date;
}
```

### Estratégia de Armazenamento de Áudio

**Opções consideradas:**

1. **Base64 no campo da mensagem** ❌
   - Pros: Simples, tudo em um lugar
   - Cons: Queries lentas, overhead de memória

2. **Blob em tabela separada** ✅ (escolhido)
   - Pros: Queries rápidas, uso eficiente de memória
   - Cons: Duas queries para carregar áudio

3. **chrome.storage.local** ❌
   - Pros: API simples
   - Cons: Limite de quota, não suporta Blobs nativamente

**Implementação escolhida:**
```typescript
// Salvar
await db.messages.add({
  title: 'Áudio 1',
  type: 'audio',
  duration: 5.2,
  tags: ['vendas']
});

await db.audioBlobs.add({
  messageId: messageId,
  blob: audioBlob
});

// Carregar
const message = await db.messages.get(id);
const { blob } = await db.audioBlobs.get(id);
```

---

## 🔄 Padrões de Comunicação

### 1. Extension → Content Script

```typescript
// background/service-worker.ts
const [tab] = await chrome.tabs.query({
  active: true,
  currentWindow: true
});

const response = await chrome.tabs.sendMessage(tab.id!, {
  action: 'SEND_TEXT',
  content: 'Hello'
});
```

### 2. Content Script → Page Context

```typescript
// whatsapp-injector.ts (ISOLATED)
document.dispatchEvent(new CustomEvent('X1FloxSendText', {
  detail: { content: 'Hello', requestId: '123' }
}));

// Aguardar resposta
document.addEventListener('X1FloxMessageSent', (event) => {
  const { success, requestId } = event.detail;
  // Retornar para background
});
```

### 3. Page Context → Content Script

```typescript
// whatsapp-page-script.ts (MAIN)
document.dispatchEvent(new CustomEvent('X1FloxMessageSent', {
  detail: { success: true, requestId: '123' }
}));
```

### Request/Response Pattern

```typescript
// Sistema de promises com requestId
class MessageBridge {
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }>();

  async sendToPage(action: string, data: any): Promise<any> {
    const requestId = `req_${Date.now()}_${Math.random()}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      document.dispatchEvent(new CustomEvent(action, {
        detail: { ...data, requestId }
      }));

      // Timeout após 30s
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Timeout'));
        }
      }, 30000);
    });
  }

  handleResponse(event: CustomEvent) {
    const { requestId, success, error } = event.detail;
    const pending = this.pendingRequests.get(requestId);

    if (pending) {
      this.pendingRequests.delete(requestId);
      if (success) {
        pending.resolve(event.detail);
      } else {
        pending.reject(new Error(error));
      }
    }
  }
}
```

---

## 🎨 UI Architecture

### Component Hierarchy

```
Options Page
├── App.tsx
│   ├── TabNavigation
│   └── TabContent
│       ├── MessagesTab
│       │   ├── MessageList
│       │   │   └── MessageCard
│       │   └── MessageForm
│       │       ├── TextInput
│       │       └── AudioRecorder
│       │           ├── RecordButton
│       │           ├── WaveformDisplay
│       │           └── AudioPlayer
│       ├── ScriptsTab
│       │   ├── ScriptList
│       │   └── ScriptEditor
│       │       ├── MessageSelector
│       │       └── DelayConfig
│       ├── TriggersTab
│       │   ├── TriggerList
│       │   └── TriggerEditor
│       │       ├── ConditionBuilder
│       │       └── ScriptSelector
│       └── SettingsTab
│           ├── ExportImport
│           └── TagManager

Popup
└── App.tsx
    ├── MessageSearch
    ├── MessageList
    ├── ScriptSelector
    └── SendButton
```

### State Management

**Decisão:** React useState + useEffect (sem Redux/MobX)

**Razões:**
- Projeto de tamanho médio, não justifica Redux
- useState suficiente para estado local
- useEffect para side effects (IndexedDB)

**Pattern de loading:**
```typescript
function MessagesTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMessages();
  }, []);

  async function loadMessages() {
    try {
      setLoading(true);
      const data = await db.messages.toArray();
      setMessages(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <Error message={error} />;
  return <MessageList messages={messages} />;
}
```

---

## 🚀 Performance Considerations

### 1. Lazy Loading de Áudio

```typescript
// Não carrega todos os blobs de uma vez
const messages = await db.messages.toArray();  // Sem blobs
// ... usuário clica para tocar
const { blob } = await db.audioBlobs.get(messageId);  // Carrega sob demanda
```

### 2. Debounce em Buscas

```typescript
const [search, setSearch] = useState('');
const [debouncedSearch, setDebouncedSearch] = useState('');

useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedSearch(search);
  }, 300);
  return () => clearTimeout(timer);
}, [search]);

useEffect(() => {
  // Query apenas quando debounced muda
  searchMessages(debouncedSearch);
}, [debouncedSearch]);
```

### 3. Virtual Scrolling (futuro)

Para listas muito grandes de mensagens, considerar react-window ou react-virtualized.

---

## 🔒 Segurança

### 1. Content Security Policy (CSP)

WhatsApp Web tem CSP restritivo que bloqueia scripts de CDNs externos.

**Solução:** Incluir bibliotecas localmente
- WPPConnect copiado para `public/wppconnect-wa.js`
- Servido via `chrome-extension://` URL

### 2. Sanitização de Inputs

```typescript
// Prevenir XSS em mensagens
function sanitizeMessage(content: string): string {
  return content
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
```

### 3. Validação de Permissões

```typescript
// Verificar permissões antes de acessar APIs
async function checkPermissions() {
  const hasScripting = await chrome.permissions.contains({
    permissions: ['scripting']
  });

  if (!hasScripting) {
    throw new Error('Missing scripting permission');
  }
}
```

---

## 📝 Logging e Debugging

### Console Prefixes

Todos os logs usam prefixes para filtrar:
- `[X1Flox]` - Content script (ISOLATED)
- `[X1Flox Loader]` - Script loader (MAIN)
- `[X1Flox Page]` - Page script (MAIN)
- `[X1Flox Store]` - Store accessor (MAIN)

**Como debugar:**
```javascript
// No console do WhatsApp Web, filtre por:
// [X1Flox

// Verificar se Store está disponível:
window.Store

// Verificar se WPP está carregado:
window.WPP

// Ver eventos customizados:
monitorEvents(document, 'X1Flox');
```

---

## 🔄 Fluxo de Build

```
Source Files (src/)
    ↓
TypeScript Compiler (tsc)
    ↓
Vite Build
    ├─ Bundle React components
    ├─ Optimize code
    ├─ Copy static assets
    └─ Output to dist/
    ↓
dist/
├── manifest.json
├── background/service-worker.js
├── content/whatsapp-injector.js
├── content/whatsapp-page-script.js
├── content/whatsapp-store-accessor.js
├── content/script-loader.js
├── wppconnect-wa.js  (450KB)
├── src/options/index.html
├── src/popup/index.html
├── options.js
├── popup.js
├── assets/
└── icons/
```

---

## 🎓 Lições Aprendidas

### 1. ISOLATED vs MAIN World

**Erro inicial:** Tentar acessar `window.Store` do content script padrão.

**Solução:** Entender mundos de execução e usar injeção via DOM.

### 2. Envio de Mídia no WhatsApp

**Erro inicial:** Usar MediaPrep diretamente causava erro "upload failed".

**Descoberta:** WhatsApp bloqueia uploads automatizados mesmo com formato correto.

**Solução:** Usar biblioteca WPPConnect que contorna essas restrições.

### 3. CSP e Scripts Externos

**Erro inicial:** Tentar carregar WPPConnect de CDN.

**Problema:** CSP bloqueia `script-src` de origens externas.

**Solução:** Incluir biblioteca localmente e declarar em `web_accessible_resources`.

### 4. Manifest V3 Lifecycle

**Erro inicial:** Assumir que service worker está sempre ativo.

**Realidade:** Service workers são efêmeros, podem desligar a qualquer momento.

**Solução:** Design stateless, usar chrome.storage para persistência.

---

## 📚 Referências

- [Chrome Extensions Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Chrome Scripting API](https://developer.chrome.com/docs/extensions/reference/scripting/)
- [WPPConnect Documentation](https://github.com/wppconnect-team/wa-js)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)

---

**Documento mantido por:** Claude (AI Assistant)
**Última atualização:** 2025-01-21
**Versão:** 1.0
