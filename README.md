# PrinChat - WhatsApp Web Automation Chrome Extension

Extensão Chrome para automação do WhatsApp Web que permite enviar mensagens e áudios pré-configurados com um clique.

## 📋 Funcionalidades

### ✅ Implementado

- **Mensagens Pré-configuradas**
  - Criar mensagens de texto e áudio
  - Sistema de tags para organização
  - Busca e filtros
  - Envio com 1 clique

- **Scripts (Sequências)**
  - Criar sequências de mensagens
  - Configurar delays entre mensagens
  - Visualizar duração total estimada
  - Executar scripts completos automaticamente

- **Gatilhos (Beta)**
  - Criar gatilhos baseados em condições
  - Múltiplos tipos de condição (contém, igual, regex, etc.)
  - Executar scripts automaticamente

- **Armazenamento**
  - Armazenamento local via IndexedDB
  - Exportar/Importar dados (backup)
  - Suporte a arquivos de áudio (Blob storage)

- **Interface**
  - Popup compacto para acesso rápido
  - Página de opções completa com tabs
  - Design inspirado no WhatsApp
  - Gravação de áudio via microfone
  - Upload de arquivos de áudio

### 🔜 Planejado

- Armazenamento em nuvem (Supabase/S3)
- Templates dinâmicos com variáveis
- Monitoramento de gatilhos em tempo real
- Estatísticas de uso
- Atalhos de teclado

## 🏗️ Arquitetura

### Visão Geral

O PrinChat usa uma arquitetura multi-camadas para integração profunda com WhatsApp Web:

```
┌─────────────┐
│ React UI    │  Popup & Options (TypeScript + React)
└──────┬──────┘
       │ chrome.runtime.sendMessage()
       ▼
┌─────────────┐
│Service      │  Background worker (Manifest V3)
│Worker       │  Message routing
└──────┬──────┘
       │ chrome.tabs.sendMessage()
       ▼
┌─────────────┐
│Content      │  ISOLATED world → Bridge
│Script       │  Injeta scripts no MAIN world
└──────┬──────┘
       │ DOM injection + CustomEvents
       ▼
┌─────────────┐
│Page Script  │  MAIN world → Acessa WhatsApp APIs
│+ WPPConnect │  Store API + WPPConnect para mídia
└─────────────┘
```

### Decisões Técnicas

1. **Manifest V3**: Service workers ao invés de background pages persistentes

2. **TypeScript + React**: Type-safety e componentização para UI complexa

3. **IndexedDB (Dexie)**: Armazenamento de Blobs (áudios) sem limite de quota

4. **Vite**: Build rápido com HMR e otimizações automáticas

5. **Content Script no MAIN World**: Única forma de acessar WhatsApp Store API

6. **WPPConnect**: Biblioteca especializada que contorna restrições de upload de mídia

### 📚 Documentação Completa

Para entender profundamente o projeto, consulte:

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Arquitetura completa e decisões técnicas
  - Por que MAIN world ao invés de ISOLATED
  - Sistema de injeção de scripts
  - Integração com WhatsApp Store API
  - Padrões de comunicação
  - IndexedDB schema e estratégias

- **[docs/AUDIO_PTT_SOLUTION.md](docs/AUDIO_PTT_SOLUTION.md)** - Solução do problema de áudio PTT
  - Problema original e sintomas
  - Investigação completa (hipóteses testadas e refutadas)
  - Por que formato NÃO era o problema
  - Como WhatsApp bloqueia uploads automatizados
  - Solução com WPPConnect (passo-a-passo)
  - Troubleshooting e lições aprendidas

- **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** - Guia completo de desenvolvimento
  - Setup do ambiente
  - Estrutura de código detalhada
  - Workflow de desenvolvimento
  - Testing e debugging
  - Como contribuir
  - Deployment e versionamento

## 🚀 Setup e Desenvolvimento

### Pré-requisitos

- Node.js 18+
- npm ou yarn
- Google Chrome ou Chromium

### Instalação

```bash
# Clone o repositório
git clone <repository-url>
cd princhat

# Instale as dependências
npm install
```

### Desenvolvimento

```bash
# Build em modo desenvolvimento (com watch)
npm run dev

# Build para produção
npm run build

# Type checking
npm run type-check
```

### Carregar a Extensão no Chrome

1. Execute `npm run build` para gerar a pasta `dist/`

2. Abra o Chrome e navegue para `chrome://extensions/`

3. Ative o "Modo do desenvolvedor" (canto superior direito)

4. Clique em "Carregar sem compactação"

5. Selecione a pasta `dist/`

