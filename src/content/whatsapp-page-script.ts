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
  waitForStore().then(() => {
    const Store = (window as any).Store;

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

        const activeChat = Store.Chat.getActive();
        console.log('[PrinChat Page] 🔍 Store.Chat.getActive() result:', activeChat ? 'Found' : 'NULL');

        if (!activeChat) {
          console.log('[PrinChat Page] ⚠️ No active chat from Store, trying DOM fallback...');

          // Fallback: Try to get chat info from DOM
          try {
            // WhatsApp's chat header selector
            const chatHeader = document.querySelector('header[data-testid="conversation-header"]');
            if (chatHeader) {
              console.log('[PrinChat Page] ✅ Found chat header in DOM');

              // Try to get chat name from header
              const chatNameElement = chatHeader.querySelector('span[dir="auto"][title]') as HTMLElement;
              const chatName = chatNameElement?.getAttribute('title') || chatNameElement?.textContent || 'Unknown Chat';

              console.log('[PrinChat Page] 📝 Chat name from DOM:', chatName);

              // We don't have chatId from DOM, but we can at least show the name
              document.dispatchEvent(new CustomEvent('PrinChatActiveChatResult', {
                detail: {
                  success: true,
                  chatName,
                  chatId: '', // Empty chatId from DOM fallback
                  chatPhoto: undefined,
                  requestId
                }
              }));
              return;
            } else {
              console.log('[PrinChat Page] ❌ Chat header not found in DOM');
            }
          } catch (domError: any) {
            console.error('[PrinChat Page] Error in DOM fallback:', domError);
          }

          // If DOM fallback also failed
          document.dispatchEvent(new CustomEvent('PrinChatActiveChatResult', {
            detail: { success: false, error: 'No active chat', requestId }
          }));
          return;
        }

        console.log('[PrinChat Page] Processing active chat from Store...');

        // Get contact name from chat
        const contact = activeChat.contact;
        const chatName = contact?.pushname || contact?.name || contact?.formattedName ||
          activeChat.formattedTitle || activeChat.name ||
          activeChat.id?.user || 'Unknown';

        console.log('[PrinChat Page] 📝 Chat name:', chatName);

        // Get chatId for targeting
        const chatId = activeChat.id?._serialized || activeChat.id?.toString() || '';
        console.log('[PrinChat Page] 🆔 Chat ID:', chatId);

        // Get profile picture URL
        let chatPhoto: string | undefined = undefined;
        try {
          console.log('[PrinChat Page] 📸 Attempting to get chat photo...');

          // Try multiple sources for profile picture
          if (contact?.profilePicThumb) {
            chatPhoto = contact.profilePicThumb.eurl || contact.profilePicThumb.imgFull || contact.profilePicThumb.img;
            if (chatPhoto) console.log('[PrinChat Page] ✅ Got photo from contact.profilePicThumb');
          }

          if (!chatPhoto && activeChat?.profilePicThumb) {
            chatPhoto = activeChat.profilePicThumb.eurl || activeChat.profilePicThumb.imgFull || activeChat.profilePicThumb.img;
            if (chatPhoto) console.log('[PrinChat Page] ✅ Got photo from activeChat.profilePicThumb');
          }

          // Try contact.img field directly
          if (!chatPhoto && contact?.img) {
            chatPhoto = contact.img;
            if (chatPhoto) console.log('[PrinChat Page] ✅ Got photo from contact.img');
          }

          // Try getting from Store.ProfilePicThumb
          if (!chatPhoto && (window as any).Store?.ProfilePicThumb) {
            const profilePic = await (window as any).Store.ProfilePicThumb.find(activeChat.id);
            if (profilePic) {
              chatPhoto = profilePic.eurl || profilePic.imgFull || profilePic.img;
              if (chatPhoto) console.log('[PrinChat Page] ✅ Got photo from Store.ProfilePicThumb');
            }
          }

          if (!chatPhoto) {
            console.log('[PrinChat Page] ⚠️ No chat photo found');
          }
        } catch (e: any) {
          const errorMessage = e?.message || String(e);
          console.error('[PrinChat Page] ❌ Error getting chat photo:', errorMessage);
        }

        console.log('[PrinChat Page] 📤 Sending success result back to injector');
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

        // Try to find the chat first
        let chat;
        try {
          chat = await Store.Chat.find(chatId);
          console.log('[PrinChat Page] Chat found:', chatId);
        } catch (findError) {
          console.log('[PrinChat Page] Chat not found, will try to create/open:', findError);
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

        console.log('[PrinChat Page] Getting chat info for:', chatId);

        // Find the chat by ID
        const chat = await Store.Chat.find(chatId);

        if (!chat) {
          console.log('[PrinChat Page] Chat not found:', chatId);
          document.dispatchEvent(new CustomEvent('PrinChatChatInfoResult', {
            detail: { success: false, error: 'Chat not found', requestId }
          }));
          return;
        }

        console.log('[PrinChat Page] Chat found:', chat);

        // Get contact name from chat
        const contact = chat.contact;
        const chatName = contact?.pushname || contact?.name || contact?.formattedName ||
          chat.formattedTitle || chat.name ||
          chat.id?.user || 'Unknown';

        console.log('[PrinChat Page] Chat name:', chatName);

        // Get profile picture URL
        let chatPhoto: string | undefined = undefined;
        try {
          console.log('[PrinChat Page] Checking for chat photo...');

          // Strategy 1: Try WPPConnect API first (most reliable)
          if ((window as any).WPP?.contact?.getProfilePictureUrl) {
            console.log('[PrinChat Page] Trying WPP.contact.getProfilePictureUrl...');
            try {
              const pictureUrl = await (window as any).WPP.contact.getProfilePictureUrl(chatId);
              if (pictureUrl) {
                console.log('[PrinChat Page] Got photo from WPP:', pictureUrl);
                chatPhoto = pictureUrl;
              }
            } catch (wppError) {
              console.log('[PrinChat Page] WPP.contact.getProfilePictureUrl failed:', wppError);
            }
          }

          // Strategy 2: Try contact.profilePicThumb
          if (!chatPhoto && contact?.profilePicThumb) {
            console.log('[PrinChat Page] Trying contact.profilePicThumb...');
            chatPhoto = contact.profilePicThumb.eurl || contact.profilePicThumb.imgFull || contact.profilePicThumb.img;
            if (chatPhoto) console.log('[PrinChat Page] Got photo from contact.profilePicThumb');
          }

          // Strategy 3: Try chat.profilePicThumb
          if (!chatPhoto && chat?.profilePicThumb) {
            console.log('[PrinChat Page] Trying chat.profilePicThumb...');
            chatPhoto = chat.profilePicThumb.eurl || chat.profilePicThumb.imgFull || chat.profilePicThumb.img;
            if (chatPhoto) console.log('[PrinChat Page] Got photo from chat.profilePicThumb');
          }

          // Strategy 4: Try contact.img field directly
          if (!chatPhoto && contact?.img) {
            console.log('[PrinChat Page] Trying contact.img...');
            chatPhoto = contact.img;
            if (chatPhoto) console.log('[PrinChat Page] Got photo from contact.img');
          }

          // Strategy 5: Try Store.ProfilePicThumb.find()
          if (!chatPhoto && (window as any).Store?.ProfilePicThumb) {
            console.log('[PrinChat Page] Trying Store.ProfilePicThumb.find()...');
            try {
              const profilePic = await (window as any).Store.ProfilePicThumb.find(chat.id);
              if (profilePic) {
                console.log('[PrinChat Page] ProfilePicThumb object:', profilePic);
                chatPhoto = profilePic.eurl || profilePic.imgFull || profilePic.img;
                if (chatPhoto) console.log('[PrinChat Page] Got photo from Store.ProfilePicThumb');
              }
            } catch (storeError) {
              console.log('[PrinChat Page] Store.ProfilePicThumb.find() failed:', storeError);
            }
          }

          // Strategy 6: Try forcing a refresh via Store.ProfilePicThumb
          if (!chatPhoto && (window as any).Store?.ProfilePicThumb) {
            console.log('[PrinChat Page] Trying to force refresh ProfilePicThumb...');
            try {
              // Try to get or create ProfilePicThumb
              const profilePicModel = await (window as any).Store.ProfilePicThumb.get(chat.id);
              if (profilePicModel) {
                console.log('[PrinChat Page] ProfilePicThumb via get():', profilePicModel);
                chatPhoto = profilePicModel.eurl || profilePicModel.imgFull || profilePicModel.img;
                if (chatPhoto) console.log('[PrinChat Page] Got photo from Store.ProfilePicThumb.get()');
              }
            } catch (getError) {
              console.log('[PrinChat Page] Store.ProfilePicThumb.get() failed:', getError);
            }
          }

          console.log('[PrinChat Page] Final chatPhoto result:', chatPhoto ? 'Found' : 'Not found');
        } catch (e: any) {
          const errorMessage = e?.message || String(e);
          console.error('[PrinChat Page] Error getting chat photo:', errorMessage, e);
        }

        document.dispatchEvent(new CustomEvent('PrinChatChatInfoResult', {
          detail: { success: true, chatName, chatId, chatPhoto, requestId }
        }));
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[PrinChat Page] Error getting chat info:', errorMessage, error);
        document.dispatchEvent(new CustomEvent('PrinChatChatInfoResult', {
          detail: { success: false, error: error.message, requestId: event.detail?.requestId }
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
            // Get message timestamp (convert to milliseconds if needed)
            const msgTimestamp = msg.t ? msg.t * 1000 : Date.now();
            const messageAge = Date.now() - msgTimestamp;

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

            // Notify content script about new message
            document.dispatchEvent(new CustomEvent('PrinChatIncomingMessage', {
              detail: {
                messageText: msg.body,
                chatId: msg.from?.toString() || '',
                timestamp: msgTimestamp
              }
            }));
          }
        });
        console.log('[PrinChat] Message monitoring active (with deduplication)');
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[PrinChat] Failed to setup message monitoring:', errorMessage, error);
    }

  }).catch(() => {
    // Initialization failed silently
  });

})();
