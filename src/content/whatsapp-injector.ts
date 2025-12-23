/**
 * PrinChat - WhatsApp Web Content Script (Isolated World)
 * Runs in isolated world, communicates with popup and page script
 * The page script (whatsapp-page-script.ts) runs in page context and accesses WhatsApp API
 */

(function () {
  'use strict';

  console.log('[PrinChat] Content script loaded');

  // Create marker in DOM - will be used to pass config to page scripts
  // Ensure it's added even if body is not ready yet
  function ensureMarker() {
    let marker = document.getElementById('PrinChatInjected');
    if (!marker) {
      marker = document.createElement('div');
      marker.id = 'PrinChatInjected';
      marker.style.display = 'none';
      (document.body || document.documentElement).appendChild(marker);
      console.log('[PrinChat] Marker created and appended to:', document.body ? 'body' : 'documentElement');
    }
    return marker;
  }

  // Create marker immediately
  ensureMarker();

  // Reset view mode to header on startup (User requirement: Start without floating button)
  chrome.storage.local.set({ princhat_view_mode: 'header' }, () => {
    console.log('[PrinChat] View mode reset to "header" on startup');
  });

  // Selectors for WhatsApp Web
  const SELECTORS = {
    chatContainer: '#main'
  };

  // Script Executor class
  class ScriptExecutor {
    private executions = new Map<string, {
      state: any;
      isPaused: boolean;
      isCancelled: boolean;
      delayTimeout: any;
      targetChatId: string;  // Store target chat ID for each execution
    }>();
    private injector: WhatsAppInjector | null = null;

    setInjector(injector: WhatsAppInjector) {
      this.injector = injector;
    }

    async executeScript(scriptId: string, providedChatId?: string): Promise<any> {
      let executionId: string = '';

      try {
        console.log('[PrinChat] Starting script execution via ScriptExecutor:', scriptId);
        console.log('[PrinChat] Provided chatId:', providedChatId || 'none (will use active chat)');
        console.log('[PrinChat] Fetching script from service worker (NOT IndexedDB)...');

        // IMPORTANT: Content script can't access extension's IndexedDB directly!
        // We must fetch the script via the service worker
        const scriptData = await this.getScriptFromServiceWorker(scriptId);

        if (!scriptData || !scriptData.success) {
          console.error('[PrinChat] Failed to fetch script from service worker:', scriptData?.error);
          return { success: false, error: scriptData?.error || 'Failed to fetch script' };
        }

        const script = scriptData.data;
        console.log('[PrinChat] Script loaded successfully:', script.name, 'with', script.steps.length, 'steps');

        // Determine target chat
        let targetChatId: string;
        let targetChatName: string;
        let targetChatPhoto: string | undefined;

        if (providedChatId) {
          // Use provided chat ID (from trigger)
          targetChatId = providedChatId;

          // Fetch real chat data (name and photo) from WhatsApp API
          console.log('[PrinChat] Fetching chat info for trigger:', targetChatId);
          const chatInfoResult = await this.injector?.getChatInfo(targetChatId);

          if (chatInfoResult?.success && chatInfoResult.data) {
            targetChatName = chatInfoResult.data.chatName;
            targetChatPhoto = chatInfoResult.data.chatPhoto;
            console.log('[PrinChat] Got real chat data:', targetChatName, 'Photo:', !!targetChatPhoto);
          } else {
            // Fallback: Extract a readable name from chatId (usually format: phone@c.us or phone@g.us)
            const match = providedChatId.match(/^(\d+)@/);
            const phoneNumber = match ? match[1] : providedChatId;
            // Format phone number nicely: +55 11 99988-7766
            const formatted = phoneNumber.length > 10
              ? `+${phoneNumber.slice(0, 2)} ${phoneNumber.slice(2, 4)} ${phoneNumber.slice(4)}`
              : phoneNumber;
            targetChatName = formatted;
            targetChatPhoto = undefined;
            console.log('[PrinChat] Failed to get chat info, using fallback:', targetChatName);
          }
        } else {
          // Get the active chat (for popup/manual execution)
          // This ensures messages are sent to the correct chat even if user navigates away
          const activeChatResult = await this.injector?.getActiveChat();
          if (!activeChatResult?.success || !activeChatResult.data?.chatId) {
            console.error('[PrinChat] Failed to get active chat:', activeChatResult?.error);
            return { success: false, error: 'No active chat found. Please open a chat first.' };
          }

          targetChatId = activeChatResult.data.chatId;
          targetChatName = activeChatResult.data.chatName;
          targetChatPhoto = activeChatResult.data.chatPhoto;
          console.log('[PrinChat] Script will execute for active chat:', targetChatName, 'ID:', targetChatId);
        }

        // Generate unique execution ID (not just script.id from database)
        executionId = `exec-${script.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Initialize execution state for this specific execution
        const execution = {
          state: {
            scriptId: script.id,
            scriptName: script.name,
            totalMessages: script.steps.length,
            sentMessages: 0,
            isRunning: true,
            isPaused: false,
            startTime: Date.now(),
            currentStepIndex: 0,
            targetChatId: targetChatId,  // Store the target chat ID
            targetChatName: targetChatName  // Store the target chat name
          },
          isPaused: false,
          isCancelled: false,
          delayTimeout: null,
          targetChatId: targetChatId  // Also store at execution level for easy access
        };

        this.executions.set(executionId, execution);

        // Dispatch PrinChatScriptStart event for UI overlay to create popup
        document.dispatchEvent(new CustomEvent('PrinChatScriptStart', {
          detail: {
            scriptId: executionId,  // Use unique execution ID
            scriptName: script.name,
            totalSteps: script.steps.length,
            targetChatId: targetChatId,      // Chat that will receive messages
            targetChatName: targetChatName,   // Chat name for display
            targetChatPhoto: targetChatPhoto  // Chat photo for display
          }
        }));

        // Note: We don't call notifyExecutionStateChange() here anymore
        // because the whatsapp-ui-overlay popup is now handling all visualization

        // Execute steps (service worker returns steps with message data embedded)
        for (let i = 0; i < script.steps.length; i++) {
          // Check if cancelled
          if (execution.isCancelled) {
            console.log('[PrinChat] Script execution cancelled:', executionId);
            break;
          }

          // Wait if paused
          while (execution.isPaused && !execution.isCancelled) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Check again after pause
          if (execution.isCancelled) {
            break;
          }

          const step = script.steps[i];
          execution.state.currentStepIndex = i;

          console.log('[PrinChat] Executing step', i + 1, 'of', script.steps.length);

          // Service worker provides steps with message data already embedded
          const message = step.message;
          if (!message) {
            console.error('[PrinChat] Message data missing in step:', i);
            continue;
          }

          // IMPORTANT: In scripts, we use step.delayAfter as the delay BEFORE sending (not after)
          // The message's original sendDelay is ignored - only script timing matters
          const scriptDelay = step.delayAfter || 0;

          // Send message
          let result;

          if (!this.injector) {
            console.error('[PrinChat] Injector not initialized!');
            result = { success: false, error: 'Injector not initialized' };
          } else {
            switch (message.type) {
              case 'text':
                // Apply script delay BEFORE sending (allows pause to prevent sending)
                if (scriptDelay > 0) {
                  await this.delay(scriptDelay, execution);
                }
                // Check if cancelled after delay
                if (execution.isCancelled) {
                  console.log('[PrinChat] Script cancelled after text delay');
                  result = { success: false, error: 'Cancelled' };
                  break;
                }
                // Send text message with NO delay (delay already applied)
                result = await this.injector.sendTextMessage(
                  message.content,
                  execution.targetChatId,
                  message.showTyping,
                  0  // Delay already applied above
                );
                break;
              case 'audio':
                if (message.audioData) {
                  // Apply script delay BEFORE sending (allows pause to prevent sending)
                  if (scriptDelay > 0) {
                    await this.delay(scriptDelay, execution);
                  }
                  // Check if cancelled after delay
                  if (execution.isCancelled) {
                    console.log('[PrinChat] Script cancelled after audio delay');
                    result = { success: false, error: 'Cancelled' };
                    break;
                  }
                  // Send audio message with NO delay (delay already applied)
                  result = await this.injector.sendAudio({
                    audioData: message.audioData,
                    duration: message.duration,
                    chatId: execution.targetChatId,
                    showRecording: message.showRecording,
                    sendDelay: 0  // Delay already applied above
                  });
                } else {
                  result = { success: false, error: 'Audio data missing' };
                }
                break;
              case 'image':
                if (message.imageData) {
                  // For image: apply script delay before sending (no animation)
                  if (scriptDelay > 0) {
                    await this.delay(scriptDelay, execution);
                  }
                  // Check if cancelled after delay
                  if (execution.isCancelled) {
                    console.log('[PrinChat] Script cancelled after image delay');
                    result = { success: false, error: 'Cancelled' };
                    break;
                  }
                  result = await this.injector.sendImage({
                    imageData: message.imageData,
                    caption: message.caption || '',
                    chatId: execution.targetChatId
                  });
                } else {
                  result = { success: false, error: 'Image data missing' };
                }
                break;
              case 'video':
                if (message.videoData) {
                  // For video: apply script delay before sending (no animation)
                  if (scriptDelay > 0) {
                    await this.delay(scriptDelay, execution);
                  }
                  // Check if cancelled after delay
                  if (execution.isCancelled) {
                    console.log('[PrinChat] Script cancelled after video delay');
                    result = { success: false, error: 'Cancelled' };
                    break;
                  }
                  result = await this.injector.sendVideo({
                    videoData: message.videoData,
                    caption: message.caption || '',
                    chatId: execution.targetChatId
                  });
                } else {
                  result = { success: false, error: 'Video data missing' };
                }
                break;
              case 'file':
                if (message.fileData) {
                  // For file: apply script delay before sending (no animation)
                  if (scriptDelay > 0) {
                    await this.delay(scriptDelay, execution);
                  }
                  // Check if cancelled after delay
                  if (execution.isCancelled) {
                    console.log('[PrinChat] Script cancelled after file delay');
                    result = { success: false, error: 'Cancelled' };
                    break;
                  }
                  result = await this.injector.sendFile({
                    fileData: message.fileData,
                    fileName: message.fileName || 'file',
                    caption: message.caption || '',
                    chatId: execution.targetChatId
                  });
                } else {
                  result = { success: false, error: 'File data missing' };
                }
                break;
              default:
                result = { success: false, error: `Unknown message type: ${message.type}` };
            }
          }

          if (result?.success) {
            execution.state.sentMessages++;
            console.log('[PrinChat] Message sent successfully:', i + 1);

            // Dispatch progress event for UI overlay
            document.dispatchEvent(new CustomEvent('PrinChatScriptProgress', {
              detail: {
                scriptId: executionId,
                step: i + 1,
                status: 'success'
              }
            }));

            // CRITICAL: Wait after sending message to ensure WhatsApp completes the send
            // before starting the next animation (prevents next animation from being cut)
            if (i < script.steps.length - 1) {
              console.log('[PrinChat] Waiting 800ms for message to fully send before next animation...');
              await new Promise(resolve => setTimeout(resolve, 800));
            }
          } else {
            // Distinguish between intentional cancellation and real errors
            if (result?.error === 'Cancelled') {
              console.log('[PrinChat] Message cancelled by user (type:', message.type, ')');
            } else {
              console.error('[PrinChat] Failed to send message (type:', message.type, '):', result?.error || 'No error message', 'Result:', result);
            }
            // Continue to next message even if one fails
          }
        }

        // Execution complete
        execution.state.isRunning = false;
        console.log('[PrinChat] Script execution completed');

        // Clean up execution from Map
        this.executions.delete(executionId);

        // Dispatch completion event for UI overlay
        if (execution.isCancelled) {
          // Script was cancelled - don't dispatch complete event
          console.log('[PrinChat] Script was cancelled, not dispatching complete event');
        } else {
          document.dispatchEvent(new CustomEvent('PrinChatScriptComplete', {
            detail: {
              scriptId: executionId,
              success: true
            }
          }));
        }

        return { success: true };

      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[PrinChat] Error executing script:', errorMessage, error);
        const execution = this.executions.get(executionId);
        if (execution) {
          execution.state.isRunning = false;
          this.executions.delete(executionId);

          // Dispatch error event for UI overlay
          document.dispatchEvent(new CustomEvent('PrinChatScriptError', {
            detail: {
              scriptId: executionId,
              error: errorMessage
            }
          }));
        }
        return { success: false, error: errorMessage };
      }
    }

    pause(scriptId: string) {
      const execution = this.executions.get(scriptId);
      if (execution && execution.state.isRunning) {
        execution.isPaused = true;
        execution.state.isPaused = true;
        console.log('[PrinChat] Script execution paused:', scriptId);
        return { success: true };
      }
      console.warn('[PrinChat] No running script found for pause:', scriptId);
      return { success: false, error: 'No script running with this ID' };
    }

    resume(scriptId: string) {
      const execution = this.executions.get(scriptId);
      if (execution && execution.state.isRunning && execution.isPaused) {
        execution.isPaused = false;
        execution.state.isPaused = false;
        console.log('[PrinChat] Script execution resumed:', scriptId);
        return { success: true };
      }
      console.warn('[PrinChat] No paused script found for resume:', scriptId);
      return { success: false, error: 'No paused script with this ID' };
    }

    cancel(scriptId: string) {
      const execution = this.executions.get(scriptId);
      if (execution && execution.state.isRunning) {
        execution.isCancelled = true;
        if (execution.delayTimeout) {
          clearTimeout(execution.delayTimeout);
        }
        execution.state.isRunning = false;
        this.executions.delete(scriptId);
        console.log('[PrinChat] Script execution cancelled:', scriptId);
        return { success: true };
      }
      console.warn('[PrinChat] No running script found for cancel:', scriptId);
      return { success: false, error: 'No script running with this ID' };
    }

    getExecutionState() {
      // Return all executions
      const states = Array.from(this.executions.entries()).map(([id, exec]) => ({
        id,
        state: exec.state
      }));
      return {
        success: true,
        data: states.length > 0 ? states : null
      };
    }

    private async delay(ms: number, execution: any): Promise<void> {
      // Break delay into 100ms chunks for pause/cancel responsiveness (like executeScriptWithSteps)
      const chunks = Math.ceil(ms / 100);
      for (let j = 0; j < chunks; j++) {
        // Check if cancelled
        if (execution.isCancelled) {
          console.log('[PrinChat] ScriptExecutor delay cancelled');
          break;
        }

        // Wait if paused
        while (execution.isPaused && !execution.isCancelled) {
          console.log('[PrinChat] ScriptExecutor paused during delay, waiting...');
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Check again after pause
        if (execution.isCancelled) {
          console.log('[PrinChat] ScriptExecutor delay cancelled after pause');
          break;
        }

        // Sleep for chunk
        await new Promise(resolve => setTimeout(resolve, Math.min(100, ms - j * 100)));
      }
    }

    /**
     * Fetch script from service worker (which has access to IndexedDB)
     * Content script can't access extension's IndexedDB directly due to origin isolation
     */
    private async getScriptFromServiceWorker(scriptId: string): Promise<any> {
      try {
        console.log('[PrinChat] Requesting script from service worker:', scriptId);
        const response = await chrome.runtime.sendMessage({
          type: 'GET_SCRIPT',
          payload: { scriptId }
        });
        console.log('[PrinChat] Service worker response:', response);
        return response;
      } catch (error: any) {
        console.error('[PrinChat] Error fetching script from service worker:', error);
        return { success: false, error: error.message };
      }
    }
  }

  class WhatsAppInjector {
    private isReady = false;
    private pendingRequests = new Map<string, { resolve: Function, reject: Function }>();
    private scriptExecutor: ScriptExecutor;

    // Map to track multiple direct script executions (from footer shortcuts)
    // Each script has its own isolated state instead of shared global flags
    private directExecutions = new Map<string, {
      isPaused: boolean;
      isCancelled: boolean;
    }>();

    constructor() {
      this.scriptExecutor = new ScriptExecutor();
      this.scriptExecutor.setInjector(this);
      this.init();
    }

    private async init() {
      console.log('[PrinChat] Initializing injector...');

      // Wait for WhatsApp Web to load
      await this.waitForWhatsAppReady();

      // Inject WPPConnect and page script directly from content script
      await this.injectScripts();

      // Inject UI overlay
      await this.injectUIOverlay();

      // Listen for responses from page script
      document.addEventListener('PrinChatMessageSent', (event: any) => {
        console.log('[PrinChat] 📨 PrinChatMessageSent event received!', event.detail);

        const { success, error, requestId } = event.detail;
        console.log('[PrinChat] Event details:', { success, error, requestId });
        console.log('[PrinChat] Pending requests:', Array.from(this.pendingRequests.keys()));

        const pending = this.pendingRequests.get(requestId);
        console.log('[PrinChat] Found pending request?', !!pending);

        if (pending) {
          if (success) {
            console.log('[PrinChat] ✅ Resolving promise with success');
            pending.resolve({ success: true });
          } else {
            console.log('[PrinChat] ❌ Rejecting promise with error:', error);
            pending.reject(new Error(error || 'Unknown error'));
          }
          this.pendingRequests.delete(requestId);
        } else {
          console.warn('[PrinChat] ⚠️ No pending request found for requestId:', requestId);
        }
      });

      // Listen for pause/resume/cancel events from UI overlay
      document.addEventListener('PrinChatPauseScript', (event: any) => {
        const { scriptId } = event.detail;
        console.log('[PrinChat] Pause script event received:', scriptId);

        // Check if it's a direct execution (from footer) or ScriptExecutor execution
        const directExec = this.directExecutions.get(scriptId);
        if (directExec) {
          directExec.isPaused = true;
          console.log('[PrinChat] Paused direct script execution:', scriptId);
        } else {
          this.scriptExecutor.pause(scriptId);
        }
      });

      document.addEventListener('PrinChatResumeScript', (event: any) => {
        const { scriptId } = event.detail;
        console.log('[PrinChat] Resume script event received:', scriptId);

        const directExec = this.directExecutions.get(scriptId);
        if (directExec) {
          directExec.isPaused = false;
          console.log('[PrinChat] Resumed direct script execution:', scriptId);
        } else {
          this.scriptExecutor.resume(scriptId);
        }
      });

      document.addEventListener('PrinChatCancelScript', (event: any) => {
        const { scriptId } = event.detail;
        console.log('[PrinChat] Cancel script event received:', scriptId);

        const directExec = this.directExecutions.get(scriptId);
        if (directExec) {
          directExec.isCancelled = true;
          console.log('[PrinChat] Cancelled direct script execution:', scriptId);
        } else {
          this.scriptExecutor.cancel(scriptId);
        }
      });

      // Listen for incoming messages from page script (for triggers)
      document.addEventListener('PrinChatIncomingMessage', async (event: any) => {
        const { messageText, chatId, timestamp } = event.detail;
        console.log('[PrinChat] Incoming message detected:', messageText);

        // Send to service worker to check triggers
        try {
          // Check if extension context is still valid
          if (!chrome.runtime?.id) {
            console.warn('[PrinChat] Extension context invalidated, skipping trigger check');
            return;
          }

          await chrome.runtime.sendMessage({
            type: 'CHECK_TRIGGERS',
            payload: {
              messageText,
              chatId,
              timestamp
            }
          });
        } catch (error: any) {
          // Ignore "Extension context invalidated" errors and message channel errors
          if (error.message?.includes('Extension context invalidated')) {
            console.warn('[PrinChat] Extension context invalidated, trigger check skipped');
          } else if (error.message?.includes('message channel closed') ||
            error.message?.includes('The message port closed')) {
            // This can happen if the service worker is restarting or the script execution takes too long
            // It's not a critical error - the trigger check was received, just the response was lost
            console.warn('[PrinChat] Message channel closed during trigger check (non-critical)');
          } else {
            console.error('[PrinChat] Error checking triggers:', error);
          }
        }
      });

      this.isReady = true;
      console.log('[PrinChat] WhatsApp Web injector ready');

      // Listen for messages from popup
      try {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
          console.log('[PrinChat] Message received from popup:', message.type);
          this.handleAction(message)
            .then(response => {
              console.log('[PrinChat] Sending response:', response);
              sendResponse(response);
            })
            .catch(error => {
              console.error('[PrinChat] Error handling action:', error);
              sendResponse({
                success: false,
                error: error.message || 'Unknown error'
              });
            });
          return true; // Keep channel open for async
        });
        console.log('[PrinChat] Message listener registered successfully');
      } catch (error) {
        console.error('[PrinChat] Failed to register message listener:', error);
      }

      // Listen for requests from UI overlay
      console.log('[PrinChat] Setting up UI request listener...');
      document.addEventListener('PrinChatUIRequest', async (event: any) => {
        const { requestId, message } = event.detail;
        console.log('[PrinChat] 🎯 UI request received:', message.type, 'ID:', requestId);

        try {
          let response;

          if (message.type === 'GET_SCRIPTS_AND_MESSAGES' || message.type === 'GET_SETTINGS' || message.type === 'TOGGLE_SIDE_PANEL') {
            console.log('[PrinChat] Forwarding to background service worker...');

            // Check if extension context is still valid
            if (!chrome.runtime?.id) {
              throw new Error('Extension context invalidated. Please reload the page.');
            }

            // Forward to background service worker
            response = await chrome.runtime.sendMessage(message);
            console.log('[PrinChat] Got response from background:', response);

            // Restore large media data from temp storage (for GET_SCRIPTS_AND_MESSAGES)
            if (message.type === 'GET_SCRIPTS_AND_MESSAGES' && response.success) {
              console.log('[PrinChat Injector] 🔍 DEBUG - Before restoration, checking messages...');
              const fileMessages = response.data.messages?.filter((m: any) => m.type === 'file') || [];
              fileMessages.forEach((msg: any) => {
                console.log('[PrinChat Injector] 🔍 File message BEFORE restoration:', {
                  id: msg.id,
                  fileData: msg.fileData,
                  fileDataType: typeof msg.fileData,
                  isString: typeof msg.fileData === 'string',
                  startsWithTemp: typeof msg.fileData === 'string' && msg.fileData.startsWith('__TEMP_STORAGE__:')
                });
              });

              response.data.messages = await this.restoreTempMediaData(response.data.messages);

              console.log('[PrinChat Injector] 🔍 DEBUG - After restoration, checking messages...');
              const fileMessagesAfter = response.data.messages?.filter((m: any) => m.type === 'file') || [];
              fileMessagesAfter.forEach((msg: any) => {
                console.log('[PrinChat Injector] 🔍 File message AFTER restoration:', {
                  id: msg.id,
                  hasFileData: !!msg.fileData,
                  fileDataType: typeof msg.fileData,
                  fileDataLength: typeof msg.fileData === 'string' ? msg.fileData.length : 0
                });
              });
            }
          } else {
            console.log('[PrinChat] Handling as action:', message.type);
            // Handle as action (EXECUTE_SCRIPT, SEND_MESSAGE, etc)
            response = await this.handleAction(message);
          }

          console.log('[PrinChat] Sending response back to UI overlay:', response);
          document.dispatchEvent(new CustomEvent('PrinChatUIResponse', {
            detail: { requestId, response }
          }));
          console.log('[PrinChat] ✅ Response sent to UI overlay');
        } catch (error: any) {
          console.error('[PrinChat] ❌ Error handling UI request:', error);

          // Provide better error message for context invalidation
          let errorMessage = error.message || 'Unknown error';
          if (error.message?.includes('Extension context invalidated')) {
            errorMessage = 'A extensão foi atualizada. Por favor, recarregue a página.';
          }

          document.dispatchEvent(new CustomEvent('PrinChatUIResponse', {
            detail: {
              requestId,
              response: { success: false, error: errorMessage }
            }
          }));
        }
      });
      console.log('[PrinChat] ✅ UI request listener registered');

      // Listen for view mode state requests from UI overlay (which can't access chrome.storage)
      document.addEventListener('PrinChatRequestState', async () => {
        console.log('[PrinChat] 📥 PrinChatRequestState received');
        try {
          // USER REQUIREMENT: Always start with floating button HIDDEN (Header Mode)
          // Ignore stored state on startup and force reset
          const mode = 'header';

          // Sync storage so Popup UI knows we are in header mode
          chrome.storage.local.set({ princhat_view_mode: 'header' });

          console.log('[PrinChat] 📤 Sending forced initial state to UI:', mode);

          document.dispatchEvent(new CustomEvent('PrinChatSetState', {
            detail: {
              viewMode: mode
            }
          }));
        } catch (error) {
          console.error('[PrinChat] ❌ Error getting state from storage:', error);
          // Default to header if error
          document.dispatchEvent(new CustomEvent('PrinChatSetState', {
            detail: { viewMode: 'header' }
          }));
        }
      });
      console.log('[PrinChat] ✅ State request listener registered');

      // Listen for storage changes and forward to UI overlay
      console.log('[PrinChat] Setting up storage change listener...');
      chrome.storage.onChanged.addListener((changes, areaName) => {
        console.log('[PrinChat] 🔔 Storage changed!', 'Area:', areaName, 'Changes:', Object.keys(changes));

        if (areaName === 'local') {
          // Handle settings changes
          if (changes.settings) {
            console.log('[PrinChat] ⚙️ Settings changed in storage!');
            console.log('[PrinChat] Old value:', changes.settings.oldValue);
            console.log('[PrinChat] New value:', changes.settings.newValue);

            console.log('[PrinChat] New value:', changes.settings.newValue);

            // Forward to UI overlay
            console.log('[PrinChat] Dispatching PrinChatSettingsChanged event...');
            document.dispatchEvent(new CustomEvent('PrinChatSettingsChanged', {
              detail: {
                settings: changes.settings.newValue
              }
            }));
            console.log('[PrinChat] ✅ Settings change forwarded to UI overlay');
          }

          // Handle messages, scripts, or tags changes - trigger data refresh
          if (changes.messages || changes.scripts || changes.tags) {
            console.log('[PrinChat] 📊 Data changed in storage (messages/scripts/tags)!');
            console.log('[PrinChat] Dispatching PrinChatDataChanged event...');
            document.dispatchEvent(new CustomEvent('PrinChatDataChanged', {
              detail: {
                messagesChanged: !!changes.messages,
                scriptsChanged: !!changes.scripts,
                tagsChanged: !!changes.tags
              }
            }));
            console.log('[PrinChat] ✅ Data change event dispatched to UI overlay');
          }

          // Handle view mode changes (Header vs Floating)
          if (changes.princhat_view_mode) {
            const newMode = changes.princhat_view_mode.newValue || 'header';
            console.log('[PrinChat] 🔄 View mode changed in storage to:', newMode);

            document.dispatchEvent(new CustomEvent('PrinChatSetState', {
              detail: {
                viewMode: newMode
              }
            }));
            console.log('[PrinChat] ✅ View mode update sent to UI overlay');
          }
        }
      });
      console.log('[PrinChat] ✅ Storage change listener registered');
    }

    /**
     * Restore large media data from chrome.storage.local
     * Service worker stores large Base64 strings separately to avoid message size limits
     */
    private async restoreTempMediaData(messages: any[]): Promise<any[]> {
      console.log('[PrinChat Injector] 🔍 restoreTempMediaData called with', messages.length, 'messages');
      const keysToRestore: string[] = [];
      const messageReferences: { message: any; field: string; key: string }[] = [];

      // Find all temp storage references
      for (const msg of messages) {
        if (msg.type === 'file' && typeof msg.fileData === 'string' && msg.fileData.startsWith('__TEMP_STORAGE__:')) {
          const key = msg.fileData.replace('__TEMP_STORAGE__:', '');
          console.log('[PrinChat Injector] 🔍 Found file with temp storage key:', key);
          keysToRestore.push(key);
          messageReferences.push({ message: msg, field: 'fileData', key });
        }
        if (msg.type === 'image' && typeof msg.imageData === 'string' && msg.imageData.startsWith('__TEMP_STORAGE__:')) {
          const key = msg.imageData.replace('__TEMP_STORAGE__:', '');
          console.log('[PrinChat Injector] 🔍 Found image with temp storage key:', key);
          keysToRestore.push(key);
          messageReferences.push({ message: msg, field: 'imageData', key });
        }
        if (msg.type === 'video' && typeof msg.videoData === 'string' && msg.videoData.startsWith('__TEMP_STORAGE__:')) {
          const key = msg.videoData.replace('__TEMP_STORAGE__:', '');
          console.log('[PrinChat Injector] 🔍 Found video with temp storage key:', key);
          keysToRestore.push(key);
          messageReferences.push({ message: msg, field: 'videoData', key });
        }
        if (msg.type === 'audio' && typeof msg.audioData === 'string' && msg.audioData.startsWith('__TEMP_STORAGE__:')) {
          const key = msg.audioData.replace('__TEMP_STORAGE__:', '');
          console.log('[PrinChat Injector] 🔍 Found audio with temp storage key:', key);
          keysToRestore.push(key);
          messageReferences.push({ message: msg, field: 'audioData', key });
        }
      }

      if (keysToRestore.length > 0) {
        console.log('[PrinChat Injector] 🔍 Restoring', keysToRestore.length, 'items from chrome.storage.local');
        console.log('[PrinChat Injector] 🔍 Keys:', keysToRestore);
        const result = await chrome.storage.local.get(keysToRestore);
        console.log('[PrinChat Injector] 🔍 Retrieved from storage:', Object.keys(result));

        // Restore the data
        for (const ref of messageReferences) {
          const data = result[ref.key];
          if (data) {
            ref.message[ref.field] = data;
            console.log('[PrinChat Injector] 🔍 Restored', ref.field, 'for', ref.message.id, '- length:', data.length);
          } else {
            console.warn('[PrinChat Injector] ⚠️ No data found for key:', ref.key);
          }
        }

        // Clean up temp storage
        await chrome.storage.local.remove(keysToRestore);
        console.log('[PrinChat Injector] 🔍 Cleaned up temp storage');
      } else {
        console.log('[PrinChat Injector] 🔍 No temp storage keys found to restore');
      }

      return messages;
    }

    private async injectScripts() {
      console.log('[PrinChat] Preparing to inject scripts...');

      try {
        // Check if extension context is still valid
        if (!chrome.runtime?.id) {
          console.warn('[PrinChat] Extension context invalidated, cannot inject scripts');
          return;
        }

        // STEP 1: Create marker in DOM with extension ID
        // The loader script will use this to construct chrome-extension:// URLs
        const extensionId = chrome.runtime.id;
        console.log('[PrinChat] Extension ID:', extensionId);

        const marker = document.createElement('div');
        marker.id = 'princhat-marker';
        marker.setAttribute('data-extension-id', extensionId);
        marker.style.display = 'none';
        document.documentElement.appendChild(marker);

        console.log('[PrinChat] Marker created with extension ID');

        // STEP 2: Ask service worker to inject the loader script
        // The loader is small and will then load WPPConnect + page script via DOM
        const response = await chrome.runtime.sendMessage({
          type: 'INJECT_PAGE_SCRIPTS'
        });

        if (response?.success) {
          console.log('[PrinChat] ✅ Loader injection requested successfully');
        } else {
          console.error('[PrinChat] ❌ Failed to request injection:', response?.error);
        }

      } catch (error: any) {
        if (error.message?.includes('Extension context invalidated')) {
          console.warn('[PrinChat] Extension context invalidated during script injection');
        } else {
          console.error('[PrinChat] ❌ Error communicating with service worker:', error);
        }
      }
    }

    private async injectUIOverlay() {
      console.log('[PrinChat] Injecting UI overlay...');

      // Set logo URL in marker before injecting UI overlay
      // UI overlay runs in page context and doesn't have access to chrome.runtime
      const marker = ensureMarker(); // Ensure marker exists
      marker.setAttribute('data-logo-url', chrome.runtime.getURL('logo.png'));
      marker.setAttribute('data-header-popup-url', chrome.runtime.getURL('src/fab-popup/index.html'));
      console.log('[PrinChat] Logo URL set via data attribute:', chrome.runtime.getURL('logo.png'));

      // First, inject CSS (content script has access to chrome.runtime.getURL)
      console.log('[PrinChat] Injecting UI overlay CSS...');
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('content/whatsapp-ui-overlay.css');
      link.onload = () => {
        console.log('[PrinChat] ✅ UI overlay CSS loaded');
      };
      link.onerror = (error) => {
        console.error('[PrinChat] ❌ Error loading UI overlay CSS:', error);
      };
      document.head.appendChild(link);

      // Then, inject JavaScript (as a page script - no chrome.runtime access)
      console.log('[PrinChat] Injecting UI overlay JavaScript...');
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('content/whatsapp-ui-overlay.js');
      script.onload = () => {
        console.log('[PrinChat] ✅ UI overlay JavaScript loaded');
      };
      script.onerror = (error) => {
        console.error('[PrinChat] ❌ Error loading UI overlay JavaScript:', error);
      };
      document.head.appendChild(script);

      // Always inject FAB (will show/hide based on settings)
      // This allows instant toggle when settings change
      console.log('[PrinChat] Injecting FAB (will check settings for visibility)...');
      await this.injectFAB();
    }

    private async injectFAB() {
      console.log('[PrinChat] Injecting FAB...');

      // Inject FAB CSS
      const fabCSS = document.createElement('link');
      fabCSS.rel = 'stylesheet';
      fabCSS.href = chrome.runtime.getURL('content/whatsapp-fab.css');
      fabCSS.onload = () => {
        console.log('[PrinChat] ✅ FAB CSS loaded');
      };
      fabCSS.onerror = (error) => {
        console.error('[PrinChat] ❌ Error loading FAB CSS:', error);
      };
      document.head.appendChild(fabCSS);

      // Get initial settings for FAB visibility BEFORE injecting the script
      let showFloatingButton = false;
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        showFloatingButton = response?.data?.showFloatingButton ?? false;
        console.log('[PrinChat] Initial showFloatingButton:', showFloatingButton);
      } catch (error) {
        console.error('[PrinChat] Error loading settings for FAB:', error);
      }

      // Pass config to FAB via data attributes (avoiding inline scripts for CSP)
      // FAB runs in page context and doesn't have access to chrome.runtime
      // IMPORTANT: Set these BEFORE injecting the FAB script to avoid race condition
      const marker = ensureMarker(); // Ensure marker exists
      marker.setAttribute('data-popup-url', chrome.runtime.getURL('src/fab-popup/index.html'));
      marker.setAttribute('data-show-fab', String(showFloatingButton));
      marker.setAttribute('data-fab-icon-url', chrome.runtime.getURL('fab-icon.png'));
      console.log('[PrinChat] FAB config set via data attributes:', {
        popupUrl: chrome.runtime.getURL('src/fab-popup/index.html'),
        showFAB: String(showFloatingButton),
        iconUrl: chrome.runtime.getURL('fab-icon.png')
      });

      // NOW inject FAB JavaScript - data attributes are already set
      const fabScript = document.createElement('script');
      fabScript.src = chrome.runtime.getURL('content/whatsapp-fab.js');
      fabScript.onload = () => {
        console.log('[PrinChat] ✅ FAB JavaScript loaded and initialized');
      };
      fabScript.onerror = (error) => {
        console.error('[PrinChat] ❌ Error loading FAB JavaScript:', error);
      };
      document.head.appendChild(fabScript);
    }

    private async waitForWhatsAppReady(): Promise<void> {
      return new Promise((resolve) => {
        const check = () => {
          const chatContainer = document.querySelector(SELECTORS.chatContainer);
          if (chatContainer) {
            console.log('[PrinChat] WhatsApp container found');
            resolve();
          } else {
            setTimeout(check, 500);
          }
        };
        check();
      });
    }

    private async handleAction(action: any): Promise<any> {
      if (!this.isReady && action.type !== 'CHECK_WHATSAPP_READY') {
        console.error('[PrinChat] WhatsApp Web is not ready! Action:', action.type);
        return { success: false, error: 'WhatsApp Web is not ready' };
      }

      console.log('[PrinChat] Handling action:', action.type, 'Payload:', action.payload);

      switch (action.type) {
        case 'SEND_SINGLE_MESSAGE':
          // Route popup/FAB messages through overlay's sendSingleMessage()
          // This ensures they show the execution popup like footer shortcuts do
          // Payload now contains only messageId to avoid chrome.tabs.sendMessage size limits
          console.log('[PrinChat] Routing popup message through overlay:', action.payload);
          document.dispatchEvent(new CustomEvent('PrinChatSendSingleMessageFromPopup', {
            detail: {
              messageId: action.payload.messageId
            }
          }));
          // Return success immediately - overlay will handle the actual sending
          return { success: true };

        case 'SEND_MESSAGE':
          // For text: delay is handled by page script as typing animation duration
          // No need to apply delay here
          return await this.sendTextMessage(
            action.payload.content,
            action.payload.chatId,  // IMPORTANT: Use chatId from payload (captured before delay)
            action.payload.showTyping,
            action.payload.sendDelay
          );

        case 'SEND_AUDIO':
          // For audio: delay is handled by page script as recording animation duration
          // No need to apply delay here
          return await this.sendAudio(action.payload);

        case 'SEND_IMAGE':
          // For image: delay is time to wait before sending (no animation)
          if (action.payload.sendDelay && action.payload.sendDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, action.payload.sendDelay));
          }
          return await this.sendImage(action.payload);

        case 'SEND_VIDEO':
          // For video: delay is time to wait before sending (no animation)
          if (action.payload.sendDelay && action.payload.sendDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, action.payload.sendDelay));
          }
          return await this.sendVideo(action.payload);

        case 'SEND_FILE':
          // For file: delay is time to wait before sending (no animation)
          if (action.payload.sendDelay && action.payload.sendDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, action.payload.sendDelay));
          }
          return await this.sendFile(action.payload);

        case 'EXECUTE_SCRIPT':
          // Handle three formats:
          // 1. From UI overlay/FAB: { scriptId (for tracking), steps, chatId, scriptName }
          // 2. From popup: { scriptId (from DB) } - uses active chat
          // 3. From trigger: { scriptId, chatId } - uses specific chat
          // Check for 'steps' FIRST because UI overlay sends both scriptId (temporary) and steps
          if (action.payload.steps) {
            console.log('[PrinChat] ✅ Using executeScriptWithSteps (NEW - delay BEFORE send)');
            // Execute in background without waiting (to avoid message channel timeout)
            this.executeScriptWithSteps(action.payload).catch((error: any) => {
              const errorMessage = error?.message || String(error);
              console.error('[PrinChat] Background script execution failed:', errorMessage);
            });
            // Return immediately - UI will track progress via events
            return { success: true, message: 'Script execution started' };
          } else if (action.payload.scriptId) {
            console.log('[PrinChat] ⚠️ Using ScriptExecutor.executeScript (OLD - delay AFTER send)');
            // Pass chatId if provided (from trigger), otherwise undefined (uses active chat)
            // Execute in background without waiting (to avoid message channel timeout)
            this.scriptExecutor.executeScript(
              action.payload.scriptId,
              action.payload.chatId  // Optional: undefined for popup, specific for trigger
            ).catch((error: any) => {
              const errorMessage = error?.message || String(error);
              console.error('[PrinChat] Background script execution failed:', errorMessage);
            });
            // Return immediately - UI will track progress via events
            return { success: true, message: 'Script execution started' };
          } else {
            return { success: false, error: 'Invalid EXECUTE_SCRIPT payload' };
          }

        case 'PAUSE_SCRIPT':
          // scriptId is now always required - UI overlay always sends it
          const pauseScriptId = action.payload?.scriptId;
          if (!pauseScriptId) {
            return { success: false, error: 'Missing scriptId' };
          }

          // Check if it's a direct execution (from footer) or ScriptExecutor execution
          const pauseDirectExec = this.directExecutions.get(pauseScriptId);
          if (pauseDirectExec) {
            pauseDirectExec.isPaused = true;
            console.log('[PrinChat] Paused direct script execution:', pauseScriptId);
            return { success: true };
          } else {
            return this.scriptExecutor.pause(pauseScriptId);
          }

        case 'RESUME_SCRIPT':
          const resumeScriptId = action.payload?.scriptId;
          if (!resumeScriptId) {
            return { success: false, error: 'Missing scriptId' };
          }

          const resumeDirectExec = this.directExecutions.get(resumeScriptId);
          if (resumeDirectExec) {
            resumeDirectExec.isPaused = false;
            console.log('[PrinChat] Resumed direct script execution:', resumeScriptId);
            return { success: true };
          } else {
            return this.scriptExecutor.resume(resumeScriptId);
          }

        case 'CANCEL_SCRIPT':
          const cancelScriptId = action.payload?.scriptId;
          if (!cancelScriptId) {
            return { success: false, error: 'Missing scriptId' };
          }

          const cancelDirectExec = this.directExecutions.get(cancelScriptId);
          if (cancelDirectExec) {
            cancelDirectExec.isCancelled = true;
            console.log('[PrinChat] Cancelled direct script execution:', cancelScriptId);
            return { success: true };
          } else {
            return this.scriptExecutor.cancel(cancelScriptId);
          }

        case 'CANCEL_ALL_SCRIPTS':
          // Cancel all direct executions
          this.directExecutions.forEach((exec, scriptId) => {
            exec.isCancelled = true;
            console.log('[PrinChat] Cancelled direct execution:', scriptId);
          });

          // Cancel all ScriptExecutor executions
          const allExecutionIds = Array.from(this.scriptExecutor['executions'].keys());
          for (const execId of allExecutionIds) {
            this.scriptExecutor.cancel(execId);
          }
          return { success: true };

        case 'GET_EXECUTION_STATE':
          return this.scriptExecutor.getExecutionState();

        case 'CHECK_WHATSAPP_READY':
          return { success: true, data: { ready: this.isReady } };

        case 'GET_ACTIVE_CHAT':
          return await this.getActiveChat();

        default:
          return { success: false, error: 'Unknown action: ' + action.type };
      }
    }

    async sendTextMessage(text: string, chatId?: string, showTyping?: boolean, sendDelay?: number): Promise<any> {
      try {
        console.log('[PrinChat] Sending message via page script:', text.substring(0, 50) + '...', chatId ? `to chat: ${chatId}` : '');

        const hasAnimation = showTyping && (sendDelay || 0) > 0;
        const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // NEW ARCHITECTURE: If animation exists, start it BEFORE delay (like overlay does)
        if (hasAnimation && chatId) {
          document.dispatchEvent(new CustomEvent('PrinChatStartAnimation', {
            detail: {
              messageId,
              chatId,
              animationType: 'typing',
              duration: sendDelay
            }
          }));

          // Give page script time to process event and start animation
          // Longer delay to handle cleanup of previous animations
          await new Promise(resolve => setTimeout(resolve, 600));
        }

        // Process delay HERE in injector (like overlay does for full control)
        if (sendDelay && sendDelay > 0) {
          console.log('[PrinChat] Processing delay in injector:', sendDelay, 'ms');
          await new Promise(resolve => setTimeout(resolve, sendDelay));
        }

        // CRITICAL: Stop animation BEFORE sending message
        // When a message is sent, WhatsApp automatically stops all animations
        // So we need to stop it manually first to prevent it from cutting the NEXT animation
        if (hasAnimation && chatId) {
          console.log('[PrinChat] Stopping animation before sending message:', messageId);
          document.dispatchEvent(new CustomEvent('PrinChatStopAnimation', {
            detail: { messageId, chatId }
          }));
          // Wait for animation to stop completely before sending
          await new Promise(resolve => setTimeout(resolve, 200));
          console.log('[PrinChat] Animation stopped, now sending message');
        }

        // Generate unique request ID
        const requestId = `req_${Date.now()}_${Math.random()}`;

        // Create promise that will be resolved by event listener
        const promise = new Promise<any>((resolve, reject) => {
          this.pendingRequests.set(requestId, { resolve, reject });

          // Timeout: 60s buffer (delay already processed above)
          const timeout = 60000;
          console.log('[PrinChat] Text message timeout set to', timeout, 'ms');
          setTimeout(() => {
            if (this.pendingRequests.has(requestId)) {
              this.pendingRequests.delete(requestId);
              console.error('[PrinChat] ❌ TIMEOUT: Text message took too long');
              reject(new Error('Timeout: Message send took too long'));
            }
          }, timeout);
        });

        // Dispatch event to page script (ALWAYS with sendDelay=0 - delay already processed)
        document.dispatchEvent(new CustomEvent('PrinChatSendMessage', {
          detail: {
            text,
            requestId,
            chatId,
            showTyping: false,  // Animation already handled above
            sendDelay: 0        // Delay already processed above
          }
        }));

        // Wait for response
        return await promise;

      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[PrinChat] Error sending message:', errorMessage, error);
        return { success: false, error: error.message };
      }
    }

    async sendAudio(payload: any): Promise<any> {
      try {
        // Check if page script is loaded
        const isPageScriptLoaded = document.getElementById('princhat-marker');
        console.log('[PrinChat] Page script marker exists?', !!isPageScriptLoaded);

        if (!isPageScriptLoaded) {
          console.error('[PrinChat] ❌ Page script NOT LOADED! Re-injecting...');
          await this.injectScripts();
          // Wait a bit for injection
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        console.log('[PrinChat] Sending audio via page script...');

        const hasAnimation = payload.showRecording && (payload.sendDelay || 0) > 0;
        const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // NEW ARCHITECTURE: If animation exists, start it BEFORE delay (like overlay does)
        if (hasAnimation && payload.chatId) {
          document.dispatchEvent(new CustomEvent('PrinChatStartAnimation', {
            detail: {
              messageId,
              chatId: payload.chatId,
              animationType: 'recording',
              duration: payload.sendDelay
            }
          }));
          // Give page script time to process event and start animation
          // Longer delay to handle cleanup of previous animations
          await new Promise(resolve => setTimeout(resolve, 600));
        }

        // Process delay HERE in injector (like overlay does for full control)
        if (payload.sendDelay && payload.sendDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, payload.sendDelay));
        }

        // CRITICAL: Stop animation BEFORE sending message
        // When a message is sent, WhatsApp automatically stops all animations
        // So we need to stop it manually first to prevent it from cutting the NEXT animation
        if (hasAnimation && payload.chatId) {
          console.log('[PrinChat] Stopping animation before sending audio:', messageId);
          document.dispatchEvent(new CustomEvent('PrinChatStopAnimation', {
            detail: { messageId, chatId: payload.chatId }
          }));
          // Wait for animation to stop completely before sending
          await new Promise(resolve => setTimeout(resolve, 200));
          console.log('[PrinChat] Animation stopped, now sending audio');
        }

        // Generate unique request ID
        const requestId = `req_audio_${Date.now()}_${Math.random()}`;

        // Create promise that will be resolved by event listener
        const promise = new Promise<any>((resolve, reject) => {
          this.pendingRequests.set(requestId, { resolve, reject });

          // Timeout: 90s buffer (delay already processed above)
          const timeout = 90000;
          setTimeout(() => {
            if (this.pendingRequests.has(requestId)) {
              this.pendingRequests.delete(requestId);
              console.error('[PrinChat] ❌ TIMEOUT: Audio send took too long');
              reject(new Error('Timeout: Audio send took too long'));
            }
          }, timeout);
        });

        // Dispatch event to page script (ALWAYS with sendDelay=0 - delay already processed)
        document.dispatchEvent(new CustomEvent('PrinChatSendAudio', {
          detail: {
            audioData: payload.audioData,
            duration: payload.duration,
            requestId,
            chatId: payload.chatId,
            showRecording: false,  // Animation already handled above
            sendDelay: 0           // Delay already processed above
          }
        }));

        // Wait for response
        return await promise;

      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[PrinChat] Error sending audio:', errorMessage, error);
        return { success: false, error: error.message };
      }
    }

    async sendImage(payload: any): Promise<any> {
      try {
        const isPageScriptLoaded = document.getElementById('princhat-marker');
        if (!isPageScriptLoaded) {
          console.error('[PrinChat] ❌ Page script NOT LOADED! Re-injecting...');
          await this.injectScripts();
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        console.log('[PrinChat] Sending image via page script...');

        const requestId = `req_image_${Date.now()}_${Math.random()}`;

        const promise = new Promise<any>((resolve, reject) => {
          this.pendingRequests.set(requestId, { resolve, reject });

          // Dynamic timeout: sendDelay + 60s buffer for upload/processing
          // Images have no animation, but may have sendDelay configured in scripts
          const timeout = (payload.sendDelay || 0) + 60000;
          console.log('[PrinChat] Image message timeout set to', timeout, 'ms (sendDelay:', payload.sendDelay, 'ms + 60s buffer)');
          setTimeout(() => {
            if (this.pendingRequests.has(requestId)) {
              this.pendingRequests.delete(requestId);
              reject(new Error('Timeout: Image send took too long'));
            }
          }, timeout);
        });

        document.dispatchEvent(new CustomEvent('PrinChatSendImage', {
          detail: {
            imageData: payload.imageData,
            caption: payload.caption || '',
            requestId,
            chatId: payload.chatId  // Optional chatId
          }
        }));

        console.log('[PrinChat] ✅ Image event dispatched!');

        return await promise;

      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[PrinChat] Error sending image:', errorMessage, error);
        return { success: false, error: error.message };
      }
    }

    async sendVideo(payload: any): Promise<any> {
      try {
        const isPageScriptLoaded = document.getElementById('princhat-marker');
        if (!isPageScriptLoaded) {
          console.error('[PrinChat] ❌ Page script NOT LOADED! Re-injecting...');
          await this.injectScripts();
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        console.log('[PrinChat] Sending video via page script...');

        const requestId = `req_video_${Date.now()}_${Math.random()}`;

        const promise = new Promise<any>((resolve, reject) => {
          this.pendingRequests.set(requestId, { resolve, reject });

          // Dynamic timeout: sendDelay + 120s buffer for upload/processing
          // Videos have no animation, but may have sendDelay configured in scripts
          // Larger buffer (120s) because video files can be very large
          const timeout = (payload.sendDelay || 0) + 120000;
          console.log('[PrinChat] Video message timeout set to', timeout, 'ms (sendDelay:', payload.sendDelay, 'ms + 120s buffer)');
          setTimeout(() => {
            if (this.pendingRequests.has(requestId)) {
              this.pendingRequests.delete(requestId);
              reject(new Error('Timeout: Video send took too long'));
            }
          }, timeout);
        });

        document.dispatchEvent(new CustomEvent('PrinChatSendVideo', {
          detail: {
            videoData: payload.videoData,
            caption: payload.caption || '',
            requestId,
            chatId: payload.chatId  // Optional chatId
          }
        }));

        console.log('[PrinChat] ✅ Video event dispatched!');

        return await promise;

      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[PrinChat] Error sending video:', errorMessage, error);
        return { success: false, error: error.message };
      }
    }

    async sendFile(payload: any): Promise<any> {
      try {
        const isPageScriptLoaded = document.getElementById('princhat-marker');
        if (!isPageScriptLoaded) {
          console.error('[PrinChat] ❌ Page script NOT LOADED! Re-injecting...');
          await this.injectScripts();
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        console.log('[PrinChat] Sending file via page script...');

        const requestId = `req_file_${Date.now()}_${Math.random()}`;

        const promise = new Promise<any>((resolve, reject) => {
          this.pendingRequests.set(requestId, { resolve, reject });

          // Dynamic timeout: sendDelay + 120s buffer for upload/processing
          // Files have no animation, but may have sendDelay configured in scripts
          // Larger buffer (120s) because files can be very large
          const timeout = (payload.sendDelay || 0) + 120000;
          console.log('[PrinChat] File message timeout set to', timeout, 'ms (sendDelay:', payload.sendDelay, 'ms + 120s buffer)');
          setTimeout(() => {
            if (this.pendingRequests.has(requestId)) {
              this.pendingRequests.delete(requestId);
              reject(new Error('Timeout: File send took too long'));
            }
          }, timeout);
        });

        document.dispatchEvent(new CustomEvent('PrinChatSendFile', {
          detail: {
            fileData: payload.fileData,
            caption: payload.caption || '',
            fileName: payload.fileName || 'file',
            requestId,
            chatId: payload.chatId  // Optional chatId
          }
        }));

        console.log('[PrinChat] ✅ File event dispatched!');

        return await promise;

      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[PrinChat] Error sending file:', errorMessage, error);
        return { success: false, error: error.message };
      }
    }


    private async executeScriptWithSteps(payload: any): Promise<any> {
      const scriptId = payload.scriptId || `script-${Date.now()}`;

      try {
        console.log('[PrinChat] Executing script with steps:', payload.scriptName);
        const { steps, chatId, scriptName } = payload;

        if (!steps || !Array.isArray(steps) || steps.length === 0) {
          return { success: false, error: 'Invalid steps array' };
        }

        // Create execution state for this specific script
        this.directExecutions.set(scriptId, {
          isPaused: false,
          isCancelled: false
        });

        console.log('[PrinChat] Started direct script execution:', scriptId);

        // Emit script start event for UI overlay to show progress popup
        document.dispatchEvent(new CustomEvent('PrinChatScriptStart', {
          detail: {
            scriptId,
            scriptName: scriptName || 'Script',
            totalSteps: steps.length
          }
        }));

        // Execute each step sequentially
        for (let i = 0; i < steps.length; i++) {
          const execution = this.directExecutions.get(scriptId);
          if (!execution) {
            console.log('[PrinChat] Execution state lost for:', scriptId);
            break;
          }

          // Check if cancelled
          if (execution.isCancelled) {
            console.log('[PrinChat] Direct script execution cancelled:', scriptId);
            break;
          }

          // Wait if paused
          while (execution.isPaused && !execution.isCancelled) {
            console.log('[PrinChat] Script paused, waiting...', scriptId);
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Check again after pause
          if (execution.isCancelled) {
            console.log('[PrinChat] Direct script execution cancelled after pause:', scriptId);
            break;
          }

          const step = steps[i];
          const message = step.message;
          const delayAfter = step.delayAfter || 0;

          console.log('[PrinChat] Executing step', i + 1, 'of', steps.length, '- type:', message.type);

          // Apply delay BEFORE sending message (allows pause to prevent sending)
          if (delayAfter > 0) {
            console.log('[PrinChat] Waiting', delayAfter, 'ms before sending (pausable)...');

            // Break delay into smaller chunks to allow pause/cancellation during delay
            const chunks = Math.ceil(delayAfter / 100);
            for (let j = 0; j < chunks; j++) {
              const delayExecution = this.directExecutions.get(scriptId);
              if (!delayExecution) break;

              // Check if cancelled
              if (delayExecution.isCancelled) {
                console.log('[PrinChat] Script cancelled during delay');
                break;
              }

              // Wait if paused during delay
              while (delayExecution.isPaused && !delayExecution.isCancelled) {
                console.log('[PrinChat] Script paused during delay, waiting...', scriptId);
                await new Promise(resolve => setTimeout(resolve, 100));
              }

              // Check again after pause
              if (delayExecution.isCancelled) {
                console.log('[PrinChat] Script cancelled after pause during delay');
                break;
              }

              await new Promise(resolve => setTimeout(resolve, Math.min(100, delayAfter - j * 100)));
            }
          }

          // Check one more time before sending
          const preExecution = this.directExecutions.get(scriptId);
          if (!preExecution || preExecution.isCancelled) {
            console.log('[PrinChat] Script cancelled before sending step', i + 1);
            break;
          }

          // Dispatch progress event for UI overlay
          document.dispatchEvent(new CustomEvent('PrinChatScriptProgress', {
            detail: {
              scriptId: scriptId,
              step: i + 1,
              status: 'sending'
            }
          }));

          // Send message based on type
          let result;
          switch (message.type) {
            case 'text':
              result = await this.sendTextMessage(message.content, chatId);
              break;
            case 'audio':
              result = await this.sendAudio({
                audioData: message.audioData,
                duration: message.duration,
                chatId
              });
              break;
            case 'image':
              result = await this.sendImage({
                imageData: message.imageData,
                caption: message.caption || '',
                chatId
              });
              break;
            case 'video':
              result = await this.sendVideo({
                videoData: message.videoData,
                caption: message.caption || '',
                chatId
              });
              break;
            case 'file':
              result = await this.sendFile({
                fileData: message.fileData,
                caption: message.caption || '',
                fileName: message.fileName || 'file',
                chatId
              });
              break;
            default:
              console.error('[PrinChat] Unknown message type:', message.type);
              result = { success: false, error: `Unknown message type: ${message.type}` };
          }

          if (result && result.success) {
            console.log('[PrinChat] Step', i + 1, 'sent successfully');
            // Dispatch success event
            document.dispatchEvent(new CustomEvent('PrinChatScriptProgress', {
              detail: {
                scriptId: scriptId,
                step: i + 1,
                status: 'success'
              }
            }));
          } else {
            console.error('[PrinChat] Step', i + 1, 'failed:', result?.error);
            // Dispatch error event
            document.dispatchEvent(new CustomEvent('PrinChatScriptProgress', {
              detail: {
                scriptId: scriptId,
                step: i + 1,
                status: 'error',
                error: result?.error
              }
            }));
          }

        }

        // Get final execution state
        const finalExecution = this.directExecutions.get(scriptId);
        const wasCancelled = finalExecution?.isCancelled || false;

        // Clean up execution state
        this.directExecutions.delete(scriptId);

        if (wasCancelled) {
          console.log('[PrinChat] Script execution cancelled by user:', scriptId);
          // Emit cancellation event
          document.dispatchEvent(new CustomEvent('PrinChatScriptComplete', {
            detail: {
              scriptId,
              success: false,
              cancelled: true
            }
          }));
          return { success: false, error: 'Script cancelled by user' };
        }

        console.log('[PrinChat] Script execution completed:', scriptName);

        // Emit completion event for UI overlay
        document.dispatchEvent(new CustomEvent('PrinChatScriptComplete', {
          detail: {
            scriptId,
            success: true
          }
        }));

        return { success: true };

      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[PrinChat] Error executing script with steps:', errorMessage, error);
        // Clean up on error
        this.directExecutions.delete(scriptId);

        // Emit error event for UI overlay
        document.dispatchEvent(new CustomEvent('PrinChatScriptError', {
          detail: {
            scriptId,
            error: errorMessage
          }
        }));

        return { success: false, error: errorMessage };
      }
    }

    async getActiveChat(): Promise<any> {
      console.log('[PrinChat Injector] 🔍 getActiveChat() called');
      return new Promise((resolve) => {
        const requestId = `active-chat-${Date.now()}`;
        const timeout = setTimeout(() => {
          console.log('[PrinChat Injector] ⏱️ getActiveChat() timeout - no response from page script');
          resolve({ success: false, error: 'Timeout' });
        }, 5000); // Increased from 3000ms to 5000ms

        const handler = (event: any) => {
          if (event.detail?.requestId === requestId) {
            clearTimeout(timeout);
            document.removeEventListener('PrinChatActiveChatResult', handler);
            console.log('[PrinChat Injector] ✅ Received active chat result:', event.detail);
            if (event.detail.success) {
              // Use fallback getChatPhoto() if API didn't return photo
              const chatPhoto = event.detail.chatPhoto || this.getChatPhoto();
              resolve({
                success: true,
                data: { active: true, chatName: event.detail.chatName, chatId: event.detail.chatId, chatPhoto }
              });
            } else {
              console.log('[PrinChat Injector] ❌ Active chat request failed:', event.detail.error);
              resolve({ success: false, error: event.detail.error });
            }
          }
        };

        document.addEventListener('PrinChatActiveChatResult', handler);
        console.log('[PrinChat Injector] 📤 Dispatching PrinChatGetActiveChat event with requestId:', requestId);
        document.dispatchEvent(new CustomEvent('PrinChatGetActiveChat', {
          detail: { requestId }
        }));
      });
    }

    async getChatInfo(chatId: string): Promise<any> {
      return new Promise((resolve) => {
        const requestId = `chat-info-${Date.now()}`;
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'Timeout' });
        }, 3000);

        const handler = (event: any) => {
          if (event.detail?.requestId === requestId) {
            clearTimeout(timeout);
            document.removeEventListener('PrinChatChatInfoResult', handler);
            if (event.detail.success) {
              // Don't use getChatPhoto() fallback here - it gets the ACTIVE chat photo, not the specific chat
              // If WhatsApp API doesn't have the photo, it's better to show placeholder than wrong photo
              const chatPhoto = event.detail.chatPhoto;
              resolve({
                success: true,
                data: { chatName: event.detail.chatName, chatId: event.detail.chatId, chatPhoto }
              });
            } else {
              resolve({ success: false, error: event.detail.error });
            }
          }
        };

        document.addEventListener('PrinChatChatInfoResult', handler);
        document.dispatchEvent(new CustomEvent('PrinChatGetChatInfo', {
          detail: { requestId, chatId }
        }));
      });
    }

    private getChatPhoto(): string | undefined {
      console.log('[PrinChat Injector] Getting chat photo from DOM as fallback...');

      // Try multiple selectors for profile picture
      const selectors = [
        '#main header img[src*="https://"]',  // Profile pic with https URL
        '#main header img[src*="blob:"]',     // Profile pic as blob
        '#main [data-testid="conversation-info-header"] img',
        '#main header [data-testid="default-user"] img',
        '#main header [data-testid="default-group"] img',
        '#main header img',  // Any image in header
      ];

      for (const selector of selectors) {
        const img = document.querySelector(selector) as HTMLImageElement;
        if (img?.src && img.src !== 'data:') {
          console.log('[PrinChat Injector] Found chat photo from selector:', selector, '→', img.src);
          return img.src;
        }
      }

      console.log('[PrinChat Injector] No chat photo found in DOM');
      return undefined;
    }

    // Note: openChat() is kept for potential future use but currently not needed
    // since we now target chats directly via chatId parameter in send functions
    /*
    private async openChat(chatId: string): Promise<any> {
      return new Promise((resolve) => {
        const requestId = `open-chat-${Date.now()}`;
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'Timeout opening chat' });
        }, 5000);

        const handler = (event: any) => {
          if (event.detail?.requestId === requestId) {
            clearTimeout(timeout);
            document.removeEventListener('PrinChatOpenChatResult', handler);
            resolve({
              success: event.detail.success,
              error: event.detail.error
            });
          }
        };

        document.addEventListener('PrinChatOpenChatResult', handler);
        document.dispatchEvent(new CustomEvent('PrinChatOpenChat', {
          detail: { chatId, requestId }
        }));
      });
    }
    */
  }

  // Initialize
  new WhatsAppInjector();

  // Listen for PRINCHAT_OPEN_OPTIONS event from UI overlay (profile dropdown)
  document.addEventListener('PRINCHAT_OPEN_OPTIONS', () => {
    console.log('[PrinChat Content] PRINCHAT_OPEN_OPTIONS event received');
    // Send message to service worker to open options page
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }).catch(error => {
      console.error('[PrinChat Content] Error opening options:', error);
    });
  });

  console.log('[PrinChat] Content script initialization complete');
})();