6. A extensão estará carregada e pronta para uso!

### Desenvolvimento com Hot Reload

```bash
# Em um terminal, execute:
npm run dev

# A cada mudança nos arquivos, o build será refeito automaticamente
# Você precisará clicar em "Recarregar" na página chrome://extensions/
# para ver as mudanças na extensão
```

## 📁 Estrutura do Projeto

```
princhat/
├── public/
│   ├── manifest.json          # Manifest V3 da extensão
│   └── icons/                 # Ícones da extensão
├── src/
│   ├── types/                 # TypeScript types e interfaces
│   │   └── index.ts
│   ├── storage/               # Camada de armazenamento
│   │   ├── db.ts             # IndexedDB wrapper
│   │   └── chrome-storage.ts # Chrome storage wrapper
│   ├── utils/                 # Funções utilitárias
│   │   └── helpers.ts
│   ├── popup/                 # Popup UI
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   ├── styles.css
│   │   └── components/
│   ├── options/               # Options page UI
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   ├── styles.css
│   │   ├── tabs/             # Tabs: Messages, Scripts, Triggers, Settings
│   │   └── components/        # AudioRecorder, TagManager, etc.
│   ├── content/               # Content script
│   │   └── whatsapp-injector.ts
│   └── background/            # Service worker
│       └── service-worker.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 🎯 Como Usar

### 1. Criar Mensagens

1. Clique no ícone da extensão e em "Gerenciar Mensagens e Scripts"
2. Na aba **Mensagens**, clique em "Nova Mensagem"
3. Escolha o tipo (Texto ou Áudio)
4. Para áudio: grave via microfone ou faça upload
5. Adicione tags para organizar
6. Salve a mensagem

### 2. Criar Scripts

1. Na aba **Scripts**, clique em "Novo Script"
2. Adicione mensagens na ordem desejada
3. Configure o delay entre cada mensagem
4. Veja a duração total estimada
5. Salve o script

### 3. Enviar Mensagens

1. Abra o WhatsApp Web (web.whatsapp.com)
2. Selecione um chat
3. Clique no ícone da extensão
4. Busque a mensagem desejada
5. Clique em "Enviar"

### 4. Executar Scripts

1. No popup, selecione um script no dropdown
2. Clique no botão de play (▶️)
3. O script será executado automaticamente

### 5. Configurar Gatilhos (Beta)

1. Na aba **Gatilhos**, crie um novo gatilho
2. Defina as condições (ex: "contém 'preço'")
3. Selecione o script a executar
4. Ative o gatilho

## ⚠️ Limitações e Avisos

1. **Dependência do WhatsApp Web**: A extensão depende da estrutura do DOM do WhatsApp Web. Se o WhatsApp atualizar significativamente sua interface, os seletores CSS podem precisar de ajustes.

2. **Detecção de Automação**: O WhatsApp pode detectar automação. Use com responsabilidade e evite spam.

3. **Áudios**: O envio de áudios simula upload de arquivo. Pode ter comportamento diferente de mensagens de voz gravadas diretamente no WhatsApp.

4. **Gatilhos**: A funcionalidade de gatilhos está em beta e requer desenvolvimento adicional para monitoramento em tempo real.

## 🐛 Troubleshooting

### A extensão não envia mensagens

- Verifique se está em web.whatsapp.com
- Confirme que há um chat selecionado
- Abra o Console (F12) e verifique erros
- Recarregue a extensão em chrome://extensions/

### Áudio não é enviado

- Verifique o formato do arquivo (recomendado: .webm, .mp3, .ogg)
- Tamanho máximo recomendado: 16MB
- Teste primeiro com upload manual no WhatsApp

### Build falha

```bash
# Limpe node_modules e reinstale
rm -rf node_modules
npm install

# Limpe cache e rebuild
rm -rf dist
npm run build
```

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Faça fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/NovaFeature`)
3. Commit suas mudanças (`git commit -m 'Add: Nova feature'`)
4. Push para a branch (`git push origin feature/NovaFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto é fornecido "como está" para fins educacionais e de desenvolvimento.

## 🔐 Segurança e Privacidade

- **Dados Locais**: Todos os dados são armazenados localmente no navegador via IndexedDB
- **Sem Telemetria**: A extensão não coleta ou envia dados para servidores externos
- **Permissões Mínimas**: Solicita apenas permissões necessárias (storage, activeTab, scripting)
- **Open Source**: Código aberto para auditoria de segurança

## 📞 Suporte

Para reportar bugs ou solicitar features, abra uma issue no repositório.

---

**Desenvolvido com TypeScript, React e ❤️**
