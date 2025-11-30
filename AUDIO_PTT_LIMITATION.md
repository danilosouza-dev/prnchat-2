# Limitação: Envio de Áudio PTT no WhatsApp Web

## Problema Identificado

O envio de mensagens de áudio PTT (Push-to-Talk) via extensão apresenta as seguintes limitações técnicas:

### 1. Incompatibilidade de Formato
- **WhatsApp Web nativo**: Grava e envia áudio em formato `audio/ogg; codecs=opus` (.ogg)
- **Chrome MediaRecorder API**: Só suporta gravação em `audio/webm; codecs=opus` (.webm)
- **Resultado**: O WhatsApp Web rejeita áudios em formato WebM para mensagens PTT

### 2. Erros Observados
```
sendMediaMsgToChat failed: Cannot read properties of undefined (reading 'toLogString')
Upload error: Minified invariant #56330
```

Estes erros ocorrem porque:
- O upload de mídia falha (formato incorreto)
- A mensagem é criada localmente mas sem arquivo anexado
- O áudio aparece "carregando" infinitamente no chat

### 3. Logs de Debug
```
✅ Blob created: 78542 bytes, type: audio/webm  ← PROBLEMA
✅ File created: ptt-1763692678384.webm          ← PROBLEMA
⚠️ sendMediaMsgToChat failed
⚠️ Upload error: Minified invariant
```

## Tentativas de Solução

### ✅ O que funcionou
- Envio de mensagens de texto (100% funcional)
- Gravação de áudio (funciona perfeitamente)
- Criação da mensagem PTT (aparece no chat)

### ❌ O que não funcionou
1. **Forçar tipo PTT após MediaPrep** (baseado em whatsapp-web.js)
   - Código: `mediaPrep.mediaData.type = 'ptt'`
   - Resultado: Upload falha devido ao formato WebM

2. **Upload manual com uploadMediaWithPrep**
   - Erro React: `Minified invariant #56330`
   - WhatsApp rejeita o arquivo WebM

3. **Envio direto via sendMediaMsgToChat**
   - Erro: `Cannot read properties of undefined (reading 'toLogString')`
   - API espera objeto chat diferente

## Soluções Possíveis

### Opção 1: Conversão WebM → OGG (Complexa)
**Prós:**
- Funcionaria 100% como PTT nativo
- Formato correto aceito pelo WhatsApp

**Contras:**
- Requer FFmpeg.wasm (~8-10 MB)
- Processamento pesado no browser
- Aumenta tempo de envio significativamente

**Implementação:**
```bash
npm install @ffmpeg/ffmpeg @ffmpeg/core
```

### Opção 2: Envio como Arquivo de Áudio (Recomendada)
**Prós:**
- Simples de implementar
- WhatsApp aceita WebM para arquivos de áudio
- Não requer bibliotecas externas
- Funciona imediatamente

**Contras:**
- Não aparece como "mensagem de voz" (PTT)
- Aparece como "arquivo de áudio"
- Não tem a visualização de forma de onda

### Opção 3: Usar WhatsApp Web API Nativa
**Prós:**
- Usa o gravador nativo do WhatsApp
- Formato correto automaticamente

**Contras:**
- Mais complexo de implementar
- Requer interação DOM profunda
- Pode quebrar com updates do WhatsApp

## Recomendação Atual

**Para implementação imediata:**
1. Manter mensagens de texto (funcionam perfeitamente)
2. Implementar Opção 2: Envio como arquivo de áudio
3. Adicionar nota na UI explicando a diferença

**Para versão futura:**
1. Avaliar implementação de FFmpeg.wasm
2. Ou esperar que WhatsApp Web aceite WebM para PTT
3. Ou usar API oficial do WhatsApp Business

## Status Atual

- ✅ Texto: **Funcionando**
- ⚠️ Áudio PTT: **Limitação técnica** (envia mas fica carregando)
- 🔄 Áudio como arquivo: **Implementação pendente**

## Referências

- Issue whatsapp-web.js: https://github.com/pedroslopez/whatsapp-web.js/issues/160
- MediaRecorder API: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- Formato OGG/Opus: https://opus-codec.org/
