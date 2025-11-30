# Guia de Desenvolvimento - X1Flox

Este documento contém todas as informações necessárias para desenvolver, testar e contribuir com o projeto X1Flox.

## 📋 Índice

- [Setup Inicial](#setup-inicial)
- [Estrutura do Código](#estrutura-do-código)
- [Workflow de Desenvolvimento](#workflow-de-desenvolvimento)
- [Testing](#testing)
- [Debugging](#debugging)
- [Contribuindo](#contribuindo)
- [Deployment](#deployment)

---

## 🚀 Setup Inicial

### Pré-requisitos

```bash
Node.js: v18.0.0 ou superior
npm: v9.0.0 ou superior
Chrome/Edge: Versão recente com suporte a Manifest V3
Git: Para controle de versão
```

### Instalação

1. **Clone o repositório**
   ```bash
   git clone <repository-url>
   cd x1flox
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Verifique a instalação**
   ```bash
   npm run type-check  # Deve passar sem erros
   ```

4. **Build inicial**
   ```bash
   npm run build
   ```

5. **Carregar a extensão no Chrome**
   - Abra `chrome://extensions/`
   - Ative "Modo do desenvolvedor"
   - Clique "Carregar sem compactação"
   - Selecione a pasta `dist/`

### Dependências Principais

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "dexie": "^3.2.4",               // IndexedDB wrapper
    "@wppconnect/wa-js": "^3.18.8"   // WhatsApp Web automation
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "vite-plugin-static-copy": "^1.0.0"
  }
}
```

---

## 📁 Estrutura do Código

### Visão Geral

```
src/
├── background/           # Service Worker (Manifest V3)
│   └── service-worker.ts
│       - Message routing entre popup/options e content scripts
│       - Tab management
│       - Stateless (pode ser desligado a qualquer momento)
│
├── content/              # Content Scripts (injetados no WhatsApp Web)
│   ├── whatsapp-injector.ts
│   │   - ISOLATED world
│   │   - Bridge entre extension e página
│   │   - Injeta outros scripts no MAIN world
│   │
│   ├── script-loader.ts
│   │   - MAIN world
│   │   - Orquestra carregamento de bibliotecas
│   │   - WPPConnect → Store Accessor → Page Script
│   │
│   ├── whatsapp-store-accessor.ts
│   │   - MAIN world
│   │   - Acessa window.require (Metro bundler)
│   │   - Extrai módulos do WhatsApp (Store API)
│   │   - Expõe window.Store
│   │
│   └── whatsapp-page-script.ts
│       - MAIN world
│       - Lógica de envio de mensagens
│       - Usa Store API e WPPConnect
│       - Event listeners para comandos
│
├── options/              # Options Page (React)
│   ├── index.html
│   ├── index.tsx         # Entry point
│   ├── Options.tsx       # Main component
│   ├── tabs/
│   │   ├── MessagesTab.tsx
│   │   ├── ScriptsTab.tsx
│   │   ├── TriggersTab.tsx
│   │   └── SettingsTab.tsx
│   │
│   └── components/
│       ├── AudioRecorder.tsx
│       │   - MediaRecorder API
│       │   - Waveform display
│       │   - Audio playback
│       │
│       ├── MessageCard.tsx
│       ├── MessageForm.tsx
│       ├── ScriptEditor.tsx
│       └── TagManager.tsx
│
├── popup/                # Extension Popup (React)
│   ├── index.html
│   ├── index.tsx
│   ├── Popup.tsx
│   └── components/
│       ├── MessageList.tsx
│       └── ScriptSelector.tsx
│
├── utils/                # Shared utilities
│   ├── db.ts
│   │   - IndexedDB (Dexie) setup
│   │   - Tables: messages, scripts, triggers, audioBlobs
│   │   - CRUD operations
│   │
│   └── helpers.ts
│       - String formatting
│       - Date/time helpers
│       - Validation functions
│
└── types/                # TypeScript types
    └── index.ts
        - Message, Script, Trigger interfaces
        - Action types para message passing
        - Store API types
```

### Fluxo de Dados

```
┌─────────────────────────────────────────────────┐
│ UI Layer (React)                                │
│ - Popup.tsx / Options.tsx                       │
│ - User interactions                             │
└───────────────┬─────────────────────────────────┘
                │ chrome.runtime.sendMessage()
                ▼
┌─────────────────────────────────────────────────┐
│ Background Layer (Service Worker)               │
│ - service-worker.ts                             │
│ - Message routing                               │
│ - Tab queries                                   │
└───────────────┬─────────────────────────────────┘
                │ chrome.tabs.sendMessage()
                ▼
┌─────────────────────────────────────────────────┐
│ Content Script Layer (ISOLATED world)           │
│ - whatsapp-injector.ts                          │
│ - Bridge para página                            │
└───────────────┬─────────────────────────────────┘
                │ CustomEvent dispatch
                ▼
┌─────────────────────────────────────────────────┐
│ Page Script Layer (MAIN world)                  │
│ - whatsapp-page-script.ts                       │
│ - WPPConnect / Store API                        │
│ - Send message to WhatsApp                      │
└─────────────────────────────────────────────────┘
```

---

## 🔄 Workflow de Desenvolvimento

### 1. Feature Development

**Criar nova branch:**
```bash
git checkout -b feature/nova-funcionalidade
```

**Desenvolvimento:**
```bash
# Terminal 1: Build contínuo
npm run build -- --watch

# Terminal 2: Type checking
npm run type-check -- --watch
```

**Testar:**
1. Fazer mudanças no código
2. Build automático acontece (--watch)
3. Recarregar extensão em chrome://extensions/
4. Testar no WhatsApp Web

### 2. Modificar UI (React)

**Arquivos envolvidos:**
- `src/options/` ou `src/popup/`
- Componentes React
- Estilos CSS

**Hot reload:**
```bash
npm run build -- --watch
# Vite detecta mudanças e rebuilda
# Recarregar extensão manualmente
```

**Dicas:**
- Use React DevTools para debugging
- Console.log para verificar estado
- Inspecionar elementos para CSS

### 3. Modificar Content Scripts

**Arquivos envolvidos:**
- `src/content/whatsapp-page-script.ts` - Lógica principal
- `src/content/whatsapp-store-accessor.ts` - Acesso ao Store
- `src/content/script-loader.ts` - Carregamento

**Debug:**
```javascript
// No console do WhatsApp Web:

// Verificar se Store está disponível
window.Store

// Verificar WPPConnect
window.WPP

// Ver eventos
monitorEvents(document, 'X1Flox');

// Parar monitoramento
unmonitorEvents(document);
```

**Reload:**
1. Build (`npm run build`)
2. Recarregar extensão
3. **Refrescar página do WhatsApp Web** (importante!)

### 4. Modificar Storage Schema

**Arquivo:** `src/utils/db.ts`

```typescript
// Adicionar nova tabela
db.version(2).stores({
  messages: '++id, title, type, *tags, createdAt',
  scripts: '++id, name, createdAt',
  triggers: '++id, name, enabled, createdAt',
  audioBlobs: 'messageId, blob',
  newTable: '++id, field1, field2'  // Nova tabela
});

// ⚠️ Atenção: Incrementar version number!
```

**Migração:**
```typescript
db.version(2).stores({
  messages: '++id, title, type, *tags, createdAt, newField'
}).upgrade(tx => {
  // Migração de dados antigos
  return tx.table('messages').toCollection().modify(message => {
    message.newField = 'default value';
  });
});
```

---

## 🧪 Testing

### Manual Testing Checklist

#### Mensagens de Texto
- [ ] Criar mensagem de texto
- [ ] Editar mensagem
- [ ] Deletar mensagem
- [ ] Adicionar tags
- [ ] Buscar mensagem
- [ ] Enviar mensagem
- [ ] Verificar recebimento no WhatsApp

#### Áudio PTT
- [ ] Gravar áudio (permissão de microfone)
- [ ] Parar gravação
- [ ] Reproduzir áudio gravado
- [ ] Salvar áudio
- [ ] Enviar áudio
- [ ] Verificar se toca no WhatsApp (sender e receiver)
- [ ] Verificar duração está correta
- [ ] Testar com diferentes durações (curto, médio, longo)

#### Scripts
- [ ] Criar script
- [ ] Adicionar múltiplas mensagens
- [ ] Configurar delays
- [ ] Executar script
- [ ] Verificar ordem de envio
- [ ] Verificar delays entre mensagens
- [ ] Cancelar execução (se implementado)

#### Storage
- [ ] Exportar dados
- [ ] Importar dados
- [ ] Verificar integridade após import
- [ ] Testar com grande volume de dados
- [ ] Verificar performance

#### Edge Cases
- [ ] WhatsApp Web não carregado
- [ ] Sem chat selecionado
- [ ] Internet lenta/instável
- [ ] Mensagem muito longa
- [ ] Áudio muito longo
- [ ] Muitas tags
- [ ] Caracteres especiais (emoji, unicode)

### Debugging Tools

#### Chrome DevTools

**Para UI (Options/Popup):**
1. Right-click na extensão icon
2. "Inspecionar popup" ou abrir Options page
3. Use Console, Network, Application tabs

**Para Content Scripts:**
1. Abra WhatsApp Web
2. F12 para DevTools
3. Console mostra todos os logs
4. Sources tab para breakpoints

**Para Service Worker:**
1. chrome://extensions/
2. Click "service worker" link
3. Opens dedicated DevTools

#### Console Logs

```typescript
// Use prefixes consistentes
console.log('[X1Flox]', 'Message from ISOLATED world');
console.log('[X1Flox Page]', 'Message from MAIN world');
console.log('[X1Flox Store]', 'Store accessor logs');

// Debug objects
console.log('[X1Flox]', { audioData, duration, chatId });

// Table format para arrays
console.table(messages);

// Stack trace
console.trace('How did we get here?');
```

#### Network Debugging

```javascript
// No console do WhatsApp Web
// Monitor uploads
performance.getEntriesByType('resource')
  .filter(r => r.name.includes('upload'))
  .forEach(r => console.log(r));

// Monitor XHR
const originalFetch = window.fetch;
window.fetch = function(...args) {
  console.log('[Fetch]', args[0]);
  return originalFetch.apply(this, args);
};
```

---

## 🐛 Debugging

### Common Issues

#### 1. Extension não carrega

**Sintomas:**
- Extensão não aparece em chrome://extensions/
- Errors durante load

**Debug:**
```bash
# Verificar manifest.json
cat public/manifest.json | jq .  # Valida JSON

# Verificar build
ls -la dist/
ls -la dist/manifest.json
```

**Soluções:**
- Verificar syntax errors no manifest.json
- Rebuild: `rm -rf dist && npm run build`
- Verificar permissões de arquivo

#### 2. Scripts não injetam

**Sintomas:**
- `window.Store` é undefined
- Logs não aparecem no console do WhatsApp

**Debug:**
```javascript
// No console do WhatsApp Web
document.getElementById('x1flox-marker')  // Deve existir
window.__X1FLOX_INJECTED__  // Deve ser true
window.__X1FLOX_VERSION__   // Deve ter versão
```

**Soluções:**
- Verificar web_accessible_resources no manifest
- Verificar CSP não está bloqueando
- Recarregar extensão E página do WhatsApp

#### 3. WPPConnect não carrega

**Sintomas:**
```
[X1Flox Loader] WPP available: false
❌ WPP library not loaded
```

**Debug:**
```bash
# Verificar arquivo existe
ls -la dist/wppconnect-wa.js  # Deve ter ~450KB

# Verificar manifest
cat dist/manifest.json | jq '.web_accessible_resources'
```

**Soluções:**
- Adicionar "wppconnect-wa.js" ao web_accessible_resources
- Rebuild com vite.config.ts correto
- Verificar viteStaticCopy está configurado

#### 4. Áudio não envia

**Sintomas:**
- Gravação funciona mas envio falha
- Mensagem fica em "loading"

**Debug:**
```javascript
// No console do WhatsApp Web
window.WPP  // Deve existir e ter .chat.sendFileMessage

// Testar manualmente
const chat = Store.Chat.getActive();
console.log(chat.id._serialized);  // Deve ter ID válido
```

**Soluções:**
- Verificar WPPConnect está carregado
- Verificar formato do audioData (base64)
- Verificar chatId é válido
- Ver docs/AUDIO_PTT_SOLUTION.md

#### 5. IndexedDB errors

**Sintomas:**
```
Failed to execute 'transaction' on 'IDBDatabase'
QuotaExceededError
```

**Debug:**
```javascript
// No console da extension (Options/Popup)
import { db } from './utils/db';

// Ver tamanho do DB
navigator.storage.estimate().then(estimate => {
  console.log('Usage:', estimate.usage);
  console.log('Quota:', estimate.quota);
});

// Listar todas as mensagens
db.messages.toArray().then(console.table);
```

**Soluções:**
- Limpar dados antigos
- Implementar garbage collection
- Comprimir áudios antes de salvar
- Usar chrome.storage para metadados

---

## 🤝 Contribuindo

### Code Style

**TypeScript:**
```typescript
// ✅ Use type annotations
function sendMessage(content: string, chatId: string): Promise<void> {
  // ...
}

// ✅ Use interfaces
interface Message {
  id?: number;
  title: string;
  type: 'text' | 'audio';
}

// ✅ Avoid any
// ❌ Bad
let data: any = getData();

// ✅ Good
let data: Message = getData();

// ✅ Use async/await ao invés de .then()
// ❌ Bad
db.messages.get(id).then(msg => {
  sendMessage(msg);
});

// ✅ Good
const msg = await db.messages.get(id);
await sendMessage(msg);
```

**React:**
```typescript
// ✅ Use functional components
function MessageCard({ message }: { message: Message }) {
  const [playing, setPlaying] = useState(false);
  // ...
}

// ✅ Use hooks
useEffect(() => {
  loadMessages();
}, []);

// ✅ Cleanup effects
useEffect(() => {
  const timer = setTimeout(() => {}, 1000);
  return () => clearTimeout(timer);  // Cleanup
}, []);

// ✅ Memoize expensive computations
const filteredMessages = useMemo(() => {
  return messages.filter(m => m.tags.includes(selectedTag));
}, [messages, selectedTag]);
```

**Comments:**
```typescript
// ✅ Comentários explicam "por quê", não "o quê"
// Bad:
// Incrementa counter
counter++;

// Good:
// Reset counter após 5 tentativas para prevenir loop infinito
if (counter > 5) counter = 0;

// ✅ Doc comments para funções públicas
/**
 * Send text message to active WhatsApp chat
 * @param content - Message text
 * @returns Promise that resolves when message is sent
 * @throws Error if no active chat
 */
async function sendTextMessage(content: string): Promise<void> {
  // ...
}
```

### Commit Messages

**Format:**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: Nova funcionalidade
- `fix`: Bug fix
- `docs`: Documentação
- `style`: Formatação, missing semi colons, etc
- `refactor`: Code refactoring
- `test`: Adicionar testes
- `chore`: Manutenção, build, etc

**Exemplos:**
```bash
feat(audio): add audio recording with waveform display

- Implement MediaRecorder API integration
- Add real-time waveform visualization
- Support OGG and WebM formats

Closes #123

---

fix(storage): prevent quota exceeded errors

- Add check before saving large audio files
- Implement compression for audio > 5MB
- Show warning to user when quota is low

Fixes #456

---

docs: add troubleshooting guide for audio PTT

Added comprehensive guide covering:
- Common issues with audio sending
- WPPConnect integration problems
- CSP and web_accessible_resources errors

---

refactor(content): separate Store accessor from page script

- Extract Store API access to dedicated file
- Improve maintainability when WhatsApp updates
- Add better error handling

No functional changes.
```

### Pull Request Process

1. **Create branch**
   ```bash
   git checkout -b feature/minha-feature
   ```

2. **Develop & test**
   - Write code
   - Test manually
   - Add comments

3. **Commit**
   ```bash
   git add .
   git commit -m "feat: descrição da feature"
   ```

4. **Push**
   ```bash
   git push origin feature/minha-feature
   ```

5. **Create PR**
   - Descrever mudanças
   - Adicionar screenshots/videos se UI
   - Referenciar issues

6. **Code Review**
   - Endereçar feedback
   - Make changes
   - Push updates

7. **Merge**
   - Squash commits se muitos pequenos
   - Merge to main

---

## 🚢 Deployment

### Build para Produção

```bash
# Clean build
rm -rf dist
npm run build

# Verificar dist/
ls -la dist/
du -sh dist/  # Tamanho total

# Testar extensão
# 1. Carregar dist/ no Chrome
# 2. Testar todas funcionalidades
# 3. Verificar erros no console
```

### Checklist de Release

- [ ] Todos os testes passam
- [ ] Sem console errors
- [ ] Documentação atualizada
- [ ] CHANGELOG.md atualizado
- [ ] Version bump no manifest.json
- [ ] Git tag criada
- [ ] Build final testado

### Versionamento

**Seguir Semantic Versioning (semver):**
- `MAJOR.MINOR.PATCH` (ex: 1.2.3)
- **MAJOR**: Breaking changes
- **MINOR**: New features, backwards compatible
- **PATCH**: Bug fixes, backwards compatible

**Exemplo:**
```json
// manifest.json
{
  "version": "1.0.0",  // Initial release
  "version": "1.1.0",  // Added audio recording
  "version": "1.1.1",  // Fixed audio bug
  "version": "2.0.0"   // Changed storage schema (breaking)
}
```

### Publicar na Chrome Web Store

1. **Preparar assets:**
   - Screenshots (1280x800 ou 640x400)
   - Promotional images
   - Icon em múltiplos tamanhos

2. **Criar ZIP:**
   ```bash
   cd dist
   zip -r ../x1flox-v1.0.0.zip .
   ```

3. **Upload:**
   - Ir para [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
   - Create new item
   - Upload ZIP
   - Preencher metadata
   - Submit for review

4. **Aguardar review:**
   - Geralmente leva alguns dias
   - Verificar email para updates

---

## 📚 Recursos Úteis

### Documentação Oficial

- [Chrome Extensions Docs](https://developer.chrome.com/docs/extensions/)
- [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [React Docs](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Guide](https://vitejs.dev/guide/)

### Libraries

- [Dexie.js](https://dexie.org/) - IndexedDB wrapper
- [WPPConnect](https://wppconnect.io/wa-js/) - WhatsApp automation

### Tools

- [React DevTools](https://react.dev/learn/react-developer-tools)
- [Chrome Extension Source Viewer](https://chrome.google.com/webstore/detail/chrome-extension-source-v/jifpbeccnghkjeaalbbjmodiffmgedin)
- [JSON Validator](https://jsonlint.com/) - Validar manifest.json

### Community

- [Stack Overflow - chrome-extension tag](https://stackoverflow.com/questions/tagged/google-chrome-extension)
- [Reddit - r/chrome_extensions](https://www.reddit.com/r/chrome_extensions/)

---

## 🎓 Learning Path

**Para novos desenvolvedores:**

1. **Week 1: Setup & Basics**
   - Setup ambiente de desenvolvimento
   - Entender estrutura do projeto
   - Ler docs/ARCHITECTURE.md
   - Fazer pequenas mudanças de UI

2. **Week 2: React & Storage**
   - Entender components React
   - Aprender Dexie/IndexedDB
   - Criar nova mensagem
   - Editar mensagem existente

3. **Week 3: Content Scripts**
   - Entender ISOLATED vs MAIN world
   - Ler docs/AUDIO_PTT_SOLUTION.md
   - Debugar no console do WhatsApp
   - Entender Store API

4. **Week 4: Advanced Features**
   - Implementar nova feature
   - Integrar com WPPConnect
   - Fazer PR
   - Code review

---

**Documento mantido por:** Equipe de Desenvolvimento
**Última atualização:** 2025-01-21
**Versão:** 1.0

**Dúvidas?** Abra uma issue no GitHub ou consulte a documentação adicional em `docs/`.
