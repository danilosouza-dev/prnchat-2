/**
 * X1Flox - WhatsApp Page Context Script
 * This script runs in the page context (world: MAIN)
 * Uses window.Store (WhatsApp's internal API) to send messages invisibly
 */

(function () {
  'use strict';

  // Configuration
  const DEBUG_MODE = false; // Set to true to enable debug panel
  const MAX_VIDEO_SIZE_MB = 16; // WhatsApp video size limit

  const scriptVersion = 'v2.0-' + Date.now();

  (window as any).__X1FLOX_VERSION__ = scriptVersion;

  // Prevent multiple injections
  if ((window as any).__X1FLOX_INJECTED__) {
    return;
  }
  (window as any).__X1FLOX_INJECTED__ = true;

  // Debug panel (only in debug mode)
  if (DEBUG_MODE) {
    const debugPanel = document.createElement('div');
    debugPanel.id = 'x1flox-debug-panel';
    debugPanel.style.cssText = `
      position: fixed; top: 10px; right: 10px; width: 400px; max-height: 80vh;
      overflow-y: auto; background: rgba(0, 0, 0, 0.9); color: #00ff00;
      padding: 15px; z-index: 999999; font-family: monospace; font-size: 11px;
      border: 2px solid #00ff00; border-radius: 8px;
    `;
    debugPanel.innerHTML = `<h3 style="margin: 0 0 10px 0;">X1FLOX DEBUG</h3><div id="x1flox-debug-logs"></div>`;
    document.body.appendChild(debugPanel);
  }

  const debugLog = (_msg: string, _color = '#00ff00') => {
    if (DEBUG_MODE) {
      const logsDiv = document.getElementById('x1flox-debug-logs');
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
        } else if ((window as any).__X1FLOX_STORE_READY__) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 500);
    });
  }

  // Helper functions for chat presence simulation
  async function simulateTyping(chat: any, durationMs: number = 3000) {
    const Store = (window as any).Store;
    console.log('[X1Flox] simulateTyping called - duration:', durationMs, 'ms');
    console.log('[X1Flox] Store.ChatState available?', !!Store.ChatState);
    console.log('[X1Flox] WPP.chat.markIsComposing available?', !!((window as any).WPP?.chat?.markIsComposing));

    try {
      // Try different methods to set typing state
      if (Store.ChatState) {
        console.log('[X1Flox] ✅ Using Store.ChatState for typing simulation');
        await Store.ChatState.sendChatStateComposing(chat.id);
        console.log('[X1Flox] Typing state set, waiting', durationMs, 'ms...');

        // Wait for the specified duration
        await new Promise(resolve => setTimeout(resolve, durationMs));

        // Stop typing
        console.log('[X1Flox] Stopping typing state...');
        await Store.ChatState.sendChatStatePaused(chat.id);
        console.log('[X1Flox] ✅ Typing simulation complete');
      } else if ((window as any).WPP?.chat?.markIsComposing) {
        console.log('[X1Flox] ✅ Using WPP.chat.markIsComposing for typing simulation');
        await (window as any).WPP.chat.markIsComposing(chat.id._serialized || chat.id, durationMs);
        console.log('[X1Flox] ✅ Typing simulation complete via WPP');
      } else {
        console.warn('[X1Flox] ⚠️ No typing simulation API available (Store.ChatState and WPP.chat.markIsComposing not found)');
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[X1Flox] ❌ Error simulating typing:', errorMessage, error);
      // Continue anyway - non-critical feature
    }
  }

  async function simulateRecording(chat: any, durationMs: number = 3000) {
    const Store = (window as any).Store;
    console.log('[X1Flox] simulateRecording called - duration:', durationMs, 'ms');
    console.log('[X1Flox] Store.ChatState available?', !!Store.ChatState);
    console.log('[X1Flox] WPP.chat.markIsRecording available?', !!((window as any).WPP?.chat?.markIsRecording));

    try {
      // Try different methods to set recording state
      if (Store.ChatState) {
        console.log('[X1Flox] ✅ Using Store.ChatState for recording simulation');
        await Store.ChatState.sendChatStateRecording(chat.id);
        console.log('[X1Flox] Recording state set, waiting', durationMs, 'ms...');

        // Wait for the specified duration
        await new Promise(resolve => setTimeout(resolve, durationMs));

        // Stop recording
        console.log('[X1Flox] Stopping recording state...');
        await Store.ChatState.sendChatStatePaused(chat.id);
        console.log('[X1Flox] ✅ Recording simulation complete');
      } else if ((window as any).WPP?.chat?.markIsRecording) {
        console.log('[X1Flox] ✅ Using WPP.chat.markIsRecording for recording simulation');
        await (window as any).WPP.chat.markIsRecording(chat.id._serialized || chat.id, durationMs);
        console.log('[X1Flox] ✅ Recording simulation complete via WPP');
      } else {
        console.warn('[X1Flox] ⚠️ No recording simulation API available (Store.ChatState and WPP.chat.markIsRecording not found)');
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[X1Flox] ❌ Error simulating recording:', errorMessage, error);
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
    document.addEventListener('X1FloxStartAnimation', async (event: any) => {
      try {
        const { messageId, chatId, animationType, duration } = event.detail;

        const chat = await Store.Chat.find(chatId);
        if (!chat) {
          console.error('[X1Flox Page] Chat not found:', chatId);
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
              console.error('[X1Flox Page] Animation error:', err);
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
              console.error('[X1Flox Page] Animation error:', err);
              // Clean up on error too
              activeAnimations.delete(messageId);
              if (activeChatAnimations.get(chatId) === messageId) {
                activeChatAnimations.delete(chatId);
              }
            });
        }
      } catch (error: any) {
        console.error('[X1Flox Page] Error starting animation:', error);
      }
    });

    // Listen for animation stop requests (NEW ARCHITECTURE)
    document.addEventListener('X1FloxStopAnimation', async (event: any) => {
      try {
        const { messageId, chatId } = event.detail;
        console.log('[X1Flox Page] Stopping animation for message:', messageId);

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
        console.error('[X1Flox Page] Error stopping animation:', error);
      }
    });

    // Listen for message send requests
    document.addEventListener('X1FloxSendMessage', async (event: any) => {
      try {
        const { text, requestId, chatId } = event.detail;

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

        document.dispatchEvent(new CustomEvent('X1FloxMessageSent', {
          detail: { success: true, requestId, method: 'STORE_API' }
        }));
      } catch (error: any) {
        document.dispatchEvent(new CustomEvent('X1FloxMessageSent', {
          detail: { success: false, error: error.message, requestId: event.detail.requestId }
        }));
      }
    });

    // Listen for audio send requests
    document.addEventListener('X1FloxSendAudio', async (event: any) => {
      let requestId = 'unknown';
      try {
        console.log('[X1Flox Page] Audio send request received:', event.detail);
        const { audioData, duration, requestId: reqId, chatId } = event.detail;
        requestId = reqId;
        console.log('[X1Flox Page] Request ID:', requestId);

        // Determine target chat ID
        let targetChatId: string;
        let targetChat: any = null;

        if (chatId) {
          console.log('[X1Flox Page] Using provided chat ID:', chatId);
          // Use the chatId directly without fetching the full chat object
          targetChatId = chatId;
          // No need to fetch chat - animation handled separately
        } else {
          // Get active chat
          targetChat = Store.Chat.getActive();
          if (!targetChat) throw new Error('No active chat');
          // Extract ID immediately to avoid circular reference issues later
          targetChatId = targetChat.id._serialized || targetChat.id.toString();
          console.log('[X1Flox Page] Using active chat ID:', targetChatId);
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

        console.log('[X1Flox Page] Applying isGroup monkey-patch to prevent stack overflow');

        // CRITICAL FIX: Monkey-patch the isGroup getter on the chat prototype
        // This prevents the infinite recursion bug in WPPConnect
        try {
          // Get chat object first
          if (!targetChat) {
            targetChat = await Store.Chat.find(targetChatId);
            if (!targetChat) throw new Error(`Chat ${targetChatId} not found`);
          }

          console.log('[X1Flox Page] Chat found, applying isGroup fix...');

          // Get the constructor/prototype of the chat object
          const chatProto = Object.getPrototypeOf(targetChat);

          // Check if isGroup is a getter property
          const isGroupDescriptor = Object.getOwnPropertyDescriptor(chatProto, 'isGroup');

          if (isGroupDescriptor && isGroupDescriptor.get) {
            console.log('[X1Flox Page] Found isGroup getter, replacing with safe version...');

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

            console.log('[X1Flox Page] ✅ isGroup getter successfully patched!');
          } else {
            console.log('[X1Flox Page] isGroup is not a getter or not found');
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
            console.log('[X1Flox Page] ✅ isGroup also set directly on chat instance');
          } catch (e) {
            console.log('[X1Flox Page] Could not set isGroup on instance (non-critical)');
          }

        } catch (patchError: any) {
          console.log('[X1Flox Page] Warning: Could not patch isGroup:', patchError.message);
          // Continue anyway - we'll try to send without the patch
        }

        console.log('[X1Flox Page] Audio blob size:', audioBlob.size, 'bytes, type:', detectedMimeType);

        // Create File object for audio (same as original working version)
        const audioFile = new File([audioBlob], `ptt-${Date.now()}.ogg`, {
          type: detectedMimeType,
          lastModified: Date.now()
        });

        console.log('[X1Flox Page] Created audio file:', audioFile.name);

        // Use WPPConnect as it was before when it worked
        const WPP = (window as any).WPP;
        if (!WPP?.chat?.sendFileMessage) {
          throw new Error('WPPConnect not available');
        }

        // Extract chat ID as a clean string to avoid circular reference issues
        const chatIdString = typeof targetChat.id === 'string'
          ? targetChat.id
          : (targetChat.id._serialized || String(targetChat.id));

        console.log('[X1Flox Page] Sending audio file to chat:', chatIdString);
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

        console.log('[X1Flox Page] ✅ Audio sent successfully!');

        document.dispatchEvent(new CustomEvent('X1FloxMessageSent', {
          detail: { success: true, requestId, method: 'STORE_API_PURE' }
        }));
      } catch (error: any) {
        console.error('[X1Flox Page] ❌ ERROR in audio send:', error);
        console.error('[X1Flox Page] Error type:', typeof error);
        console.error('[X1Flox Page] Error message:', error?.message);
        console.error('[X1Flox Page] Error stack:', error?.stack);
        debugLog(`❌ ERROR: ${error?.message || String(error)}`, '#ff0000');
        document.dispatchEvent(new CustomEvent('X1FloxMessageSent', {
          detail: { success: false, error: error?.message || String(error) || 'Unknown error', requestId }
        }));
      }
    });

    // Listen for image send requests
    document.addEventListener('X1FloxSendImage', async (event: any) => {
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
          console.log('[X1Flox Page] Chat found, applying isGroup fix...');
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
          } catch (e) { console.log('[X1Flox Page] Could not set isGroup on instance'); }
        } catch (patchError: any) {
          console.log('[X1Flox Page] Warning: Could not patch isGroup:', patchError.message);
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

        console.log('[X1Flox Page] Sending image file to chat:', chatIdString);
        await WPP.chat.sendFileMessage(
          chatIdString,
          imageFile,
          { type: 'image', caption: caption || '' }
        );

        document.dispatchEvent(new CustomEvent('X1FloxMessageSent', {
          detail: { success: true, requestId, method: 'IMAGE' }
        }));
      } catch (error: any) {
        debugLog(`❌ ERROR: ${error.message}`, '#ff0000');
        document.dispatchEvent(new CustomEvent('X1FloxMessageSent', {
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
    document.addEventListener('X1FloxSendVideo', async (event: any) => {
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
          console.log('[X1Flox Page] Chat found, applying isGroup fix...');
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
          } catch (e) { console.log('[X1Flox Page] Could not set isGroup on instance'); }
        } catch (patchError: any) {
          console.log('[X1Flox Page] Warning: Could not patch isGroup:', patchError.message);
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

        console.log('[X1Flox Page] Sending video file to chat:', chatIdString);

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

        document.dispatchEvent(new CustomEvent('X1FloxMessageSent', {
          detail: { success: true, requestId, method: 'VIDEO' }
        }));
      } catch (error: any) {
        debugLog(`❌ ERROR: ${error.message}`, '#ff0000');
        document.dispatchEvent(new CustomEvent('X1FloxMessageSent', {
          detail: { success: false, error: error.message, requestId }
        }));
      }
    });

    // =========================================================================
    // FILE SENDING
    // =========================================================================
    document.addEventListener('X1FloxSendFile', async (event: any) => {
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
          console.log('[X1Flox Page] Chat found, applying isGroup fix...');
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
          } catch (e) { console.log('[X1Flox Page] Could not set isGroup on instance'); }
        } catch (patchError: any) {
          console.log('[X1Flox Page] Warning: Could not patch isGroup:', patchError.message);
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

        console.log('[X1Flox Page] Sending file to chat:', chatIdString);

        // Send file as document
        await WPP.chat.sendFileMessage(chatIdString, file, {
          type: 'document',
          caption: caption || '',
          filename: fileName || file.name
        });

        document.dispatchEvent(new CustomEvent('X1FloxMessageSent', {
          detail: { success: true, requestId, method: 'FILE' }
        }));
      } catch (error: any) {
        debugLog(`❌ ERROR: ${error.message}`, '#ff0000');
        document.dispatchEvent(new CustomEvent('X1FloxMessageSent', {
          detail: { success: false, error: error.message, requestId }
        }));
      }
    });

    // Listen for active chat info requests
    document.addEventListener('X1FloxGetActiveChat', async (event: any) => {
      try {
        const { requestId } = event.detail;
        const activeChat = Store.Chat.getActive();

        if (!activeChat) {
          document.dispatchEvent(new CustomEvent('X1FloxActiveChatResult', {
            detail: { success: false, error: 'No active chat', requestId }
          }));
          return;
        }

        // Get contact name from chat
        const contact = activeChat.contact;
        const chatName = contact?.pushname || contact?.name || contact?.formattedName ||
          activeChat.formattedTitle || activeChat.name ||
          activeChat.id?.user || 'Unknown';

        // Get chatId for targeting
        const chatId = activeChat.id?._serialized || activeChat.id?.toString() || '';

        // Get profile picture URL
        let chatPhoto: string | undefined = undefined;
        try {
          console.log('[X1Flox] Checking for chat photo...');
          console.log('[X1Flox] Contact object:', contact);
          console.log('[X1Flox] ActiveChat object:', activeChat);

          // Try multiple sources for profile picture
          if (contact?.profilePicThumb) {
            console.log('[X1Flox] Contact profilePicThumb:', contact.profilePicThumb);
            chatPhoto = contact.profilePicThumb.eurl || contact.profilePicThumb.imgFull || contact.profilePicThumb.img;
          }

          if (!chatPhoto && activeChat?.profilePicThumb) {
            console.log('[X1Flox] ActiveChat profilePicThumb:', activeChat.profilePicThumb);
            chatPhoto = activeChat.profilePicThumb.eurl || activeChat.profilePicThumb.imgFull || activeChat.profilePicThumb.img;
          }

          // Try contact.img field directly
          if (!chatPhoto && contact?.img) {
            console.log('[X1Flox] Contact img:', contact.img);
            chatPhoto = contact.img;
          }

          // Try getting from Store.ProfilePicThumb
          if (!chatPhoto && (window as any).Store?.ProfilePicThumb) {
            console.log('[X1Flox] Trying Store.ProfilePicThumb...');
            const profilePic = await (window as any).Store.ProfilePicThumb.find(activeChat.id);
            if (profilePic) {
              console.log('[X1Flox] ProfilePicThumb from Store:', profilePic);
              chatPhoto = profilePic.eurl || profilePic.imgFull || profilePic.img;
            }
          }

          console.log('[X1Flox] Final chatPhoto:', chatPhoto);
        } catch (e: any) {
          const errorMessage = e?.message || String(e);
          console.error('[X1Flox] Error getting chat photo:', errorMessage, e);
        }

        document.dispatchEvent(new CustomEvent('X1FloxActiveChatResult', {
          detail: { success: true, chatName, chatId, chatPhoto, requestId }
        }));
      } catch (error: any) {
        document.dispatchEvent(new CustomEvent('X1FloxActiveChatResult', {
          detail: { success: false, error: error.message, requestId: event.detail?.requestId }
        }));
      }
    });

    // Listen for open chat requests
    document.addEventListener('X1FloxOpenChat', async (event: any) => {
      try {
        const { chatId, requestId } = event.detail;

        if (!chatId) {
          document.dispatchEvent(new CustomEvent('X1FloxOpenChatResult', {
            detail: { success: false, error: 'No chatId provided', requestId }
          }));
          return;
        }

        // Find the chat by ID
        const chat = await Store.Chat.find(chatId);

        if (!chat) {
          document.dispatchEvent(new CustomEvent('X1FloxOpenChatResult', {
            detail: { success: false, error: 'Chat not found', requestId }
          }));
          return;
        }

        // Open the chat
        await Store.Chat.setActiveChat(chat);

        document.dispatchEvent(new CustomEvent('X1FloxOpenChatResult', {
          detail: { success: true, requestId }
        }));
      } catch (error: any) {
        document.dispatchEvent(new CustomEvent('X1FloxOpenChatResult', {
          detail: { success: false, error: error.message, requestId: event.detail?.requestId }
        }));
      }
    });

    // Listen for get chat info by ID requests (for triggers)
    document.addEventListener('X1FloxGetChatInfo', async (event: any) => {
      try {
        const { chatId, requestId } = event.detail;

        if (!chatId) {
          document.dispatchEvent(new CustomEvent('X1FloxChatInfoResult', {
            detail: { success: false, error: 'No chatId provided', requestId }
          }));
          return;
        }

        console.log('[X1Flox Page] Getting chat info for:', chatId);

        // Find the chat by ID
        const chat = await Store.Chat.find(chatId);

        if (!chat) {
          console.log('[X1Flox Page] Chat not found:', chatId);
          document.dispatchEvent(new CustomEvent('X1FloxChatInfoResult', {
            detail: { success: false, error: 'Chat not found', requestId }
          }));
          return;
        }

        console.log('[X1Flox Page] Chat found:', chat);

        // Get contact name from chat
        const contact = chat.contact;
        const chatName = contact?.pushname || contact?.name || contact?.formattedName ||
          chat.formattedTitle || chat.name ||
          chat.id?.user || 'Unknown';

        console.log('[X1Flox Page] Chat name:', chatName);

        // Get profile picture URL
        let chatPhoto: string | undefined = undefined;
        try {
          console.log('[X1Flox Page] Checking for chat photo...');

          // Strategy 1: Try WPPConnect API first (most reliable)
          if ((window as any).WPP?.contact?.getProfilePictureUrl) {
            console.log('[X1Flox Page] Trying WPP.contact.getProfilePictureUrl...');
            try {
              const pictureUrl = await (window as any).WPP.contact.getProfilePictureUrl(chatId);
              if (pictureUrl) {
                console.log('[X1Flox Page] Got photo from WPP:', pictureUrl);
                chatPhoto = pictureUrl;
              }
            } catch (wppError) {
              console.log('[X1Flox Page] WPP.contact.getProfilePictureUrl failed:', wppError);
            }
          }

          // Strategy 2: Try contact.profilePicThumb
          if (!chatPhoto && contact?.profilePicThumb) {
            console.log('[X1Flox Page] Trying contact.profilePicThumb...');
            chatPhoto = contact.profilePicThumb.eurl || contact.profilePicThumb.imgFull || contact.profilePicThumb.img;
            if (chatPhoto) console.log('[X1Flox Page] Got photo from contact.profilePicThumb');
          }

          // Strategy 3: Try chat.profilePicThumb
          if (!chatPhoto && chat?.profilePicThumb) {
            console.log('[X1Flox Page] Trying chat.profilePicThumb...');
            chatPhoto = chat.profilePicThumb.eurl || chat.profilePicThumb.imgFull || chat.profilePicThumb.img;
            if (chatPhoto) console.log('[X1Flox Page] Got photo from chat.profilePicThumb');
          }

          // Strategy 4: Try contact.img field directly
          if (!chatPhoto && contact?.img) {
            console.log('[X1Flox Page] Trying contact.img...');
            chatPhoto = contact.img;
            if (chatPhoto) console.log('[X1Flox Page] Got photo from contact.img');
          }

          // Strategy 5: Try Store.ProfilePicThumb.find()
          if (!chatPhoto && (window as any).Store?.ProfilePicThumb) {
            console.log('[X1Flox Page] Trying Store.ProfilePicThumb.find()...');
            try {
              const profilePic = await (window as any).Store.ProfilePicThumb.find(chat.id);
              if (profilePic) {
                console.log('[X1Flox Page] ProfilePicThumb object:', profilePic);
                chatPhoto = profilePic.eurl || profilePic.imgFull || profilePic.img;
                if (chatPhoto) console.log('[X1Flox Page] Got photo from Store.ProfilePicThumb');
              }
            } catch (storeError) {
              console.log('[X1Flox Page] Store.ProfilePicThumb.find() failed:', storeError);
            }
          }

          // Strategy 6: Try forcing a refresh via Store.ProfilePicThumb
          if (!chatPhoto && (window as any).Store?.ProfilePicThumb) {
            console.log('[X1Flox Page] Trying to force refresh ProfilePicThumb...');
            try {
              // Try to get or create ProfilePicThumb
              const profilePicModel = await (window as any).Store.ProfilePicThumb.get(chat.id);
              if (profilePicModel) {
                console.log('[X1Flox Page] ProfilePicThumb via get():', profilePicModel);
                chatPhoto = profilePicModel.eurl || profilePicModel.imgFull || profilePicModel.img;
                if (chatPhoto) console.log('[X1Flox Page] Got photo from Store.ProfilePicThumb.get()');
              }
            } catch (getError) {
              console.log('[X1Flox Page] Store.ProfilePicThumb.get() failed:', getError);
            }
          }

          console.log('[X1Flox Page] Final chatPhoto result:', chatPhoto ? 'Found' : 'Not found');
        } catch (e: any) {
          const errorMessage = e?.message || String(e);
          console.error('[X1Flox Page] Error getting chat photo:', errorMessage, e);
        }

        document.dispatchEvent(new CustomEvent('X1FloxChatInfoResult', {
          detail: { success: true, chatName, chatId, chatPhoto, requestId }
        }));
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[X1Flox Page] Error getting chat info:', errorMessage, error);
        document.dispatchEvent(new CustomEvent('X1FloxChatInfoResult', {
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
              console.log('[X1Flox] Skipping old/history message:', {
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
              console.log('[X1Flox] Skipping duplicate message:', msg.body.substring(0, 30));
              return;
            }

            // Mark as processed
            processedMessages.add(messageId);

            // Clean up old processed messages periodically
            if (processedMessages.size > 100) {
              const oldMessages = Array.from(processedMessages).slice(0, 50);
              oldMessages.forEach(id => processedMessages.delete(id));
            }

            console.log('[X1Flox] New message received:', msg.body, `(age: ${messageAge}ms)`);

            // Notify content script about new message
            document.dispatchEvent(new CustomEvent('X1FloxIncomingMessage', {
              detail: {
                messageText: msg.body,
                chatId: msg.from?.toString() || '',
                timestamp: msgTimestamp
              }
            }));
          }
        });
        console.log('[X1Flox] Message monitoring active (with deduplication)');
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[X1Flox] Failed to setup message monitoring:', errorMessage, error);
    }

  }).catch(() => {
    // Initialization failed silently
  });

})();
