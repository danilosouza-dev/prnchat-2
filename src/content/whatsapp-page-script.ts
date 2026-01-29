/**
 * PrinChat - WhatsApp Page Context Script
 * This script runs in the page context (world: MAIN)
 * Uses window.Store (WhatsApp's internal API) to send messages invisibly
 */

(function () {
  'use strict';

  // Configuration
  const DEBUG_MODE = false; // Set to true to enable debug panel
  const MAX_VIDEO_SIZE_MB = 16; // WhatsApp video size limit

  const scriptVersion = 'v2.0-' + Date.now();
  console.log('[PrinChat Page] Starting initialization, version:', scriptVersion);

  // Always allow execution - we'll handle duplicate listeners individually
  // This ensures the script runs after page reload/navigation
  (window as any).__PRINCHAT_VERSION__ = scriptVersion;
  (window as any).__PRINCHAT_INJECTED__ = true;

  // Debug panel (only in debug mode)
  if (DEBUG_MODE) {
    const debugPanel = document.createElement('div');
    debugPanel.id = 'princhat-debug-panel';
    debugPanel.style.cssText = `
      position: fixed; top: 10px; right: 10px; width: 400px; max-height: 80vh;
      overflow-y: auto; background: rgba(0, 0, 0, 0.9); color: #00ff00;
      padding: 15px; z-index: 999999; font-family: monospace; font-size: 11px;
      border: 2px solid #00ff00; border-radius: 8px;
    `;
    debugPanel.innerHTML = `<h3 style="margin: 0 0 10px 0;">PRINCHAT DEBUG</h3><div id="princhat-debug-logs"></div>`;
    document.body.appendChild(debugPanel);
  }

  // Console filter to suppress WPPConnect errors
  const originalConsoleError = console.error;
  console.error = function (...args) {
    const errorString = args.map(arg => String(arg)).join(' ');
    if (errorString.includes('getSearchVerifiedName') || errorString.includes('getHeader')) {
      return; // Suppress known WPPConnect library errors
    }
    originalConsoleError.apply(console, args);
  };

  const debugLog = (_msg: string, _color = '#00ff00') => {
    if (DEBUG_MODE) {
      const logsDiv = document.getElementById('princhat-debug-logs');
      if (logsDiv) {
        const time = new Date().toLocaleTimeString();
        logsDiv.innerHTML += `<div style="color: ${_color};">[${time}] ${_msg}</div>`;
        logsDiv.scrollTop = logsDiv.scrollHeight;
      }
    }
  };

  // Wait for Store to be ready
  async function waitForStore() {
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        const Store = (window as any).Store;
        if (Store && Store.Chat && Store.SendMessage && Store.MsgKey) {
          clearInterval(checkInterval);
          resolve();
        } else if ((window as any).__PRINCHAT_STORE_READY__) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 500);
    });
  }

  // Helper to ensure Store.Label is available (crucial for Tags)
  async function ensureLabels() {
    console.log('[PrinChat] ensureLabels called');
    const Store = (window as any).Store;
    if (Store && Store.Label) return;

    const WPP = (window as any).WPP;
    console.log('[PrinChat] Store.Label missing. WPP available?', !!WPP);

    // Strategy A: Use WPP.webpack to find LabelCollection
    if (WPP && WPP.webpack) {
      try {
        console.log('[PrinChat] Searching modules via WPP.webpack...');
        // Search for module containing LabelCollection
        // Usually exports { LabelCollection: ... } or default { LabelCollection: ... }
        const labelModule = WPP.webpack.search((m: any) => (
          (m.LabelCollection && m.LabelCollection.models) ||
          (m.default && m.default.LabelCollection && m.default.LabelCollection.models) ||
          (m.LabelCollection && m.LabelCollection.get)
        ));

        if (labelModule) {
          const found = labelModule.LabelCollection || (labelModule.default && labelModule.default.LabelCollection);
          if (found) {
            Store.Label = found;
            console.log('[PrinChat] ✅ Found and assigned Store.Label using WPP.webpack');
            return;
          }
        }
      } catch (e) { console.error('[PrinChat] Error searching WPP webpack for Label:', e); }
    }

    // Strategy B: Manual Webpack Search (if WPP fails or is missing)
    try {
      const chunk = (window as any).webpackChunkwhatsapp_web_client;
      if (chunk && Array.isArray(chunk)) {
        console.log('[PrinChat] Searching modules via manual webpack chunk...');
        let foundLabel: any = null;

        // Push a module request to access require
        chunk.push([
          ['princhat_label_finder_' + Date.now()],
          {},
          (require: any) => {
            if (require.m) {
              const modules = require.m;
              for (const id in modules) {
                try {
                  const mod = require(id);
                  if (!mod) continue;

                  // Check both default and direct exports
                  const exports = [mod, mod.default];
                  for (const exp of exports) {
                    if (!exp) continue;

                    // Heuristics for LabelCollection
                    if (exp.LabelCollection && (exp.LabelCollection.get || exp.LabelCollection.models)) {
                      foundLabel = exp.LabelCollection;
                      break;
                    }

                    // Sometimes it's the default export itself
                    if (exp.get && exp.models && exp.add && exp.remove && (exp.checksum !== undefined || exp.length !== undefined)) {
                      // Candidate for a Collection. Check if it has 'label' in it? Hard to know without strings.
                      // But LabelCollection is usually the only one managing labels.
                      // Let's assume look for a specific property if we knew it.
                    }
                  }
                  if (foundLabel) break;
                } catch (e) { /* ignore require errors */ }
              }
            }
          }
        ]);

        if (foundLabel) {
          Store.Label = foundLabel;
          console.log('[PrinChat] ✅ Found and assigned Store.Label using manual webpack search');
        }
      }
    } catch (e) { console.error('[PrinChat] Manual webpack search failed:', e); }

    if (!Store.Label) {
      console.warn('[PrinChat] ❌ CULT NOT FIND STORE.LABEL (Tags will be missing names)');
    }
  }

  // Helper functions for chat presence simulation
  async function simulateTyping(chat: any, durationMs: number = 3000) {
    const Store = (window as any).Store;
    console.log('[PrinChat] simulateTyping called - duration:', durationMs, 'ms');
    console.log('[PrinChat] Store.ChatState available?', !!Store.ChatState);
    console.log('[PrinChat] WPP.chat.markIsComposing available?', !!((window as any).WPP?.chat?.markIsComposing));

    try {
      // Try different methods to set typing state
      if (Store.ChatState) {
        console.log('[PrinChat] ✅ Using Store.ChatState for typing simulation');
        await Store.ChatState.sendChatStateComposing(chat.id);
        console.log('[PrinChat] Typing state set, waiting', durationMs, 'ms...');

        // Wait for the specified duration
        await new Promise(resolve => setTimeout(resolve, durationMs));

        // Stop typing
        console.log('[PrinChat] Stopping typing state...');
        await Store.ChatState.sendChatStatePaused(chat.id);
        console.log('[PrinChat] ✅ Typing simulation complete');
      } else if ((window as any).WPP?.chat?.markIsComposing) {
        console.log('[PrinChat] ✅ Using WPP.chat.markIsComposing for typing simulation');
        await (window as any).WPP.chat.markIsComposing(chat.id._serialized || chat.id, durationMs);
        console.log('[PrinChat] ✅ Typing simulation complete via WPP');
      } else {
        console.warn('[PrinChat] ⚠️ No typing simulation API available (Store.ChatState and WPP.chat.markIsComposing not found)');
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[PrinChat] ❌ Error simulating typing:', errorMessage, error);
      // Continue anyway - non-critical feature
    }
  }

  async function simulateRecording(chat: any, durationMs: number = 3000) {
    const Store = (window as any).Store;
    console.log('[PrinChat] simulateRecording called - duration:', durationMs, 'ms');
    console.log('[PrinChat] Store.ChatState available?', !!Store.ChatState);
    console.log('[PrinChat] WPP.chat.markIsRecording available?', !!((window as any).WPP?.chat?.markIsRecording));

    try {
      // Try different methods to set recording state
      if (Store.ChatState) {
        console.log('[PrinChat] ✅ Using Store.ChatState for recording simulation');
        await Store.ChatState.sendChatStateRecording(chat.id);
        console.log('[PrinChat] Recording state set, waiting', durationMs, 'ms...');

        // Wait for the specified duration
        await new Promise(resolve => setTimeout(resolve, durationMs));

        // Stop recording
        console.log('[PrinChat] Stopping recording state...');
        await Store.ChatState.sendChatStatePaused(chat.id);
        console.log('[PrinChat] ✅ Recording simulation complete');
      } else if ((window as any).WPP?.chat?.markIsRecording) {
        console.log('[PrinChat] ✅ Using WPP.chat.markIsRecording for recording simulation');
        await (window as any).WPP.chat.markIsRecording(chat.id._serialized || chat.id, durationMs);
        console.log('[PrinChat] ✅ Recording simulation complete via WPP');
      } else {
        console.warn('[PrinChat] ⚠️ No recording simulation API available (Store.ChatState and WPP.chat.markIsRecording not found)');
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[PrinChat] ❌ Error simulating recording:', errorMessage, error);
      // Continue anyway - non-critical feature
    }
  }

  // Initialize after Store loads
  waitForStore().then(async () => {
    const Store = (window as any).Store;

    // Ensure Labels are loaded (Critical for tags)
    await ensureLabels();

    // Track active animations for cancellation
    const activeAnimations = new Map<string, { stopAnimation: () => Promise<void> }>();
    // Track active animations by chatId to prevent overlapping animations on same chat
    const activeChatAnimations = new Map<string, string>(); // chatId -> messageId

    // Listen for animation start requests (NEW ARCHITECTURE)
    document.addEventListener('PrinChatStartAnimation', async (event: any) => {
      try {
        const { messageId, chatId, animationType, duration } = event.detail;

        const chat = await Store.Chat.find(chatId);
        if (!chat) {
          console.error('[PrinChat Page] Chat not found:', chatId);
          return;
        }

        // Start animation based on type - simplified, no complex state management
        if (animationType === 'typing') {
          // Start typing animation (it will run for the specified duration)
          const animationPromise = simulateTyping(chat, duration);
          const stopAnimation = async () => {
            // Stop typing by sending paused state
            if (Store.ChatState) {
              await Store.ChatState.sendChatStatePaused(chat.id);
            }
          };

          activeAnimations.set(messageId, { stopAnimation });
          activeChatAnimations.set(chatId, messageId);

          // Animation runs in background, don't await
          animationPromise
            .then(() => {
              // Clean up when animation completes naturally
              activeAnimations.delete(messageId);
              if (activeChatAnimations.get(chatId) === messageId) {
                activeChatAnimations.delete(chatId);
              }
            })
            .catch((err: any) => {
              console.error('[PrinChat Page] Animation error:', err);
              // Clean up on error too
              activeAnimations.delete(messageId);
              if (activeChatAnimations.get(chatId) === messageId) {
                activeChatAnimations.delete(chatId);
              }
            });
        } else if (animationType === 'recording') {
          // Start recording animation
          const animationPromise = simulateRecording(chat, duration);
          const stopAnimation = async () => {
            // Stop recording by sending paused state
            if (Store.ChatState) {
              await Store.ChatState.sendChatStatePaused(chat.id);
            }
          };

          activeAnimations.set(messageId, { stopAnimation });
          activeChatAnimations.set(chatId, messageId);

          // Animation runs in background, don't await
          animationPromise
            .then(() => {
              // Clean up when animation completes naturally
              activeAnimations.delete(messageId);
              if (activeChatAnimations.get(chatId) === messageId) {
                activeChatAnimations.delete(chatId);
              }
            })
            .catch((err: any) => {
              console.error('[PrinChat Page] Animation error:', err);
              // Clean up on error too
              activeAnimations.delete(messageId);
              if (activeChatAnimations.get(chatId) === messageId) {
                activeChatAnimations.delete(chatId);
              }
            });
        }
      } catch (error: any) {
        console.error('[PrinChat Page] Error starting animation:', error);
      }
    });

    // Listen for animation stop requests (NEW ARCHITECTURE)
    document.addEventListener('PrinChatStopAnimation', async (event: any) => {
      try {
        const { messageId, chatId } = event.detail;
        console.log('[PrinChat Page] Stopping animation for message:', messageId);

        const animation = activeAnimations.get(messageId);
        if (animation) {
          await animation.stopAnimation();
          activeAnimations.delete(messageId);

          // Clean up chat animation tracking
          if (chatId && activeChatAnimations.get(chatId) === messageId) {
            activeChatAnimations.delete(chatId);
          }
        }
      } catch (error: any) {
        console.error('[PrinChat Page] Error stopping animation:', error);
      }
    });

    // Helper function to apply WhatsApp formatting to signature text
    function applySignatureFormatting(text: string, formatting: any): string {
      let formatted = text;

      // Apply formats in correct order for WhatsApp (innermost to outermost)
      // Order matters for proper nesting: monospace -> strikethrough -> italic -> bold

      if (formatting.monospace) {
        formatted = `\`\`\`${formatted}\`\`\``;
      }
      if (formatting.strikethrough) {
        formatted = `~${formatted}~`;
      }
      if (formatting.italic) {
        formatted = `_${formatted}_`;
      }
      if (formatting.bold) {
        formatted = `*${formatted}*`;
      }

      return formatted;
    }

    // Helper function to get active signature (async via custom event)
    async function getActiveSignature(): Promise<any | null> {
      return new Promise((resolve) => {
        const requestId = `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Listen for response
        const responseHandler = (event: any) => {
          if (event.detail.requestId === requestId) {
            document.removeEventListener('PrinChatSignatureResponse', responseHandler);
            resolve(event.detail.signature || null);
          }
        };

        document.addEventListener('PrinChatSignatureResponse', responseHandler);

        // Request active signature
        document.dispatchEvent(new CustomEvent('PrinChatGetActiveSignature', {
          detail: { requestId }
        }));

        // Timeout after 1 second
        setTimeout(() => {
          document.removeEventListener('PrinChatSignatureResponse', responseHandler);
          resolve(null);
        }, 1000);
      });
    }

    // Listen for message send requests
    document.addEventListener('PrinChatSendMessage', async (event: any) => {
      try {
        let { text, requestId, chatId } = event.detail;

        // Get active signature and append if exists
        console.log('[PrinChat Page] 🔍 Checking for active signature...');
        try {
          const activeSignature = await getActiveSignature();
          console.log('[PrinChat Page] 🔍 Active signature response:', activeSignature);

          if (activeSignature && activeSignature.text) {
            console.log('[PrinChat Page] ✅ Active signature found:', activeSignature.text);
            console.log('[PrinChat Page] 🔍 Signature formatting:', activeSignature.formatting);
            console.log('[PrinChat Page] 🔍 Signature spacing:', activeSignature.spacing);

            // Apply spacing (line breaks)
            const spacing = '\n'.repeat(activeSignature.spacing || 1);

            // Apply formatting to signature text
            const formattedSignature = applySignatureFormatting(
              activeSignature.text,
              activeSignature.formatting || {}
            );

            console.log('[PrinChat Page] 🔍 Formatted signature:', formattedSignature);
            console.log('[PrinChat Page] 🔍 Original text:', text);

            // Prepend signature to message (signature comes FIRST, then message)
            // Format: "Name:\n\nMessage content"
            text = formattedSignature + ':' + spacing + text;
            console.log('[PrinChat Page] ✅ Message with signature:', text);
          } else {
            console.log('[PrinChat Page] ℹ️ No active signature found or signature is empty');
          }
        } catch (sigError) {
          console.error('[PrinChat Page] ❌ Error getting signature:', sigError);
          // Continue sending without signature
        }

        let targetChat;
        if (chatId) {
          // Use specific chat if provided
          targetChat = await Store.Chat.find(chatId);
          if (!targetChat) throw new Error(`Chat ${chatId} not found`);
        } else {
          // Use active chat if no chatId provided
          targetChat = Store.Chat.getActive();
          if (!targetChat) throw new Error('No active chat');
        }

        // NEW ARCHITECTURE: Animation and delay already handled by overlay
        // Animation is running in parallel (if showTyping was true)
        // Just send the message immediately
        // Note: sendDelay should always be 0 here (delay processed in overlay)

        let currentUser = Store.Me;
        if (!currentUser && Store.UserPrefs?.getMaybeMePnUser) {
          currentUser = Store.UserPrefs.getMaybeMePnUser();
        }

        const msgId = await Store.genId();
        const newMsgId = Store.MsgKey.from({
          fromMe: true,
          remote: targetChat.id,
          id: msgId,
          participant: undefined
        });

        const message = {
          id: newMsgId,
          ack: 0,
          body: text,
          from: currentUser,
          to: targetChat.id,
          local: true,
          self: 'out',
          t: Math.floor(Date.now() / 1000),
          isNewMsg: true,
          type: 'chat'
        };

        await Store.SendMessage.addAndSendMsgToChat(targetChat, message);

        document.dispatchEvent(new CustomEvent('PrinChatMessageSent', {
          detail: { success: true, requestId, method: 'STORE_API' }
        }));
      } catch (error: any) {
        document.dispatchEvent(new CustomEvent('PrinChatMessageSent', {
          detail: { success: false, error: error.message, requestId: event.detail.requestId }
        }));
      }
    });


    // Listen for audio send requests
    document.addEventListener('PrinChatSendAudio', async (event: any) => {
      let requestId = 'unknown';
      try {
        console.log('[PrinChat Page] Audio send request received:', event.detail);
        const { audioData, duration, requestId: reqId, chatId } = event.detail;
        requestId = reqId;
        console.log('[PrinChat Page] Request ID:', requestId);

        // Determine target chat ID
        let targetChatId: string;
        let targetChat: any = null;

        if (chatId) {
          console.log('[PrinChat Page] Using provided chat ID:', chatId);
          // Use the chatId directly without fetching the full chat object
          targetChatId = chatId;
          // No need to fetch chat - animation handled separately
        } else {
          // Get active chat
          targetChat = Store.Chat.getActive();
          if (!targetChat) throw new Error('No active chat');
          // Extract ID immediately to avoid circular reference issues later
          targetChatId = targetChat.id._serialized || targetChat.id.toString();
          console.log('[PrinChat Page] Using active chat ID:', targetChatId);
        }

        // NEW ARCHITECTURE: Animation and delay already handled by overlay
        // Animation is running in parallel (if showRecording was true)
        // Just send the audio immediately
        // Note: sendDelay should always be 0 here (delay processed in overlay)

        // Convert to Blob
        let audioBlob: Blob;
        let detectedMimeType = 'audio/ogg; codecs=opus';

        if (audioData instanceof Blob || audioData instanceof File) {
          audioBlob = audioData;
          detectedMimeType = audioBlob.type || detectedMimeType;
        } else if (typeof audioData === 'string' && audioData.startsWith('data:')) {
          const base64Data = audioData.split(',')[1];
          const mimeTypeMatch = audioData.match(/data:(.*?);/);
          detectedMimeType = mimeTypeMatch?.[1] || detectedMimeType;
          const binaryData = atob(base64Data);
          const arrayBuffer = new Uint8Array(binaryData.length);
          for (let i = 0; i < binaryData.length; i++) {
            arrayBuffer[i] = binaryData.charCodeAt(i);
          }
          audioBlob = new Blob([arrayBuffer], { type: detectedMimeType });
        } else if (typeof audioData === 'string' && audioData.startsWith('blob:')) {
          const response = await fetch(audioData);
          audioBlob = await response.blob();
          detectedMimeType = audioBlob.type || detectedMimeType;
        } else {
          throw new Error(`Invalid audio data format: ${typeof audioData}`);
        }

        // Validate audio file
        const maxAudioSize = 16 * 1024 * 1024; // 16MB - WhatsApp limit
        if (audioBlob.size === 0) {
          throw new Error('Audio file is empty (0 bytes)');
        }
        if (audioBlob.size > maxAudioSize) {
          throw new Error(`Audio file too large: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB (max 16MB)`);
        }

        console.log('[PrinChat Page] Applying isGroup monkey-patch to prevent stack overflow');

        // CRITICAL FIX: Monkey-patch the isGroup getter on the chat prototype
        // This prevents the infinite recursion bug in WPPConnect
        try {
          // Get chat object first
          if (!targetChat) {
            targetChat = await Store.Chat.find(targetChatId);
            if (!targetChat) throw new Error(`Chat ${targetChatId} not found`);
          }

          console.log('[PrinChat Page] Chat found, applying isGroup fix...');

          // Get the constructor/prototype of the chat object
          const chatProto = Object.getPrototypeOf(targetChat);

          // Check if isGroup is a getter property
          const isGroupDescriptor = Object.getOwnPropertyDescriptor(chatProto, 'isGroup');

          if (isGroupDescriptor && isGroupDescriptor.get) {
            console.log('[PrinChat Page] Found isGroup getter, replacing with safe version...');

            // Replace the buggy getter with a safe one
            Object.defineProperty(chatProto, 'isGroup', {
              get: function () {
                // Safe implementation: check if id contains '@g.us' (group) or '@c.us' (individual)
                try {
                  const idStr = this.id?._serialized || this.id?.toString() || '';
                  return idStr.includes('@g.us');
                } catch {
                  return false; // Default to false if anything fails
                }
              },
              configurable: true,
              enumerable: true
            });

            console.log('[PrinChat Page] ✅ isGroup getter successfully patched!');
          } else {
            console.log('[PrinChat Page] isGroup is not a getter or not found');
          }

          // Also patch it directly on the chat object instance as a fallback
          try {
            const idStr = targetChat.id?._serialized || targetChat.id?.toString() || '';
            Object.defineProperty(targetChat, 'isGroup', {
              value: idStr.includes('@g.us'),
              writable: true,
              configurable: true,
              enumerable: true
            });
            console.log('[PrinChat Page] ✅ isGroup also set directly on chat instance');
          } catch (e) {
            console.log('[PrinChat Page] Could not set isGroup on instance (non-critical)');
          }

        } catch (patchError: any) {
          console.log('[PrinChat Page] Warning: Could not patch isGroup:', patchError.message);
          // Continue anyway - we'll try to send without the patch
        }

        console.log('[PrinChat Page] Audio blob size:', audioBlob.size, 'bytes, type:', detectedMimeType);

        // Create File object for audio (same as original working version)
        const audioFile = new File([audioBlob], `ptt-${Date.now()}.ogg`, {
          type: detectedMimeType,
          lastModified: Date.now()
        });

        console.log('[PrinChat Page] Created audio file:', audioFile.name);

        // Use WPPConnect as it was before when it worked
        const WPP = (window as any).WPP;
        if (!WPP?.chat?.sendFileMessage) {
          throw new Error('WPPConnect not available');
        }

        // Extract chat ID as a clean string to avoid circular reference issues
        const chatIdString = typeof targetChat.id === 'string'
          ? targetChat.id
          : (targetChat.id._serialized || String(targetChat.id));

        console.log('[PrinChat Page] Sending audio file to chat:', chatIdString);
        await WPP.chat.sendFileMessage(
          chatIdString,
          audioFile,
          {
            type: 'audio',
            isPtt: true,
            caption: '',
            sendAudioAsVoice: true,
            duration: duration || 0
          }
        );

        console.log('[PrinChat Page] ✅ Audio sent successfully!');

        document.dispatchEvent(new CustomEvent('PrinChatMessageSent', {
          detail: { success: true, requestId, method: 'STORE_API_PURE' }
        }));
      } catch (error: any) {
        console.error('[PrinChat Page] ❌ ERROR in audio send:', error);
        console.error('[PrinChat Page] Error type:', typeof error);
        console.error('[PrinChat Page] Error message:', error?.message);
        console.error('[PrinChat Page] Error stack:', error?.stack);
        debugLog(`❌ ERROR: ${error?.message || String(error)}`, '#ff0000');
        document.dispatchEvent(new CustomEvent('PrinChatMessageSent', {
          detail: { success: false, error: error?.message || String(error) || 'Unknown error', requestId }
        }));
      }
    });

    // Listen for image send requests
    document.addEventListener('PrinChatSendImage', async (event: any) => {
      let requestId = 'unknown';
      try {
        const { imageData, caption, requestId: reqId, chatId } = event.detail;
        requestId = reqId;

        let targetChat;
        if (chatId) {
          // Use specific chat if provided
          targetChat = await Store.Chat.find(chatId);
          if (!targetChat) throw new Error(`Chat ${chatId} not found`);
        } else {
          // Use active chat if no chatId provided
          targetChat = Store.Chat.getActive();
          if (!targetChat) throw new Error('No active chat');
        }

        // Convert to Blob
        let imageBlob: Blob;
        let detectedMimeType = 'image/jpeg';

        if (imageData instanceof Blob || imageData instanceof File) {
          imageBlob = imageData;
          detectedMimeType = imageBlob.type || detectedMimeType;
        } else if (typeof imageData === 'string' && imageData.startsWith('data:')) {
          const base64Data = imageData.split(',')[1];
          const mimeTypeMatch = imageData.match(/data:(.*?);/);
          detectedMimeType = mimeTypeMatch?.[1] || detectedMimeType;
          const binaryData = atob(base64Data);
          const arrayBuffer = new Uint8Array(binaryData.length);
          for (let i = 0; i < binaryData.length; i++) {
            arrayBuffer[i] = binaryData.charCodeAt(i);
          }
          imageBlob = new Blob([arrayBuffer], { type: detectedMimeType });
        } else if (typeof imageData === 'string' && imageData.startsWith('blob:')) {
          const response = await fetch(imageData);
          imageBlob = await response.blob();
          detectedMimeType = imageBlob.type || detectedMimeType;
        } else {
          throw new Error(`Invalid image data format: ${typeof imageData}`);
        }

        // CRITICAL FIX: Monkey-patch the isGroup getter on the chat prototype
        try {
          console.log('[PrinChat Page] Chat found, applying isGroup fix...');
          const chatProto = Object.getPrototypeOf(targetChat);
          const isGroupDescriptor = Object.getOwnPropertyDescriptor(chatProto, 'isGroup');

          if (isGroupDescriptor && isGroupDescriptor.get) {
            Object.defineProperty(chatProto, 'isGroup', {
              get: function () {
                try {
                  const idStr = this.id?._serialized || this.id?.toString() || '';
                  return idStr.includes('@g.us');
                } catch { return false; }
              },
              configurable: true, enumerable: true
            });
          }

          try {
            const idStr = targetChat.id?._serialized || targetChat.id?.toString() || '';
            Object.defineProperty(targetChat, 'isGroup', {
              value: idStr.includes('@g.us'),
              writable: true, configurable: true, enumerable: true
            });
          } catch (e) { console.log('[PrinChat Page] Could not set isGroup on instance'); }
        } catch (patchError: any) {
          console.log('[PrinChat Page] Warning: Could not patch isGroup:', patchError.message);
        }

        // Determine file extension
        let fileExtension = '.jpg';
        if (detectedMimeType.includes('png')) fileExtension = '.png';
        else if (detectedMimeType.includes('gif')) fileExtension = '.gif';
        else if (detectedMimeType.includes('webp')) fileExtension = '.webp';

        const imageFile = new File([imageBlob], `image-${Date.now()}${fileExtension}`, {
          type: detectedMimeType,
          lastModified: Date.now()
        });

        // Send using WPPConnect
        const WPP = (window as any).WPP;
        if (!WPP?.chat?.sendFileMessage) {
          throw new Error('WPPConnect library not available');
        }

        // Extract chat ID as a clean string to avoid circular reference issues
        const chatIdString = typeof targetChat.id === 'string'
          ? targetChat.id
          : (targetChat.id._serialized || String(targetChat.id));

        console.log('[PrinChat Page] Sending image file to chat:', chatIdString);
        await WPP.chat.sendFileMessage(
          chatIdString,
          imageFile,
          { type: 'image', caption: caption || '' }
        );

        document.dispatchEvent(new CustomEvent('PrinChatMessageSent', {
          detail: { success: true, requestId, method: 'IMAGE' }
        }));
      } catch (error: any) {
        debugLog(`❌ ERROR: ${error.message}`, '#ff0000');
        document.dispatchEvent(new CustomEvent('PrinChatMessageSent', {
          detail: { success: false, error: error.message, requestId }
        }));
      }
    });

    /**
     * VIDEO SEND HANDLER
     *
     * WhatsApp Web requires H.264/AAC codec in MP4 container.
     * Videos with incompatible codecs will fail with "video loaded with duration but no dims".
     */
    document.addEventListener('PrinChatSendVideo', async (event: any) => {
      let requestId = 'unknown';
      try {
        const { videoData, caption, requestId: reqId, chatId } = event.detail;
        requestId = reqId;

        let targetChat;
        if (chatId) {
          // Use specific chat if provided
          targetChat = await Store.Chat.find(chatId);
          if (!targetChat) throw new Error(`Chat ${chatId} not found`);
        } else {
          // Use active chat if no chatId provided
          targetChat = Store.Chat.getActive();
          if (!targetChat) throw new Error('No active chat');
        }

        // Convert to Blob
        let videoBlob: Blob;
        let detectedMimeType = 'video/mp4';

        if (videoData instanceof Blob || videoData instanceof File) {
          videoBlob = videoData;
          detectedMimeType = videoBlob.type || detectedMimeType;
        } else if (typeof videoData === 'string' && videoData.startsWith('data:')) {
          const base64Data = videoData.split(',')[1];
          const mimeTypeMatch = videoData.match(/data:(.*?);/);
          detectedMimeType = mimeTypeMatch?.[1] || detectedMimeType;
          const binaryData = atob(base64Data);
          const arrayBuffer = new Uint8Array(binaryData.length);
          for (let i = 0; i < binaryData.length; i++) {
            arrayBuffer[i] = binaryData.charCodeAt(i);
          }
          videoBlob = new Blob([arrayBuffer], { type: detectedMimeType });
        } else if (typeof videoData === 'string' && videoData.startsWith('blob:')) {
          const response = await fetch(videoData);
          videoBlob = await response.blob();
          detectedMimeType = videoBlob.type || detectedMimeType;
        } else {
          throw new Error(`Invalid video data format: ${typeof videoData}`);
        }

        // CRITICAL FIX: Monkey-patch the isGroup getter on the chat prototype
        try {
          console.log('[PrinChat Page] Chat found, applying isGroup fix...');
          const chatProto = Object.getPrototypeOf(targetChat);
          const isGroupDescriptor = Object.getOwnPropertyDescriptor(chatProto, 'isGroup');

          if (isGroupDescriptor && isGroupDescriptor.get) {
            Object.defineProperty(chatProto, 'isGroup', {
              get: function () {
                try {
                  const idStr = this.id?._serialized || this.id?.toString() || '';
                  return idStr.includes('@g.us');
                } catch { return false; }
              },
              configurable: true, enumerable: true
            });
          }

          try {
            const idStr = targetChat.id?._serialized || targetChat.id?.toString() || '';
            Object.defineProperty(targetChat, 'isGroup', {
              value: idStr.includes('@g.us'),
              writable: true, configurable: true, enumerable: true
            });
          } catch (e) { console.log('[PrinChat Page] Could not set isGroup on instance'); }
        } catch (patchError: any) {
          console.log('[PrinChat Page] Warning: Could not patch isGroup:', patchError.message);
        }

        // Determine file extension
        let fileExtension = '.mp4';
        if (detectedMimeType.includes('webm')) fileExtension = '.webm';
        else if (detectedMimeType.includes('ogg')) fileExtension = '.ogv';

        const videoFile = new File([videoBlob], `video-${Date.now()}${fileExtension}`, {
          type: detectedMimeType,
          lastModified: Date.now()
        });

        const fileSizeMB = videoFile.size / 1024 / 1024;

        // Validate file size
        if (fileSizeMB > MAX_VIDEO_SIZE_MB) {
          throw new Error(`Video too large: ${fileSizeMB.toFixed(1)}MB. WhatsApp limit is ${MAX_VIDEO_SIZE_MB}MB`);
        }

        // Get WPPConnect library
        const WPP = (window as any).WPP;
        if (!WPP?.chat?.sendFileMessage) {
          throw new Error('WPPConnect library not available');
        }

        // Extract chat ID as a clean string to avoid circular reference issues
        const chatIdString = typeof targetChat.id === 'string'
          ? targetChat.id
          : (targetChat.id._serialized || String(targetChat.id));

        console.log('[PrinChat Page] Sending video file to chat:', chatIdString);

        // Send video
        try {
          await WPP.chat.sendFileMessage(chatIdString, videoFile, {
            type: 'video',
            caption: caption || ''
          });
        } catch (videoErr: any) {
          // Fallback to document
          debugLog(`Video send failed: ${videoErr.message}, falling back to document`, '#ff9900');
          await WPP.chat.sendFileMessage(chatIdString, videoFile, {
            type: 'document',
            caption: caption || '',
            filename: videoFile.name
          });
        }

        document.dispatchEvent(new CustomEvent('PrinChatMessageSent', {
          detail: { success: true, requestId, method: 'VIDEO' }
        }));
      } catch (error: any) {
        debugLog(`❌ ERROR: ${error.message}`, '#ff0000');
        document.dispatchEvent(new CustomEvent('PrinChatMessageSent', {
          detail: { success: false, error: error.message, requestId }
        }));
      }
    });

    // =========================================================================
    // FILE SENDING
    // =========================================================================
    document.addEventListener('PrinChatSendFile', async (event: any) => {
      let requestId = 'unknown';
      try {
        const { fileData, caption, fileName, requestId: reqId, chatId } = event.detail;
        requestId = reqId;

        let targetChat;
        if (chatId) {
          // Use specific chat if provided
          targetChat = await Store.Chat.find(chatId);
          if (!targetChat) throw new Error(`Chat ${chatId} not found`);
        } else {
          // Use active chat if no chatId provided
          targetChat = Store.Chat.getActive();
          if (!targetChat) throw new Error('No active chat');
        }

        // Convert to Blob
        let fileBlob: Blob;
        let detectedMimeType = 'application/octet-stream';

        if (fileData instanceof Blob || fileData instanceof File) {
          fileBlob = fileData;
          detectedMimeType = fileBlob.type || detectedMimeType;
        } else if (typeof fileData === 'string' && fileData.startsWith('data:')) {
          const base64Data = fileData.split(',')[1];
          const mimeTypeMatch = fileData.match(/data:(.*?);/);
          detectedMimeType = mimeTypeMatch?.[1] || detectedMimeType;
          const binaryData = atob(base64Data);
          const arrayBuffer = new Uint8Array(binaryData.length);
          for (let i = 0; i < binaryData.length; i++) {
            arrayBuffer[i] = binaryData.charCodeAt(i);
          }
          fileBlob = new Blob([arrayBuffer], { type: detectedMimeType });
        } else if (typeof fileData === 'string' && fileData.startsWith('blob:')) {
          const response = await fetch(fileData);
          fileBlob = await response.blob();
          detectedMimeType = fileBlob.type || detectedMimeType;
        } else {
          throw new Error(`Invalid file data format: ${typeof fileData}`);
        }

        // CRITICAL FIX: Monkey-patch the isGroup getter on the chat prototype
        try {
          console.log('[PrinChat Page] Chat found, applying isGroup fix...');
          const chatProto = Object.getPrototypeOf(targetChat);
          const isGroupDescriptor = Object.getOwnPropertyDescriptor(chatProto, 'isGroup');

          if (isGroupDescriptor && isGroupDescriptor.get) {
            Object.defineProperty(chatProto, 'isGroup', {
              get: function () {
                try {
                  const idStr = this.id?._serialized || this.id?.toString() || '';
                  return idStr.includes('@g.us');
                } catch { return false; }
              },
              configurable: true, enumerable: true
            });
          }

          try {
            const idStr = targetChat.id?._serialized || targetChat.id?.toString() || '';
            Object.defineProperty(targetChat, 'isGroup', {
              value: idStr.includes('@g.us'),
              writable: true, configurable: true, enumerable: true
            });
          } catch (e) { console.log('[PrinChat Page] Could not set isGroup on instance'); }
        } catch (patchError: any) {
          console.log('[PrinChat Page] Warning: Could not patch isGroup:', patchError.message);
        }

        const file = new File([fileBlob], fileName || `file-${Date.now()}`, {
          type: detectedMimeType,
          lastModified: Date.now()
        });

        const fileSizeMB = file.size / 1024 / 1024;

        // Validate file size (WhatsApp limit is typically 100MB for documents)
        if (fileSizeMB > 100) {
          throw new Error(`File too large: ${fileSizeMB.toFixed(1)}MB. WhatsApp limit is 100MB`);
        }

        // Get WPPConnect library
        const WPP = (window as any).WPP;
        if (!WPP?.chat?.sendFileMessage) {
          throw new Error('WPPConnect library not available');
        }

        // Extract chat ID as a clean string to avoid circular reference issues
        const chatIdString = typeof targetChat.id === 'string'
          ? targetChat.id
          : (targetChat.id._serialized || String(targetChat.id));

        console.log('[PrinChat Page] Sending file to chat:', chatIdString);

        // Send file as document
        await WPP.chat.sendFileMessage(chatIdString, file, {
          type: 'document',
          caption: caption || '',
          filename: fileName || file.name
        });

        document.dispatchEvent(new CustomEvent('PrinChatMessageSent', {
          detail: { success: true, requestId, method: 'FILE' }
        }));
      } catch (error: any) {
        debugLog(`❌ ERROR: ${error.message}`, '#ff0000');
        document.dispatchEvent(new CustomEvent('PrinChatMessageSent', {
          detail: { success: false, error: error.message, requestId }
        }));
      }
    });

    // Listen for active chat info requests
    document.addEventListener('PrinChatGetActiveChat', async (event: any) => {
      try {
        const { requestId } = event.detail;
        console.log('[PrinChat Page] 📥 Received PrinChatGetActiveChat request, requestId:', requestId);

        let chatId = '';
        let chatName = 'Unknown Chat';
        let chatPhoto: string | undefined = undefined;

        // Commercial Grade Strategy: Use WPPConnect (Maintained Library)
        try {
          if ((window as any).WPP?.chat?.getActiveChat) {
            const wppChat = await (window as any).WPP.chat.getActiveChat();
            if (wppChat) {
              console.log('[PrinChat Page] ✅ WPP.chat.getActiveChat() success');

              // 1. Get Chat ID
              chatId = wppChat.id?._serialized || wppChat.id?.toString() || '';

              // 2. Get Name
              const contact = wppChat.contact;
              chatName = contact?.name || contact?.pushname || contact?.formattedName ||
                wppChat.name || wppChat.formattedTitle || chatId;

              // 3. Get Photo
              if (contact?.profilePicThumb) {
                chatPhoto = contact.profilePicThumb.eurl || contact.profilePicThumb.imgFull || contact.profilePicThumb.img;
              }
              // Try chat object itself if contact lacks photo
              if (!chatPhoto && wppChat.profilePicThumb) {
                chatPhoto = wppChat.profilePicThumb.eurl || wppChat.profilePicThumb.imgFull || wppChat.profilePicThumb.img;
              }
            }
          }
        } catch (wppError) {
          console.warn('[PrinChat Page] ⚠️ WPP strategy failed, falling back to Store:', wppError);
        }

        // Fallback Strategy: Store (Legacy)
        if (!chatId) {
          const activeChat = Store.Chat.getActive();
          if (activeChat) {
            console.log('[PrinChat Page] ⚠️ Using Store fallback');

            chatId = activeChat.id?._serialized || activeChat.id?.toString() || '';
            const contact = activeChat.contact;
            chatName = contact?.pushname || contact?.name || activeChat.formattedTitle || activeChat.name || 'Unknown';

            // Photo extraction (same logic as before)
            if (contact?.profilePicThumb) {
              chatPhoto = contact.profilePicThumb.eurl || contact.profilePicThumb.imgFull || contact.profilePicThumb.img;
            }
            if (!chatPhoto && activeChat.profilePicThumb) {
              chatPhoto = activeChat.profilePicThumb.eurl || activeChat.profilePicThumb.imgFull || activeChat.profilePicThumb.img;
            }
          }
        }

        // 4. Try explicit fetch if still no photo (High Reliability) using WPP
        if (!chatPhoto && (window as any).WPP?.contact?.getProfilePictureUrl && chatId) {
          try {
            // console.log('[PrinChat Page] 📸 Fetching profile picture URL explicitly...');
            const explicitPhoto = await (window as any).WPP.contact.getProfilePictureUrl(chatId);
            if (explicitPhoto) {
              chatPhoto = explicitPhoto;
              // console.log('[PrinChat Page] ✅ Got photo from explicit fetch');
            }
          } catch (e) {
            // console.warn('[PrinChat Page] Failed explicit photo fetch');
          }
        }

        // DOM Fallback (Last Resort)
        if (!chatId) {
          // ... existing DOM fallback logic logic is fine as ultimate fallback, 
          // but usually implies we can't get ID, so we return empty ID.
          // Keeping previous simplified DOM lookup if acceptable, or just rely on the above.
          console.log('[PrinChat Page] ❌ Failed to get chat from WPP and Store');

          // Try to at least get name from DOM for display
          const chatHeader = document.querySelector('header[data-testid="conversation-header"]');
          if (chatHeader) {
            const chatNameElement = chatHeader.querySelector('span[dir="auto"][title]') as HTMLElement;
            chatName = chatNameElement?.getAttribute('title') || chatNameElement?.textContent || chatName;
          }
        }

        console.log('[PrinChat Page] Obtained Chat Info:', { chatId, chatName, hasPhoto: !!chatPhoto });

        document.dispatchEvent(new CustomEvent('PrinChatActiveChatResult', {
          detail: { success: true, chatName, chatId, chatPhoto, requestId }
        }));
      } catch (error: any) {
        console.error('[PrinChat Page] ❌ Error in PrinChatGetActiveChat handler:', error);
        document.dispatchEvent(new CustomEvent('PrinChatActiveChatResult', {
          detail: { success: false, error: error.message, requestId: event.detail?.requestId }
        }));
      }
    });

    // Listen for open chat requests
    document.addEventListener('PrinChatOpenChat', async (event: any) => {
      try {
        const { chatId, requestId } = event.detail;
        console.log('[PrinChat Page] PrinChatOpenChat received:', chatId);

        if (!chatId) {
          console.error('[PrinChat Page] No chatId provided');
          document.dispatchEvent(new CustomEvent('PrinChatOpenChatResult', {
            detail: { success: false, error: 'No chatId provided', requestId }
          }));
          return;
        }

        // Try to find the chat first with robustness
        let chat;
        try {
          if (Store.Chat.find) chat = await Store.Chat.find(chatId);
        } catch (findError) {
          console.log('[PrinChat Page] Chat not found via find(), trying fallback:', findError);
        }

        if (!chat && Store.Chat.get) {
          try { chat = Store.Chat.get(chatId); } catch (e) { }
        }

        if (chat) {
          // Chat exists, just open it
          console.log('[PrinChat Page] Opening existing chat with setActiveChat');
          await Store.Chat.setActiveChat(chat);
          console.log('[PrinChat Page] ✅ Chat opened successfully');
          document.dispatchEvent(new CustomEvent('PrinChatOpenChatResult', {
            detail: { success: true, requestId }
          }));
        } else {
          // Chat doesn't exist - use WhatsApp Web URL (best practice)
          console.log('[PrinChat Page] Chat not found, using WhatsApp Web send URL');
          const phoneNumber = chatId.replace('@c.us', '');
          window.location.href = `https://web.whatsapp.com/send?phone=${phoneNumber}`;
        }
      } catch (error: any) {
        console.error('[PrinChat Page] Error in PrinChatOpenChat:', error);
        document.dispatchEvent(new CustomEvent('PrinChatOpenChatResult', {
          detail: { success: false, error: error.message, requestId: event.detail?.requestId }
        }));
      }
    });

    // Listen for get chat info by ID requests (for triggers)
    document.addEventListener('PrinChatGetChatInfo', async (event: any) => {
      try {
        const { chatId, requestId } = event.detail;

        if (!chatId) {
          document.dispatchEvent(new CustomEvent('PrinChatChatInfoResult', {
            detail: { success: false, error: 'No chatId provided', requestId }
          }));
          return;
        }

        // console.log('[PrinChat Page] Getting chat info for:', chatId);

        // CRITICAL: Detect Standard vs Business WhatsApp
        // Better detection: Check if there are actual labels/tags, not just if Store.Label exists
        const hasLabels = Store?.Label?.models?.length > 0 || Store?.Label?._models?.length > 0;
        const isStandardWhatsApp = !hasLabels;
        let chat, contact;

        console.log('[PrinChat Page] Detection: isStandard=', isStandardWhatsApp, 'Store.Label exists=', !!Store?.Label, 'hasLabels=', hasLabels);

        // ID variants to try (including @lid format used in Standard WhatsApp!)
        const idsToTry = [chatId];
        if (chatId.indexOf('@') === -1) {
          idsToTry.push(`${chatId}@c.us`);
          idsToTry.push(`${chatId}@s.whatsapp.net`);
          idsToTry.push(`${chatId}@lid`);
        } else {
          // Add cross-format attempts
          const baseId = chatId.split('@')[0];
          if (!idsToTry.includes(`${baseId}@c.us`)) idsToTry.push(`${baseId}@c.us`);
          if (!idsToTry.includes(`${baseId}@s.whatsapp.net`)) idsToTry.push(`${baseId}@s.whatsapp.net`);
          if (!idsToTry.includes(`${baseId}@lid`)) idsToTry.push(`${baseId}@lid`);
        }

        console.log('[PrinChat Page] IDs to try:', idsToTry);

        if (isStandardWhatsApp) {
          // ⚡ FAST PATH for Standard WhatsApp (sync only, no hanging async calls)
          console.log('[PrinChat Page] 🚀 Using FAST path (Standard WhatsApp)');

          // Try sync Store.Chat.get first
          if (Store?.Chat?.get) {
            for (const id of idsToTry) {
              if (chat) break;
              try { chat = Store.Chat.get(id); } catch (e) { }
            }
          }

          // Try sync Store.Contact.get (NOT find - sync only!)
          if (Store?.Contact?.get) {
            for (const id of idsToTry) {
              if (contact) break;
              try { contact = Store.Contact.get(id); } catch (e) { }
            }
          }

          // Extract contact from chat if available
          if (!contact && chat?.contact) {
            contact = chat.contact;
          }

          // WPP as primary fallback for Standard (fast and reliable)
          if (!contact && (window as any).WPP?.contact?.get) {
            try {
              contact = await (window as any).WPP.contact.get(chatId);
            } catch (e) { }
          }

        } else {
          // 🏢 BUSINESS PATH (can use async find safely)
          console.log('[PrinChat Page] 🏢 Using Business path (with async find)');

          // Helper for async find
          const findInStore = async (storeProp: any, id: string) => {
            if (storeProp?.find) {
              try { return await storeProp.find(id); } catch (e) { }
            }
            if (storeProp?.get) {
              try { return storeProp.get(id); } catch (e) { }
            }
            return null;
          };

          // Try Contact.find
          if (Store?.Contact) {
            for (const id of idsToTry) {
              if (contact) break;
              contact = await findInStore(Store.Contact, id);
            }
          }

          // Try Chat.find
          if (Store?.Chat) {
            for (const id of idsToTry) {
              if (chat) break;
              chat = await findInStore(Store.Chat, id);
            }
          }

          // Extract contact from chat
          if (!contact && chat?.contact) {
            contact = chat.contact;
          }

          // WPP Fallback
          if (!contact && (window as any).WPP?.contact?.get) {
            try { contact = await (window as any).WPP.contact.get(chatId); } catch (e) { }
          }
        }

        if (!chat && !contact) {
          console.log('[PrinChat Page] ⚠️ Chat/Contact object not found via any API. Returning minimal info fallback.');
          // Retorna sucesso parcial para não quebrar a UI
          document.dispatchEvent(new CustomEvent('PrinChatChatInfoResult', {
            detail: {
              success: true,
              chatName: chatId.replace('@c.us', '').replace('@s.whatsapp.net', ''),
              chatId,
              chatPhoto: undefined,
              isFallback: true,
              requestId
            }
          }));
          return;
        }

        // 3. Extract Basic Info - EXHAUSTIVE SEARCH
        // 3. Extract Basic Info - SAFE FIELD ACCESS
        // We prioritize raw properties to avoid triggering deprecated/broken getters in WPPConnect
        let chatName: string | undefined;

        const safeGet = (obj: any, prop: string): any => {
          try { return obj?.[prop]; } catch (e) { return undefined; }
        };

        if (contact) {
          const isBusiness = safeGet(contact, 'isBusiness');

          if (isBusiness) {
            // For Business: verifiedName is the gold standard
            chatName = safeGet(contact, 'verifiedName') || safeGet(contact, 'pushname') || safeGet(contact, 'name');
          } else {
            // For Normal: pushname is usually what we want (user's self-set name) or name (address book name)
            chatName = safeGet(contact, 'pushname') || safeGet(contact, 'name');
          }

          // Safe Fallbacks (computed getters that might crash, but we catch them now)
          if (!chatName) chatName = safeGet(contact, 'formattedName');
          if (!chatName) chatName = safeGet(contact, 'shortName');
          if (!chatName) chatName = safeGet(contact, 'displayName');
        }

        // Chat object Fallbacks
        // Chat object Fallbacks
        if ((!chatName || chatName === 'chat' || chatName === 'unknown') && chat) {
          chatName = safeGet(chat, 'formattedTitle') || safeGet(chat, 'name');
          if ((!chatName || chatName === 'chat') && chat.contact) {
            chatName = safeGet(chat.contact, 'pushname') || safeGet(chat.contact, 'name');
          }
        }

        // Final fallback to ID
        if (!chatName) {
          chatName = chatId.replace('@c.us', '');
        }

        // WPP Name Fallback (If Standard WA fails Store lookups)
        if ((!chatName || chatName.includes('@')) && (window as any).WPP?.chat?.get) {
          try {
            const wppChat = await (window as any).WPP.chat.get(chatId);
            if (wppChat) {
              chatName = wppChat.name || wppChat.contact?.name || wppChat.contact?.pushname || chatName;
            }
          } catch (e) { }
        }

        console.log('[PrinChat Page] Chat name:', chatName);

        // Get profile picture URL
        let chatPhoto: string | undefined = undefined;
        try {
          console.log('[PrinChat Page] Checking for chat photo...');

          // Strategy 1: Try contact.profilePicThumb (Memory - Fast)
          if (!chatPhoto && contact?.profilePicThumb) {
            // console.log('[PrinChat Page] Trying contact.profilePicThumb...');
            chatPhoto = contact.profilePicThumb.eurl || contact.profilePicThumb.imgFull || contact.profilePicThumb.img;
            if (chatPhoto) console.log('[PrinChat Page] ✅ Got photo from contact.profilePicThumb');
          }

          // Strategy 2: Try chat.profilePicThumb (Memory - Fast)
          if (!chatPhoto && chat?.profilePicThumb) {
            // console.log('[PrinChat Page] Trying chat.profilePicThumb...');
            chatPhoto = chat.profilePicThumb.eurl || chat.profilePicThumb.imgFull || chat.profilePicThumb.img;
            if (chatPhoto) console.log('[PrinChat Page] ✅ Got photo from chat.profilePicThumb');
          }

          // Strategy 3: Try contact.img field directly (Memory - Fast)
          if (!chatPhoto && contact?.img) {
            // console.log('[PrinChat Page] Trying contact.img...');
            chatPhoto = contact.img;
            if (chatPhoto) console.log('[PrinChat Page] ✅ Got photo from contact.img');
          }

          // Strategy 4: Try Store.ProfilePicThumb.find() (DB - Medium)
          if (!chatPhoto && (window as any).Store?.ProfilePicThumb) {
            // console.log('[PrinChat Page] Trying Store.ProfilePicThumb.find()...');
            try {
              const profilePic = await (window as any).Store.ProfilePicThumb.find(chat.id);
              if (profilePic) {
                // console.log('[PrinChat Page] ProfilePicThumb object:', profilePic);
                chatPhoto = profilePic.eurl || profilePic.imgFull || profilePic.img;
                if (chatPhoto) console.log('[PrinChat Page] ✅ Got photo from Store.ProfilePicThumb');
              }
            } catch (storeError) {
              console.log('[PrinChat Page] Store.ProfilePicThumb.find() failed:', storeError);
            }
          }

          // Strategy 5: Try WPPConnect API (Network/Full - Slow/Reliable)
          if (!chatPhoto && (window as any).WPP?.contact?.getProfilePictureUrl) {
            console.log('[PrinChat Page] Trying WPP.contact.getProfilePictureUrl...');
            try {
              const pictureUrl = await (window as any).WPP.contact.getProfilePictureUrl(chatId);
              if (pictureUrl) {
                console.log('[PrinChat Page] ✅ Got photo from WPP:', pictureUrl);
                chatPhoto = pictureUrl;
              }
            } catch (wppError) {
              console.log('[PrinChat Page] WPP.contact.getProfilePictureUrl failed:', wppError);
            }
          }

          // Strategy 6: Try forcing a refresh via Store.ProfilePicThumb (Network - Slowest)
          if (!chatPhoto && (window as any).Store?.ProfilePicThumb) {
            console.log('[PrinChat Page] Trying to force refresh ProfilePicThumb...');
            try {
              // Try to get or create ProfilePicThumb
              const profilePicModel = await (window as any).Store.ProfilePicThumb.get(chat.id);
              if (profilePicModel) {
                console.log('[PrinChat Page] ProfilePicThumb via get():', profilePicModel);
                chatPhoto = profilePicModel.eurl || profilePicModel.imgFull || profilePicModel.img;
                if (chatPhoto) console.log('[PrinChat Page] ✅ Got photo from Store.ProfilePicThumb.get()');
              }
            } catch (getError) {
              console.log('[PrinChat Page] Store.ProfilePicThumb.get() failed:', getError);
            }
          }

          // Strategy 7: DOM Scraping (Final Fallback - Visual)
          if (!chatPhoto) {
            console.log('[PrinChat Page] Strategies 1-6 failed. Trying DOM scraping from header...');
            try {
              // The main chat header
              const header = document.querySelector('#main > header');
              if (header) {
                // Try finding any image that is NOT an SVG/Icon
                // WhatsApp profile pictures are usually standard <img> tags with src="blob:..." or "https:..."
                // Icons are usually SVGs or have specific classes
                const images = Array.from(header.querySelectorAll('img'));

                console.log(`[PrinChat Page] Found ${images.length} images in header`);

                for (const img of images) {
                  const src = (img as HTMLImageElement).src;
                  // Filter out default placeholders and icons
                  if (src &&
                    !src.includes('data:image/svg') &&
                    !src.includes('data:image/gif') &&
                    (src.startsWith('blob:') || src.startsWith('http'))) {

                    chatPhoto = src;
                    console.log('[PrinChat Page] ✅ Got photo from DOM Scraping (Iterator):', chatPhoto);
                    break;
                  }
                }

                // Fallback: Check for background-image on div (sometimes used)
                if (!chatPhoto) {
                  const divs = Array.from(header.querySelectorAll('div'));
                  for (const div of divs) {
                    const style = window.getComputedStyle(div);
                    const bgImage = style.backgroundImage;
                    if (bgImage && bgImage !== 'none' && bgImage.includes('url("')) {
                      const url = bgImage.slice(5, -2); // Remove url("...")
                      if (url.startsWith('blob:') || url.startsWith('http')) {
                        chatPhoto = url;
                        console.log('[PrinChat Page] ✅ Got photo from DOM Scraping (Background):', chatPhoto);
                        break;
                      }
                    }
                  }
                }
              }
            } catch (domError) {
              console.error('[PrinChat Page] DOM scraping failed:', domError);
            }
          }

          console.log('[PrinChat Page] Final chatPhoto result:', chatPhoto ? 'Found' : 'Not found');
        } catch (e: any) {
          const errorMessage = e?.message || String(e);
          console.error('[PrinChat Page] Error getting chat photo:', errorMessage, e);
        }

        // Final Name Fallback: DOM Scraping
        if ((!chatName || chatName === 'Chat' || chatName.includes('@')) && !contact && !chat) {
          try {
            const header = document.querySelector('#main > header');
            if (header) {
              const titleEl = header.querySelector('div[role="button"] > span[dir="auto"]') ||
                header.querySelector('span[title]') ||
                header.querySelector('.emoji-itext'); // Older generic
              if (titleEl && titleEl.textContent) {
                chatName = titleEl.textContent;
                console.log('[PrinChat Page] ✅ Got name from DOM Scraping:', chatName);
              }
            }
          } catch (e) { }
        }

        // --- FETCH LABELS/TAGS (WhatsApp Business) ---
        let chatTags: string[] = [];
        let chatLabels: { id: string, name: string, color?: string }[] = [];

        try {
          console.log('[PrinChat Page] 🏷️ STARTING TAG FETCH for:', chatId);
          const Store = (window as any).Store;
          const WPP = (window as any).WPP;


          // Helper to extract color
          const extractColor = (labelModel: any): string | undefined => {
            if (!labelModel) return undefined;
            // 1. Direct hex property
            if (labelModel.color && typeof labelModel.color === 'string') return labelModel.color;
            if (labelModel.hexColor) return labelModel.hexColor;

            // 2. Decimal color (WhatsApp sometimes uses integer representation)
            // Convert decimal to hex: 4294967295 -> #FFFFFF
            // But usually label.color is null/undefined if standard, or a Specific ID map is needed.
            // Actually, Store.Label models usually have a 'color' property (decimal) or 'hexColor'.
            // If it is a number:
            if (typeof labelModel.color === 'number') {
              // Convert decimal color to hex
              // Often (color >>> 0).toString(16)
              // But ensure it has # prefix and 6 chars
              let hex = (labelModel.color >>> 0).toString(16);
              while (hex.length < 6) hex = '0' + hex;
              // Sometimes alpha is included (8 chars), we might want just RGB
              if (hex.length > 6) hex = hex.substring(hex.length - 6);
              return '#' + hex;
            }

            return undefined;
          };

          // Helper to add label
          const addLabel = (id: string, name: string, rawColor?: any, model?: any) => {
            if (!chatLabels.find(l => l.id === id)) {
              let finalColor = rawColor;
              if (!finalColor && model) {
                finalColor = extractColor(model);
              }
              chatLabels.push({ id, name, color: finalColor });
              chatTags.push(name);
            }
          };


          // Strategy 1: Store.Label (Prioritize internal Store as it updates instantly)
          // If Store.Label exists, we are on Business (or it's supported).
          // If NOT, we assume Standard WhatsApp and SKIP everything to avoid delays.
          if (Store?.Label) {
            console.log('[PrinChat Page] 🏷️ Strategy 1: Store.Label (using chat object)');
            const labelIds = chat?.labels || [];
            console.log('[PrinChat Page] 🔍 chat.labels from Store.Chat:', labelIds);

            if (labelIds.length > 0) {
              const allLabels = Store.Label.models || Store.Label._models || [];
              labelIds.forEach((labelId: string) => {
                let label = Store.Label.get(labelId);
                if (!label && allLabels.length > 0) {
                  label = allLabels.find((m: any) => m.id === labelId || m.id._serialized === labelId);
                }

                if (label) {
                  console.log('[PrinChat Page] 🏷️ Found label (Store):', label.name, label.id);
                  addLabel(label.id, label.name, label.color || label.hexColor, label);
                } else {
                  addLabel(labelId, `Tag ${labelId}`, undefined);
                }
              });
            } else {
              console.log('[PrinChat Page] ⚠️ No labels found in chat.labels property');
            }

            // ONLY try fallbacks if we ARE on Business (Store.Label exists) but failed to find tags?
            // Actually, if Store.Label exists, we probably have what we need. 
            // The fallbacks below (Strategy 2 & 3) use WPP/Store methods mainly useful if our specific chat lookup failed?
            // But if Store.Label is MISSING, we definitely want to skip them.

            // Strategy 2: WPPConnect (Fallback) - Only run if likely Business
            if (chatTags.length === 0 && WPP?.label?.getLabels) {
              console.log('[PrinChat Page] 🏷️ Strategy 2: WPP.label.getLabels');
              try {
                const labels = await WPP.label.getLabels(chatId);
                if (labels && Array.isArray(labels)) {
                  labels.forEach((l: any) => addLabel(l.id, l.name, l.color, l));
                }
              } catch (e) { console.error('WPP.label.getLabels failed', e); }
            }

            // Strategy 3: WPP.chat.get inspection (Final Fallback) - Only run if likely Business
            if (chatTags.length === 0 && WPP?.chat?.get) {
              console.log('[PrinChat Page] 🏷️ Strategy 3: WPP.chat.get');
              try {
                const wppChat = await WPP.chat.get(chatId);
                if (wppChat && wppChat.labels && Array.isArray(wppChat.labels)) {
                  wppChat.labels.forEach((l: any) => {
                    if (typeof l === 'object' && l.id && l.name) {
                      addLabel(l.id, l.name, l.color, l);
                    } else if (typeof l === 'string') {
                      addLabel(l, `Tag ${l}`, undefined);
                    }
                  });
                }
              } catch (e: any) {
                console.warn('[PrinChat Page] ℹ️ Strategy 3 (WPP.chat.get) warning:', e?.message || 'unknown');
              }
            } // Close Strategy 3 if
          } // Close Store.Label if
          else {
            // Store.Label is undefined -> Standard WhatsApp.
            // SKIP all label fetching strategies to prevent delay.
          }

          console.log('[PrinChat Page] 🏷️ FINAL TAGS:', chatTags);

        } catch (tagError) {
          console.error('[PrinChat Page] Error fetching tags:', tagError);
        }

        document.dispatchEvent(new CustomEvent('PrinChatChatInfoResult', {
          detail: {
            success: true,
            chatName,
            chatId,
            chatPhoto,
            requestId,
            tags: chatTags, // Array of strings ['VIP', 'New']
            labels: chatLabels // Array of objects [{id, name, color}]
          }
        }));
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[PrinChat Page] Error getting chat info:', errorMessage, error);
        document.dispatchEvent(new CustomEvent('PrinChatChatInfoResult', {
          detail: { success: false, error: error.message, requestId: event.detail?.requestId }
        }));
      }
    });

    // Event Listener for GET_ALL_LABELS (Global Dictionary)
    document.addEventListener('PrinChatGetAllLabels', async (event: any) => {
      const requestId = event.detail?.requestId;

      const fetchLabelsInternal = async (attemptsLeft: number = 3): Promise<any[]> => {
        console.log(`[PrinChat Page] 🏷️ Fetching ALL labels (Attempts left: ${attemptsLeft})...`);
        const Store = (window as any).Store;
        const WPP = (window as any).WPP;
        console.log('[PrinChat Page] 🏷️ WPP Object available:', !!WPP);

        const allLabels: any[] = [];
        const seenIds = new Set<string>();

        // WhatsApp Business Label Palette - EXACT VISUAL MAPPING (2024)
        // Mapped from actual WhatsApp color picker grid (4 rows x 5 columns)
        // Row 1: Salmon, Light Cyan, Yellow, Light Purple, Gray-Blue
        // Row 2: Teal, Light Pink, Gold/Mustard, Periwinkle, Lime
        // Row 3: Darker Cyan, Salmon Pink, Mint Green, Red, Royal Blue
        // Row 4: Bright Lime, Orange, Sky Blue, Lilac, Purple
        const WA_LABEL_PALETTE = [
          '#FF9E9E', // 0  - Salmon/Coral (Row 1, Col 1)
          '#5AB5E5', // 1  - Light Cyan (Row 1, Col 2)
          '#FDD835', // 2  - Yellow (Row 1, Col 3)
          '#C594D7', // 3  - Light Purple (Row 1, Col 4)
          '#90A4AE', // 4  - Gray-Blue (Row 1, Col 5)
          '#26C6DA', // 5  - Teal/Turquoise (Row 2, Col 1)
          '#F48FB1', // 6  - Light Pink (Row 2, Col 2)
          '#FFB300', // 7  - Gold/Mustard (Row 2, Col 3)
          '#7986CB', // 8  - Periwinkle Blue (Row 2, Col 4)
          '#D4E157', // 9  - Lime Yellow-Green (Row 2, Col 5)
          '#00ACC1', // 10 - Darker Cyan (Row 3, Col 1)
          '#FFAB91', // 11 - Salmon Pink (Row 3, Col 2)
          '#81C784', // 12 - Mint Green (Row 3, Col 3)
          '#E57373', // 13 - Red (Row 3, Col 4)
          '#42A5F5', // 14 - Royal/Bright Blue ← "Novo cliente"
          '#9CCC65', // 15 - Bright Lime Green ← "Novo pedido"
          '#FF9800', // 16 - Orange (Row 4, Col 2)
          '#64B5F6', // 17 - Sky Blue (Row 4, Col 3)
          '#BA68C8', // 18 - Lilac (Row 4, Col 4)
          '#9575CD'  // 19 - Purple (Row 4, Col 5)
        ];

        // Persistence: Load cached valid colors
        let cachedColors: Record<string, string> = {};
        let paletteByIndex: Record<number, string> = {}; // NEW: Map colorIndex → actualColor

        try {
          const cache = JSON.parse(localStorage.getItem('princhat_label_cache') || '{}');
          cachedColors = cache.byName || {};
          paletteByIndex = cache.byIndex || {};
        } catch (e) { console.error('Error loading label cache', e); }

        // DOM Calibration Helper - Extract ACTUAL WhatsApp colors by scraping rendered labels
        const calibrateLabelsFromDOM = () => {
          try {
            console.log('[PrinChat Page] 🎨 Starting DOM color calibration...');

            // Strategy: Find label elements that have colorIndex data attribute or nearby
            // Common selectors for label chips in WhatsApp Business
            const labelSelectors = [
              'span[class*="label"]',
              'div[class*="label"]',
              '[data-testid*="label"]',
              'span[title]', // Tags often have title attribute
              'div[role="button"] span[dir="auto"]'
            ];

            labelSelectors.forEach(selector => {
              const elements = document.querySelectorAll(selector);
              elements.forEach((el: any) => {
                if (!el.innerText) return;
                const name = el.innerText.trim();
                if (!name || name.length > 30) return;

                const style = window.getComputedStyle(el);
                const bg = style.backgroundColor;

                if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                  // Store by name
                  cachedColors[name] = bg;
                  console.log(`[PrinChat Page] 👁️  Found "${name}": ${bg}`);
                }
              });
            });

            console.log(`[PrinChat Page] ✅ Calibration complete. Found ${Object.keys(cachedColors).length} colors by name.`);

            // Save
            localStorage.setItem('princhat_label_cache', JSON.stringify({
              byName: cachedColors,
              byIndex: paletteByIndex
            }));
          } catch (e) {
            console.error('[PrinChat Page] Calibration error:', e);
          }
        };

        // Run calibration immediately
        calibrateLabelsFromDOM();

        const addDef = (l: any) => {
          if (!l) return;

          // EXTRACT ID SAFELY (Fix for [object Object] issue)
          let labelId = l.id;
          if (typeof labelId === 'object' && labelId !== null) {
            labelId = labelId._serialized || labelId.toString();
          }

          if (!labelId || seenIds.has(labelId)) return;

          // 🔍 DEBUG: Log EVERYTHING WPPConnect gives us for this label
          console.log(`[PrinChat Page] 📋 RAW LABEL DATA for "${l.name || l.id}":`, JSON.stringify(l, null, 2));

          let finalColor: string | undefined = undefined;
          let colorSource = 'unknown';

          // PRIORITY 1: DOM Calibration (name-based lookup from visual scraping)
          if (cachedColors[l.name]) {
            finalColor = cachedColors[l.name];
            colorSource = `DOM calibration (name: "${l.name}")`;
          }

          // PRIORITY 2: Use colorIndex with WA_LABEL_PALETTE
          else if (typeof l.colorIndex === 'number' && l.colorIndex >= 0 && l.colorIndex < WA_LABEL_PALETTE.length) {
            finalColor = WA_LABEL_PALETTE[l.colorIndex];
            colorSource = `Palette[${l.colorIndex}]`;
          }

          // PRIORITY 3: Fallback to default blue
          else {
            finalColor = '#2196f3';
            colorSource = 'fallback default';
          }

          console.log(`[PrinChat Page] 🎨 Color for "${l.name}": ${finalColor} (source: ${colorSource})`);

          allLabels.push({
            id: labelId,
            name: l.name,
            color: finalColor
          });

          seenIds.add(labelId);
        };

        // PRIORITY 1: WPPConnect (User suggested, usually more reliable for full list)
        if ((window as any).WPP?.label?.getLabels) {
          try {
            console.log('[PrinChat Page] 🏷️ Strategy 1: WPP.label.getLabels()');
            const wppLabels = await (window as any).WPP.label.getLabels();
            if (Array.isArray(wppLabels) && wppLabels.length > 0) {
              console.log(`[PrinChat Page] 🏷️ WPP found ${wppLabels.length} labels`);
              wppLabels.forEach(addDef);
            }
          } catch (e) { console.error('[PrinChat Page] WPP fetch failed', e); }
        }

        // PRIORITY 2: Store.Label (Internal)
        if (Store?.Label) {
          console.log('[PrinChat Page] 🏷️ Strategy 2: Store.Label models');
          const models = Store.Label.models || Store.Label._models || Store.Label.getModelsArray?.() || [];
          if (models.length > 0) {
            console.log(`[PrinChat Page] 🏷️ Store.Label found ${models.length} models`);
            models.forEach(addDef);
          }
        }

        // PRIORITY 3: Store.Labels (Internal Plural - rarer)
        if (Store?.Labels) {
          const models = Store.Labels.models || Store.Labels._models || [];
          if (models.length > 0) {
            models.forEach(addDef);
          }
        }

        if (allLabels.length > 0) return allLabels;

        // If empty and we have attempts, wait and retry
        if (attemptsLeft > 0) {
          await new Promise(r => setTimeout(r, 1000));
          return fetchLabelsInternal(attemptsLeft - 1);
        }

        return [];
      };

      try {
        const allLabels = await fetchLabelsInternal();
        console.log(`[PrinChat Page] 🏷️ Found ${allLabels.length} global labels.`);

        document.dispatchEvent(new CustomEvent('PrinChatGetAllLabelsResult', {
          detail: {
            success: true,
            labels: allLabels,
            requestId
          }
        }));

      } catch (error: any) {
        console.error('[PrinChat Page] Error fetching all labels:', error);
        document.dispatchEvent(new CustomEvent('PrinChatGetAllLabelsResult', {
          detail: { success: false, error: error.message, requestId }
        }));
      }
    });

    // Monitor incoming messages for triggers
    try {
      if (Store.Msg && typeof Store.Msg.on === 'function') {
        // Track processed messages to avoid duplicates
        const processedMessages = new Set<string>();
        const MAX_MESSAGE_AGE = 10000; // Only process messages from last 10 seconds

        // Record current time as "script loaded" time
        const scriptLoadTime = Date.now();

        Store.Msg.on('add', (msg: any) => {
          // Only process incoming messages (not sent by us)
          if (msg && !msg.id.fromMe && msg.type === 'chat' && msg.body) {
            (async () => {
              const now = Date.now();
              // Get message timestamp (convert to milliseconds if needed)
              const msgTimestamp = msg.t ? msg.t * 1000 : now;
              const messageAge = now - msgTimestamp;

              // Skip if message is older than MAX_MESSAGE_AGE
              // Also skip messages that happened before script loaded (history messages)
              if (messageAge > MAX_MESSAGE_AGE || msgTimestamp < scriptLoadTime) {
                console.log('[PrinChat] Skipping old/history message:', {
                  body: msg.body.substring(0, 30),
                  age: messageAge,
                  msgTime: new Date(msgTimestamp).toLocaleTimeString(),
                  loadTime: new Date(scriptLoadTime).toLocaleTimeString()
                });
                return;
              }

              // Create unique message ID
              const messageId = `${msg.id.id}_${msg.from}_${msg.t}`;

              // Skip if already processed
              if (processedMessages.has(messageId)) {
                console.log('[PrinChat] Skipping duplicate message:', msg.body.substring(0, 30));
                return;
              }

              // Mark as processed
              processedMessages.add(messageId);

              // Clean up old processed messages periodically
              if (processedMessages.size > 100) {
                const oldMessages = Array.from(processedMessages).slice(0, 50);
                oldMessages.forEach(id => processedMessages.delete(id));
              }

              console.log('[PrinChat] New message received:', msg.body, `(age: ${messageAge}ms)`);

              // Get chatId from message (can be LID, getChatInfo will handle it)
              const chatId = msg.id?.remote?.toString() || msg.from?.toString() || '';
              console.log('[PrinChat] Chat ID from message:', chatId);

              // Notify content script about new message
              // getChatInfo in the injector will fetch name/photo
              document.dispatchEvent(new CustomEvent('PrinChatIncomingMessage', {
                detail: {
                  messageText: msg.body,
                  chatId: chatId,
                  timestamp: msgTimestamp
                }
              }));
            })();
          }
        });
        console.log('[PrinChat] Message monitoring active (with deduplication)');
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[PrinChat] Failed to setup message monitoring:', errorMessage, error);
    }

    // Monitor Label Changes for Real-time Sync
    try {
      console.log('[PrinChat] 🔍 Setting up Label monitoring...');
      console.log('[PrinChat] Store.Label exists?', !!Store.Label);
      console.log('[PrinChat] Store.Label.on type:', typeof Store.Label?.on);

      if (Store.Label && typeof Store.Label.on === 'function') {
        Store.Label.on('change', (model: any) => {
          console.log('[PrinChat Page] 🏷️🔥 Label CHANGE event fired!', model?.name || model?.id);
          // Clear cached colors and re-calibrate
          try {
            localStorage.removeItem('princhat_label_cache');
          } catch (e) { }

          // Notify UI overlay to refresh labels - USE WINDOW TO CROSS WORLDS
          window.dispatchEvent(new CustomEvent('PrinChatLabelsChanged', {
            detail: { timestamp: Date.now(), reason: 'change' }
          }));
          console.log('[PrinChat Page] ✅ Dispatched PrinChatLabelsChanged (via window)');
        });

        Store.Label.on('add', (model: any) => {
          console.log('[PrinChat Page] 🏷️➕ Label ADD event fired!', model?.name || model?.id);
          try {
            localStorage.removeItem('princhat_label_cache');
          } catch (e) { }

          window.dispatchEvent(new CustomEvent('PrinChatLabelsChanged', {
            detail: { timestamp: Date.now(), reason: 'add' }
          }));
          console.log('[PrinChat Page] ✅ Dispatched PrinChatLabelsChanged (via window)');
        });

        console.log('[PrinChat] ✅ Label monitoring active (real-time sync)');
      } else {
        console.warn('[PrinChat] ⚠️ Store.Label.on not available - real-time sync disabled');
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[PrinChat] ❌ Failed to setup label monitoring:', errorMessage, error);
    }

    // Monitor Chat Label Assignments (Adding/Removing tags from contacts)
    try {
      if (Store.Chat && typeof Store.Chat.on === 'function') {
        Store.Chat.on('change:labels', (chatModel: any) => {
          console.log('[PrinChat Page] 🏷️👥 Chat Labels Changed!', chatModel?.id?._serialized);
          console.log('[PrinChat Page] 🔍 New labels for chat:', chatModel?.labels);

          window.dispatchEvent(new CustomEvent('PrinChatLabelsChanged', {
            detail: {
              timestamp: Date.now(),
              reason: 'chat_labels_change',
              chatId: chatModel?.id?._serialized
            }
          }));
        });
        console.log('[PrinChat] ✅ Chat.change:labels monitoring active');
      }
    } catch (e) {
      console.error('[PrinChat] ❌ Failed to setup chat label monitoring:', e);
    }






  }).catch(() => {
    // Initialization failed silently
  });

  // Listen for UI requests from Overlay (GET_ACTIVE_CHAT, etc)
  // MOVED OUTSIDE waitForStore to ensure it's always listening
  document.addEventListener('PrinChatUIRequest', async (event: any) => {
    const { requestId, message } = event.detail;

    // Only handle requests that require Store access (Page Context)
    if (message.type === 'GET_ACTIVE_CHAT' || message.type === 'GET_CHAT_INFO' || message.type === 'GET_CHAT_PHOTO') {
      let response: any = { success: false, error: 'Unknown request type' };

      try {
        const Store = (window as any).Store;

        // Check if Store is available
        if (!Store || !Store.Chat) {
          // Provide a more specific error so UI knows it's a readiness issue
          throw new Error('Store not ready');
        }

        if (message.type === 'GET_ACTIVE_CHAT') {
          const chat = Store.Chat.getActive();
          if (chat) {
            // CRITICAL: For unsaved contacts, prioritize pushname (the display name from their WhatsApp profile)
            // This is what makes names appear even when contact isn't saved
            const displayName = chat.contact?.pushname || chat.name || chat.formattedTitle;

            // Try multiple sources for photo (Store might not have it cached)
            let chatPhoto = chat.contact?.profilePicThumbObj?.eurl
              || chat.contact?.profilePicThumb?.eurl
              || chat.profilePicThumbObj?.eurl;

            // If Store doesn't have photo, try WPP API (async load)
            if (!chatPhoto && (window as any).WPP?.contact?.getProfilePictureUrl) {
              try {
                const contactId = chat.id._serialized || chat.id;
                chatPhoto = await (window as any).WPP.contact.getProfilePictureUrl(contactId);
              } catch (e) {
                // Photo not available
              }
            }

            response = {
              success: true,
              data: {
                chatId: chat.id._serialized || chat.id,
                name: displayName,
                isGroup: chat.isGroup,
                chatPhoto: chatPhoto
              }
            };
          } else {
            response = { success: false, error: 'No active chat' };
          }
        } else if (message.type === 'GET_CHAT_PHOTO') {
          const chatId = message.payload.chatId;
          const chat = await Store.Chat.find(chatId);
          if (chat) {
            response = {
              success: true,
              data: {
                chatPhoto: chat.contact?.profilePicThumbObj?.eurl
              }
            };
          } else {
            response = { success: false, error: 'Chat not found' };
          }
        } else if (message.type === 'GET_CHAT_INFO') {
          const chatId = message.payload.chatId;
          const chat = await Store.Chat.find(chatId);
          if (chat) {
            // Use pushname for unsaved contacts (same as GET_ACTIVE_CHAT)
            const displayName = chat.contact?.pushname || chat.name || chat.formattedTitle;

            // Try multiple sources for photo
            let chatPhoto = chat.contact?.profilePicThumbObj?.eurl
              || chat.contact?.profilePicThumb?.eurl
              || chat.profilePicThumbObj?.eurl;

            // If Store doesn't have photo, try WPP API
            if (!chatPhoto && (window as any).WPP?.contact?.getProfilePictureUrl) {
              try {
                chatPhoto = await (window as any).WPP.contact.getProfilePictureUrl(chatId);
              } catch (e) {
                // Photo not available
              }
            }

            // Fetch labels with full details (id, name, color)
            let chatLabels: { id: string, name: string, color?: string }[] = [];
            try {
              const labelIds = chat.labels || [];
              if (labelIds.length > 0 && Store?.Label) {
                const allLabels = Store.Label.models || Store.Label._models || [];
                labelIds.forEach((labelId: string) => {
                  let label = Store.Label.get(labelId);
                  if (!label && allLabels.length > 0) {
                    label = allLabels.find((m: any) => m.id === labelId || m.id._serialized === labelId);
                  }
                  if (label) {
                    chatLabels.push({
                      id: label.id,
                      name: label.name,
                      color: label.color || label.hexColor
                    });
                  }
                });
              }
            } catch (e) {
              console.error('[PrinChat Page] Error fetching labels for GET_CHAT_INFO:', e);
            }

            response = {
              success: true,
              data: {
                chatName: displayName,
                chatPhoto: chatPhoto,
                isGroup: chat.isGroup,
                labels: chatLabels
              }
            };
          } else {
            response = { success: false, error: 'Chat not found' };
          }
        }

      } catch (e: any) {
        response = { success: false, error: e.message };
      }

      document.dispatchEvent(new CustomEvent('PrinChatUIResponse', {
        detail: { requestId, response }
      }));
    }
  });

})();
