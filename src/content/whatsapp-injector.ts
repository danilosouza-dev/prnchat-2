/**
 * X1Flox - WhatsApp Web Content Script (Isolated World)
 * Runs in isolated world, communicates with popup and page script
 * The page script (whatsapp-page-script.ts) runs in page context and accesses WhatsApp API
 */

(function() {
  'use strict';

  console.log('[X1Flox] Content script loaded');

  // Create marker in DOM - will be used to pass config to page scripts
  // Ensure it's added even if body is not ready yet
  function ensureMarker() {
    let marker = document.getElementById('X1FloxInjected');
    if (!marker) {
      marker = document.createElement('div');
      marker.id = 'X1FloxInjected';
      marker.style.display = 'none';
      (document.body || document.documentElement).appendChild(marker);
      console.log('[X1Flox] Marker created and appended to:', document.body ? 'body' : 'documentElement');
    }
    return marker;
  }

  // Create marker immediately
  ensureMarker();

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
        console.log('[X1Flox] Starting script execution via ScriptExecutor:', scriptId);
        console.log('[X1Flox] Provided chatId:', providedChatId || 'none (will use active chat)');
        console.log('[X1Flox] Fetching script from service worker (NOT IndexedDB)...');

        // IMPORTANT: Content script can't access extension's IndexedDB directly!
        // We must fetch the script via the service worker
        const scriptData = await this.getScriptFromServiceWorker(scriptId);

        if (!scriptData || !scriptData.success) {
          console.error('[X1Flox] Failed to fetch script from service worker:', scriptData?.error);
          return { success: false, error: scriptData?.error || 'Failed to fetch script' };
        }

        const script = scriptData.data;
        console.log('[X1Flox] Script loaded successfully:', script.name, 'with', script.steps.length, 'steps');

        // Determine target chat
        let targetChatId: string;
        let targetChatName: string;
        let targetChatPhoto: string | undefined;

        if (providedChatId) {
          // Use provided chat ID (from trigger)
          targetChatId = providedChatId;

          // Fetch real chat data (name and photo) from WhatsApp API
          console.log('[X1Flox] Fetching chat info for trigger:', targetChatId);
          const chatInfoResult = await this.injector?.getChatInfo(targetChatId);

          if (chatInfoResult?.success && chatInfoResult.data) {
            targetChatName = chatInfoResult.data.chatName;
            targetChatPhoto = chatInfoResult.data.chatPhoto;
            console.log('[X1Flox] Got real chat data:', targetChatName, 'Photo:', !!targetChatPhoto);
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
            console.log('[X1Flox] Failed to get chat info, using fallback:', targetChatName);
          }
        } else {
          // Get the active chat (for popup/manual execution)
          // This ensures messages are sent to the correct chat even if user navigates away
          const activeChatResult = await this.injector?.getActiveChat();
          if (!activeChatResult?.success || !activeChatResult.data?.chatId) {
            console.error('[X1Flox] Failed to get active chat:', activeChatResult?.error);
            return { success: false, error: 'No active chat found. Please open a chat first.' };
          }

          targetChatId = activeChatResult.data.chatId;
          targetChatName = activeChatResult.data.chatName;
          targetChatPhoto = activeChatResult.data.chatPhoto;
          console.log('[X1Flox] Script will execute for active chat:', targetChatName, 'ID:', targetChatId);
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

        // Dispatch X1FloxScriptStart event for UI overlay to create popup
        document.dispatchEvent(new CustomEvent('X1FloxScriptStart', {
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
            console.log('[X1Flox] Script execution cancelled:', executionId);
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

          console.log('[X1Flox] Executing step', i + 1, 'of', script.steps.length);

          // Service worker provides steps with message data already embedded
          const message = step.message;
          if (!message) {
            console.error('[X1Flox] Message data missing in step:', i);
            continue;
          }

          // Send message
          let result;

          if (!this.injector) {
            console.error('[X1Flox] Injector not initialized!');
            result = { success: false, error: 'Injector not initialized' };
          } else {
            switch (message.type) {
              case 'text':
                // For text: delay is handled by page script as typing animation duration
                result = await this.injector.sendTextMessage(
                  message.content,
                  execution.targetChatId,
                  message.showTyping,
                  message.sendDelay
                );
                break;
              case 'audio':
                if (message.audioData) {
                  // For audio: delay is handled by page script as recording animation duration
                  result = await this.injector.sendAudio({
                    audioData: message.audioData,
                    duration: message.duration,
                    chatId: execution.targetChatId,
                    showRecording: message.showRecording,
                    sendDelay: message.sendDelay
                  });
                } else {
                  result = { success: false, error: 'Audio data missing' };
                }
                break;
              case 'image':
                if (message.imageData) {
                  // For image: apply delay before sending (no animation)
                  if (message.sendDelay && message.sendDelay > 0) {
                    await this.delay(message.sendDelay, execution);
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
                  // For video: apply delay before sending (no animation)
                  if (message.sendDelay && message.sendDelay > 0) {
                    await this.delay(message.sendDelay, execution);
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
              default:
                result = { success: false, error: `Unknown message type: ${message.type}` };
            }
          }

          if (result?.success) {
            execution.state.sentMessages++;
            console.log('[X1Flox] Message sent successfully:', i + 1);

            // Dispatch progress event for UI overlay
            document.dispatchEvent(new CustomEvent('X1FloxScriptProgress', {
              detail: {
                scriptId: executionId,
                step: i + 1,
                status: 'success'
              }
            }));
          } else {
            console.error('[X1Flox] Failed to send message:', result?.error);
            // Continue to next message even if one fails
          }

          // Delay before next message
          if (i < script.steps.length - 1 && step.delayAfter > 0) {
            console.log('[X1Flox] Waiting', step.delayAfter, 'ms before next message');
            await this.delay(step.delayAfter, execution);
          }
        }

        // Execution complete
        execution.state.isRunning = false;
        console.log('[X1Flox] Script execution completed');

        // Clean up execution from Map
        this.executions.delete(executionId);

        // Dispatch completion event for UI overlay
        if (execution.isCancelled) {
          // Script was cancelled - don't dispatch complete event
          console.log('[X1Flox] Script was cancelled, not dispatching complete event');
        } else {
          document.dispatchEvent(new CustomEvent('X1FloxScriptComplete', {
            detail: {
              scriptId: executionId,
              success: true
            }
          }));
        }

        return { success: true };

      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[X1Flox] Error executing script:', errorMessage, error);
        const execution = this.executions.get(executionId);
        if (execution) {
          execution.state.isRunning = false;
          this.executions.delete(executionId);

          // Dispatch error event for UI overlay
          document.dispatchEvent(new CustomEvent('X1FloxScriptError', {
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
        console.log('[X1Flox] Script execution paused:', scriptId);
        return { success: true };
      }
      console.warn('[X1Flox] No running script found for pause:', scriptId);
      return { success: false, error: 'No script running with this ID' };
    }

    resume(scriptId: string) {
      const execution = this.executions.get(scriptId);
      if (execution && execution.state.isRunning && execution.isPaused) {
        execution.isPaused = false;
        execution.state.isPaused = false;
        console.log('[X1Flox] Script execution resumed:', scriptId);
        return { success: true };
      }
      console.warn('[X1Flox] No paused script found for resume:', scriptId);
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
        console.log('[X1Flox] Script execution cancelled:', scriptId);
        return { success: true };
      }
      console.warn('[X1Flox] No running script found for cancel:', scriptId);
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
      return new Promise((resolve) => {
        execution.delayTimeout = setTimeout(() => {
          resolve();
        }, ms);
      });
    }

    /**
     * Fetch script from service worker (which has access to IndexedDB)
     * Content script can't access extension's IndexedDB directly due to origin isolation
     */
    private async getScriptFromServiceWorker(scriptId: string): Promise<any> {
      try {
        console.log('[X1Flox] Requesting script from service worker:', scriptId);
        const response = await chrome.runtime.sendMessage({
          type: 'GET_SCRIPT',
          payload: { scriptId }
        });
        console.log('[X1Flox] Service worker response:', response);
        return response;
      } catch (error: any) {
        console.error('[X1Flox] Error fetching script from service worker:', error);
        return { success: false, error: error.message };
      }
    }
  }

  class WhatsAppInjector {
    private isReady = false;
    private pendingRequests = new Map<string, {resolve: Function, reject: Function}>();
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
      console.log('[X1Flox] Initializing injector...');

      // Wait for WhatsApp Web to load
      await this.waitForWhatsAppReady();

      // Inject WPPConnect and page script directly from content script
      await this.injectScripts();

      // Inject UI overlay
      await this.injectUIOverlay();

      // Listen for responses from page script
      document.addEventListener('X1FloxMessageSent', (event: any) => {
        console.log('[X1Flox] 📨 X1FloxMessageSent event received!', event.detail);

        const { success, error, requestId } = event.detail;
        console.log('[X1Flox] Event details:', { success, error, requestId });
        console.log('[X1Flox] Pending requests:', Array.from(this.pendingRequests.keys()));

        const pending = this.pendingRequests.get(requestId);
        console.log('[X1Flox] Found pending request?', !!pending);

        if (pending) {
          if (success) {
            console.log('[X1Flox] ✅ Resolving promise with success');
            pending.resolve({ success: true });
          } else {
            console.log('[X1Flox] ❌ Rejecting promise with error:', error);
            pending.reject(new Error(error || 'Unknown error'));
          }
          this.pendingRequests.delete(requestId);
        } else {
          console.warn('[X1Flox] ⚠️ No pending request found for requestId:', requestId);
        }
      });

      // Listen for pause/resume/cancel events from UI overlay
      document.addEventListener('X1FloxPauseScript', (event: any) => {
        const { scriptId } = event.detail;
        console.log('[X1Flox] Pause script event received:', scriptId);

        // Check if it's a direct execution (from footer) or ScriptExecutor execution
        const directExec = this.directExecutions.get(scriptId);
        if (directExec) {
          directExec.isPaused = true;
          console.log('[X1Flox] Paused direct script execution:', scriptId);
        } else {
          this.scriptExecutor.pause(scriptId);
        }
      });

      document.addEventListener('X1FloxResumeScript', (event: any) => {
        const { scriptId } = event.detail;
        console.log('[X1Flox] Resume script event received:', scriptId);

        const directExec = this.directExecutions.get(scriptId);
        if (directExec) {
          directExec.isPaused = false;
          console.log('[X1Flox] Resumed direct script execution:', scriptId);
        } else {
          this.scriptExecutor.resume(scriptId);
        }
      });

      document.addEventListener('X1FloxCancelScript', (event: any) => {
        const { scriptId } = event.detail;
        console.log('[X1Flox] Cancel script event received:', scriptId);

        const directExec = this.directExecutions.get(scriptId);
        if (directExec) {
          directExec.isCancelled = true;
          console.log('[X1Flox] Cancelled direct script execution:', scriptId);
        } else {
          this.scriptExecutor.cancel(scriptId);
        }
      });

      // Listen for incoming messages from page script (for triggers)
      document.addEventListener('X1FloxIncomingMessage', async (event: any) => {
        const { messageText, chatId, timestamp } = event.detail;
        console.log('[X1Flox] Incoming message detected:', messageText);

        // Send to service worker to check triggers
        try {
          // Check if extension context is still valid
          if (!chrome.runtime?.id) {
            console.warn('[X1Flox] Extension context invalidated, skipping trigger check');
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
            console.warn('[X1Flox] Extension context invalidated, trigger check skipped');
          } else if (error.message?.includes('message channel closed') ||
                     error.message?.includes('The message port closed')) {
            // This can happen if the service worker is restarting or the script execution takes too long
            // It's not a critical error - the trigger check was received, just the response was lost
            console.warn('[X1Flox] Message channel closed during trigger check (non-critical)');
          } else {
            console.error('[X1Flox] Error checking triggers:', error);
          }
        }
      });

      this.isReady = true;
      console.log('[X1Flox] WhatsApp Web injector ready');

      // Listen for messages from popup
      try {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
          console.log('[X1Flox] Message received from popup:', message.type);
          this.handleAction(message)
            .then(response => {
              console.log('[X1Flox] Sending response:', response);
              sendResponse(response);
            })
            .catch(error => {
              console.error('[X1Flox] Error handling action:', error);
              sendResponse({
                success: false,
                error: error.message || 'Unknown error'
              });
            });
          return true; // Keep channel open for async
        });
        console.log('[X1Flox] Message listener registered successfully');
      } catch (error) {
        console.error('[X1Flox] Failed to register message listener:', error);
      }

      // Listen for requests from UI overlay
      console.log('[X1Flox] Setting up UI request listener...');
      document.addEventListener('X1FloxUIRequest', async (event: any) => {
        const { requestId, message } = event.detail;
        console.log('[X1Flox] 🎯 UI request received:', message.type, 'ID:', requestId);

        try {
          let response;

          if (message.type === 'GET_SCRIPTS_AND_MESSAGES' || message.type === 'GET_SETTINGS' || message.type === 'TOGGLE_SIDE_PANEL') {
            console.log('[X1Flox] Forwarding to background service worker...');

            // Check if extension context is still valid
            if (!chrome.runtime?.id) {
              throw new Error('Extension context invalidated. Please reload the page.');
            }

            // Forward to background service worker
            response = await chrome.runtime.sendMessage(message);
            console.log('[X1Flox] Got response from background:', response);
          } else {
            console.log('[X1Flox] Handling as action:', message.type);
            // Handle as action (EXECUTE_SCRIPT, SEND_MESSAGE, etc)
            response = await this.handleAction(message);
          }

          console.log('[X1Flox] Sending response back to UI overlay:', response);
          document.dispatchEvent(new CustomEvent('X1FloxUIResponse', {
            detail: { requestId, response }
          }));
          console.log('[X1Flox] ✅ Response sent to UI overlay');
        } catch (error: any) {
          console.error('[X1Flox] ❌ Error handling UI request:', error);

          // Provide better error message for context invalidation
          let errorMessage = error.message || 'Unknown error';
          if (error.message?.includes('Extension context invalidated')) {
            errorMessage = 'A extensão foi atualizada. Por favor, recarregue a página.';
          }

          document.dispatchEvent(new CustomEvent('X1FloxUIResponse', {
            detail: {
              requestId,
              response: { success: false, error: errorMessage }
            }
          }));
        }
      });
      console.log('[X1Flox] ✅ UI request listener registered');

      // Listen for storage changes and forward to UI overlay
      console.log('[X1Flox] Setting up storage change listener...');
      chrome.storage.onChanged.addListener((changes, areaName) => {
        console.log('[X1Flox] 🔔 Storage changed!', 'Area:', areaName, 'Changes:', Object.keys(changes));

        if (areaName === 'local') {
          // Handle settings changes
          if (changes.settings) {
            console.log('[X1Flox] ⚙️ Settings changed in storage!');
            console.log('[X1Flox] Old value:', changes.settings.oldValue);
            console.log('[X1Flox] New value:', changes.settings.newValue);

            // Update marker attribute for FAB (page context can read this)
            if (changes.settings.newValue) {
              const marker = ensureMarker(); // Ensure marker exists
              const showFloatingButton = changes.settings.newValue.showFloatingButton ?? false;
              marker.setAttribute('data-show-fab', String(showFloatingButton));
              console.log('[X1Flox] Updated marker data-show-fab:', showFloatingButton);
            }

            // Forward to UI overlay
            console.log('[X1Flox] Dispatching X1FloxSettingsChanged event...');
            document.dispatchEvent(new CustomEvent('X1FloxSettingsChanged', {
              detail: {
                settings: changes.settings.newValue
              }
            }));
            console.log('[X1Flox] ✅ Settings change forwarded to UI overlay');
          }

          // Handle messages, scripts, or tags changes - trigger data refresh
          if (changes.messages || changes.scripts || changes.tags) {
            console.log('[X1Flox] 📊 Data changed in storage (messages/scripts/tags)!');
            console.log('[X1Flox] Dispatching X1FloxDataChanged event...');
            document.dispatchEvent(new CustomEvent('X1FloxDataChanged', {
              detail: {
                messagesChanged: !!changes.messages,
                scriptsChanged: !!changes.scripts,
                tagsChanged: !!changes.tags
              }
            }));
            console.log('[X1Flox] ✅ Data change event dispatched to UI overlay');
          }
        }
      });
      console.log('[X1Flox] ✅ Storage change listener registered');
    }

    private async injectScripts() {
      console.log('[X1Flox] Preparing to inject scripts...');

      try {
        // Check if extension context is still valid
        if (!chrome.runtime?.id) {
          console.warn('[X1Flox] Extension context invalidated, cannot inject scripts');
          return;
        }

        // STEP 1: Create marker in DOM with extension ID
        // The loader script will use this to construct chrome-extension:// URLs
        const extensionId = chrome.runtime.id;
        console.log('[X1Flox] Extension ID:', extensionId);

        const marker = document.createElement('div');
        marker.id = 'x1flox-marker';
        marker.setAttribute('data-extension-id', extensionId);
        marker.style.display = 'none';
        document.documentElement.appendChild(marker);

        console.log('[X1Flox] Marker created with extension ID');

        // STEP 2: Ask service worker to inject the loader script
        // The loader is small and will then load WPPConnect + page script via DOM
        const response = await chrome.runtime.sendMessage({
          type: 'INJECT_PAGE_SCRIPTS'
        });

        if (response?.success) {
          console.log('[X1Flox] ✅ Loader injection requested successfully');
        } else {
          console.error('[X1Flox] ❌ Failed to request injection:', response?.error);
        }

      } catch (error: any) {
        if (error.message?.includes('Extension context invalidated')) {
          console.warn('[X1Flox] Extension context invalidated during script injection');
        } else {
          console.error('[X1Flox] ❌ Error communicating with service worker:', error);
        }
      }
    }

    private async injectUIOverlay() {
      console.log('[X1Flox] Injecting UI overlay...');

      // First, inject CSS (content script has access to chrome.runtime.getURL)
      console.log('[X1Flox] Injecting UI overlay CSS...');
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('content/whatsapp-ui-overlay.css');
      link.onload = () => {
        console.log('[X1Flox] ✅ UI overlay CSS loaded');
      };
      link.onerror = (error) => {
        console.error('[X1Flox] ❌ Error loading UI overlay CSS:', error);
      };
      document.head.appendChild(link);

      // Then, inject JavaScript (as a page script - no chrome.runtime access)
      console.log('[X1Flox] Injecting UI overlay JavaScript...');
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('content/whatsapp-ui-overlay.js');
      script.onload = () => {
        console.log('[X1Flox] ✅ UI overlay JavaScript loaded');
      };
      script.onerror = (error) => {
        console.error('[X1Flox] ❌ Error loading UI overlay JavaScript:', error);
      };
      document.head.appendChild(script);

      // Always inject FAB (will show/hide based on settings)
      // This allows instant toggle when settings change
      console.log('[X1Flox] Injecting FAB (will check settings for visibility)...');
      await this.injectFAB();
    }

    private async injectFAB() {
      console.log('[X1Flox] Injecting FAB...');

      // Inject FAB CSS
      const fabCSS = document.createElement('link');
      fabCSS.rel = 'stylesheet';
      fabCSS.href = chrome.runtime.getURL('content/whatsapp-fab.css');
      fabCSS.onload = () => {
        console.log('[X1Flox] ✅ FAB CSS loaded');
      };
      fabCSS.onerror = (error) => {
        console.error('[X1Flox] ❌ Error loading FAB CSS:', error);
      };
      document.head.appendChild(fabCSS);

      // Get initial settings for FAB visibility BEFORE injecting the script
      let showFloatingButton = false;
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        showFloatingButton = response?.data?.showFloatingButton ?? false;
        console.log('[X1Flox] Initial showFloatingButton:', showFloatingButton);
      } catch (error) {
        console.error('[X1Flox] Error loading settings for FAB:', error);
      }

      // Pass config to FAB via data attributes (avoiding inline scripts for CSP)
      // FAB runs in page context and doesn't have access to chrome.runtime
      // IMPORTANT: Set these BEFORE injecting the FAB script to avoid race condition
      const marker = ensureMarker(); // Ensure marker exists
      marker.setAttribute('data-popup-url', chrome.runtime.getURL('src/fab-popup/index.html'));
      marker.setAttribute('data-show-fab', String(showFloatingButton));
      console.log('[X1Flox] FAB config set via data attributes:', {
        popupUrl: chrome.runtime.getURL('src/fab-popup/index.html'),
        showFAB: String(showFloatingButton)
      });

      // NOW inject FAB JavaScript - data attributes are already set
      const fabScript = document.createElement('script');
      fabScript.src = chrome.runtime.getURL('content/whatsapp-fab.js');
      fabScript.onload = () => {
        console.log('[X1Flox] ✅ FAB JavaScript loaded and initialized');
      };
      fabScript.onerror = (error) => {
        console.error('[X1Flox] ❌ Error loading FAB JavaScript:', error);
      };
      document.head.appendChild(fabScript);
    }

    private async waitForWhatsAppReady(): Promise<void> {
      return new Promise((resolve) => {
        const check = () => {
          const chatContainer = document.querySelector(SELECTORS.chatContainer);
          if (chatContainer) {
            console.log('[X1Flox] WhatsApp container found');
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
        console.error('[X1Flox] WhatsApp Web is not ready! Action:', action.type);
        return { success: false, error: 'WhatsApp Web is not ready' };
      }

      console.log('[X1Flox] Handling action:', action.type, 'Payload:', action.payload);

      switch (action.type) {
        case 'SEND_SINGLE_MESSAGE':
          // Route popup/FAB messages through overlay's sendSingleMessage()
          // This ensures they show the execution popup like footer shortcuts do
          console.log('[X1Flox] Routing popup message through overlay:', action.payload);
          document.dispatchEvent(new CustomEvent('X1FloxSendSingleMessageFromPopup', {
            detail: {
              message: action.payload.message
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

        case 'EXECUTE_SCRIPT':
          // Handle three formats:
          // 1. From UI overlay/FAB: { scriptId (for tracking), steps, chatId, scriptName }
          // 2. From popup: { scriptId (from DB) } - uses active chat
          // 3. From trigger: { scriptId, chatId } - uses specific chat
          // Check for 'steps' FIRST because UI overlay sends both scriptId (temporary) and steps
          if (action.payload.steps) {
            // Execute in background without waiting (to avoid message channel timeout)
            this.executeScriptWithSteps(action.payload).catch((error: any) => {
              const errorMessage = error?.message || String(error);
              console.error('[X1Flox] Background script execution failed:', errorMessage);
            });
            // Return immediately - UI will track progress via events
            return { success: true, message: 'Script execution started' };
          } else if (action.payload.scriptId) {
            // Pass chatId if provided (from trigger), otherwise undefined (uses active chat)
            // Execute in background without waiting (to avoid message channel timeout)
            this.scriptExecutor.executeScript(
              action.payload.scriptId,
              action.payload.chatId  // Optional: undefined for popup, specific for trigger
            ).catch((error: any) => {
              const errorMessage = error?.message || String(error);
              console.error('[X1Flox] Background script execution failed:', errorMessage);
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
            console.log('[X1Flox] Paused direct script execution:', pauseScriptId);
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
            console.log('[X1Flox] Resumed direct script execution:', resumeScriptId);
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
            console.log('[X1Flox] Cancelled direct script execution:', cancelScriptId);
            return { success: true };
          } else {
            return this.scriptExecutor.cancel(cancelScriptId);
          }

        case 'CANCEL_ALL_SCRIPTS':
          // Cancel all direct executions
          this.directExecutions.forEach((exec, scriptId) => {
            exec.isCancelled = true;
            console.log('[X1Flox] Cancelled direct execution:', scriptId);
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
        console.log('[X1Flox] Sending message via page script:', text.substring(0, 50) + '...', chatId ? `to chat: ${chatId}` : '');

        // Generate unique request ID
        const requestId = `req_${Date.now()}_${Math.random()}`;

        // Create promise that will be resolved by event listener
        const promise = new Promise<any>((resolve, reject) => {
          this.pendingRequests.set(requestId, { resolve, reject });

          // Dynamic timeout based on sendDelay + 60s buffer
          // This ensures timeout never fires before typing animation completes
          // For a 120s typing delay, timeout will be 180s (120s + 60s buffer)
          const timeout = (sendDelay || 0) + 60000;
          console.log('[X1Flox] Text message timeout set to', timeout, 'ms (sendDelay:', sendDelay, 'ms + 60s buffer)');
          setTimeout(() => {
            if (this.pendingRequests.has(requestId)) {
              this.pendingRequests.delete(requestId);
              console.error('[X1Flox] ❌ TIMEOUT: Text message took too long (timeout:', timeout, 'ms)');
              reject(new Error('Timeout: Message send took too long'));
            }
          }, timeout);
        });

        // Dispatch event to page script
        document.dispatchEvent(new CustomEvent('X1FloxSendMessage', {
          detail: { text, requestId, chatId, showTyping, sendDelay }
        }));

        // Wait for response
        return await promise;

      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[X1Flox] Error sending message:', errorMessage, error);
        return { success: false, error: error.message };
      }
    }

    async sendAudio(payload: any): Promise<any> {
      try {
        // Check if page script is loaded
        const isPageScriptLoaded = document.getElementById('x1flox-marker');
        console.log('[X1Flox] Page script marker exists?', !!isPageScriptLoaded);

        if (!isPageScriptLoaded) {
          console.error('[X1Flox] ❌ Page script NOT LOADED! Re-injecting...');
          await this.injectScripts();
          // Wait a bit for injection
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        console.log('[X1Flox] Sending audio via page script...');
        console.log('[X1Flox] Payload received:', payload);
        console.log('[X1Flox] audioData type:', typeof payload.audioData);
        console.log('[X1Flox] audioData value:', payload.audioData);
        console.log('[X1Flox] Is string?:', typeof payload.audioData === 'string');
        console.log('[X1Flox] String length:', typeof payload.audioData === 'string' ? payload.audioData.length : 'N/A');

        // Generate unique request ID
        const requestId = `req_audio_${Date.now()}_${Math.random()}`;

        // Create promise that will be resolved by event listener
        const promise = new Promise<any>((resolve, reject) => {
          this.pendingRequests.set(requestId, { resolve, reject });

          // Dynamic timeout based on sendDelay + 90s buffer for upload/processing
          // Audio files need more buffer time for upload compared to text
          const timeout = (payload.sendDelay || 0) + 90000;
          console.log('[X1Flox] Audio message timeout set to', timeout, 'ms (sendDelay:', payload.sendDelay, 'ms + 90s buffer)');
          setTimeout(() => {
            if (this.pendingRequests.has(requestId)) {
              this.pendingRequests.delete(requestId);
              console.error('[X1Flox] ❌ TIMEOUT: Audio send took too long (timeout:', timeout, 'ms)');
              reject(new Error('Timeout: Audio send took too long'));
            }
          }, timeout);
        });

        // Dispatch event to page script
        console.log('[X1Flox] Dispatching X1FloxSendAudio event...');
        console.log('[X1Flox] Event detail:', { audioData: 'base64...', duration: payload.duration, requestId });

        document.dispatchEvent(new CustomEvent('X1FloxSendAudio', {
          detail: {
            audioData: payload.audioData,  // Base64 or Blob URL
            duration: payload.duration,     // Audio duration in seconds
            requestId,
            chatId: payload.chatId,         // Optional chatId
            showRecording: payload.showRecording,  // Optional showRecording animation
            sendDelay: payload.sendDelay    // Optional sendDelay (used as recording duration)
          }
        }));

        console.log('[X1Flox] ✅ Event dispatched! Waiting for page script response...');

        // Wait for response
        return await promise;

      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[X1Flox] Error sending audio:', errorMessage, error);
        return { success: false, error: error.message };
      }
    }

    async sendImage(payload: any): Promise<any> {
      try {
        const isPageScriptLoaded = document.getElementById('x1flox-marker');
        if (!isPageScriptLoaded) {
          console.error('[X1Flox] ❌ Page script NOT LOADED! Re-injecting...');
          await this.injectScripts();
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        console.log('[X1Flox] Sending image via page script...');

        const requestId = `req_image_${Date.now()}_${Math.random()}`;

        const promise = new Promise<any>((resolve, reject) => {
          this.pendingRequests.set(requestId, { resolve, reject });

          // Dynamic timeout: sendDelay + 60s buffer for upload/processing
          // Images have no animation, but may have sendDelay configured in scripts
          const timeout = (payload.sendDelay || 0) + 60000;
          console.log('[X1Flox] Image message timeout set to', timeout, 'ms (sendDelay:', payload.sendDelay, 'ms + 60s buffer)');
          setTimeout(() => {
            if (this.pendingRequests.has(requestId)) {
              this.pendingRequests.delete(requestId);
              reject(new Error('Timeout: Image send took too long'));
            }
          }, timeout);
        });

        document.dispatchEvent(new CustomEvent('X1FloxSendImage', {
          detail: {
            imageData: payload.imageData,
            caption: payload.caption || '',
            requestId,
            chatId: payload.chatId  // Optional chatId
          }
        }));

        console.log('[X1Flox] ✅ Image event dispatched!');

        return await promise;

      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[X1Flox] Error sending image:', errorMessage, error);
        return { success: false, error: error.message };
      }
    }

    async sendVideo(payload: any): Promise<any> {
      try {
        const isPageScriptLoaded = document.getElementById('x1flox-marker');
        if (!isPageScriptLoaded) {
          console.error('[X1Flox] ❌ Page script NOT LOADED! Re-injecting...');
          await this.injectScripts();
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        console.log('[X1Flox] Sending video via page script...');

        const requestId = `req_video_${Date.now()}_${Math.random()}`;

        const promise = new Promise<any>((resolve, reject) => {
          this.pendingRequests.set(requestId, { resolve, reject });

          // Dynamic timeout: sendDelay + 120s buffer for upload/processing
          // Videos have no animation, but may have sendDelay configured in scripts
          // Larger buffer (120s) because video files can be very large
          const timeout = (payload.sendDelay || 0) + 120000;
          console.log('[X1Flox] Video message timeout set to', timeout, 'ms (sendDelay:', payload.sendDelay, 'ms + 120s buffer)');
          setTimeout(() => {
            if (this.pendingRequests.has(requestId)) {
              this.pendingRequests.delete(requestId);
              reject(new Error('Timeout: Video send took too long'));
            }
          }, timeout);
        });

        document.dispatchEvent(new CustomEvent('X1FloxSendVideo', {
          detail: {
            videoData: payload.videoData,
            caption: payload.caption || '',
            requestId,
            chatId: payload.chatId  // Optional chatId
          }
        }));

        console.log('[X1Flox] ✅ Video event dispatched!');

        return await promise;

      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[X1Flox] Error sending video:', errorMessage, error);
        return { success: false, error: error.message };
      }
    }


    private async executeScriptWithSteps(payload: any): Promise<any> {
      const scriptId = payload.scriptId || `script-${Date.now()}`;

      try {
        console.log('[X1Flox] Executing script with steps:', payload.scriptName);
        const { steps, chatId, scriptName } = payload;

        if (!steps || !Array.isArray(steps) || steps.length === 0) {
          return { success: false, error: 'Invalid steps array' };
        }

        // Create execution state for this specific script
        this.directExecutions.set(scriptId, {
          isPaused: false,
          isCancelled: false
        });

        console.log('[X1Flox] Started direct script execution:', scriptId);

        // Emit script start event for UI overlay to show progress popup
        document.dispatchEvent(new CustomEvent('X1FloxScriptStart', {
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
            console.log('[X1Flox] Execution state lost for:', scriptId);
            break;
          }

          // Check if cancelled
          if (execution.isCancelled) {
            console.log('[X1Flox] Direct script execution cancelled:', scriptId);
            break;
          }

          // Wait if paused
          while (execution.isPaused && !execution.isCancelled) {
            console.log('[X1Flox] Script paused, waiting...', scriptId);
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Check again after pause
          if (execution.isCancelled) {
            console.log('[X1Flox] Direct script execution cancelled after pause:', scriptId);
            break;
          }

          const step = steps[i];
          const message = step.message;
          const delayAfter = step.delayAfter || 0;

          console.log('[X1Flox] Executing step', i + 1, 'of', steps.length, '- type:', message.type);

          // Dispatch progress event for UI overlay
          document.dispatchEvent(new CustomEvent('X1FloxScriptProgress', {
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
            default:
              console.error('[X1Flox] Unknown message type:', message.type);
              result = { success: false, error: `Unknown message type: ${message.type}` };
          }

          if (result && result.success) {
            console.log('[X1Flox] Step', i + 1, 'sent successfully');
            // Dispatch success event
            document.dispatchEvent(new CustomEvent('X1FloxScriptProgress', {
              detail: {
                scriptId: scriptId,
                step: i + 1,
                status: 'success'
              }
            }));
          } else {
            console.error('[X1Flox] Step', i + 1, 'failed:', result?.error);
            // Dispatch error event
            document.dispatchEvent(new CustomEvent('X1FloxScriptProgress', {
              detail: {
                scriptId: scriptId,
                step: i + 1,
                status: 'error',
                error: result?.error
              }
            }));
          }

          // Delay before next message (if not last step)
          if (i < steps.length - 1 && delayAfter > 0) {
            console.log('[X1Flox] Waiting', delayAfter, 'ms before next message');

            // Break delay into smaller chunks to allow pause/cancellation during delay
            const chunks = Math.ceil(delayAfter / 100);
            for (let j = 0; j < chunks; j++) {
              const delayExecution = this.directExecutions.get(scriptId);
              if (!delayExecution) break;

              // Check if cancelled
              if (delayExecution.isCancelled) break;

              // Wait if paused during delay
              while (delayExecution.isPaused && !delayExecution.isCancelled) {
                console.log('[X1Flox] Script paused during delay, waiting...', scriptId);
                await new Promise(resolve => setTimeout(resolve, 100));
              }

              // Check again after pause
              if (delayExecution.isCancelled) break;

              await new Promise(resolve => setTimeout(resolve, Math.min(100, delayAfter - j * 100)));
            }
          }
        }

        // Get final execution state
        const finalExecution = this.directExecutions.get(scriptId);
        const wasCancelled = finalExecution?.isCancelled || false;

        // Clean up execution state
        this.directExecutions.delete(scriptId);

        if (wasCancelled) {
          console.log('[X1Flox] Script execution cancelled by user:', scriptId);
          // Emit cancellation event
          document.dispatchEvent(new CustomEvent('X1FloxScriptComplete', {
            detail: {
              scriptId,
              success: false,
              cancelled: true
            }
          }));
          return { success: false, error: 'Script cancelled by user' };
        }

        console.log('[X1Flox] Script execution completed:', scriptName);

        // Emit completion event for UI overlay
        document.dispatchEvent(new CustomEvent('X1FloxScriptComplete', {
          detail: {
            scriptId,
            success: true
          }
        }));

        return { success: true };

      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('[X1Flox] Error executing script with steps:', errorMessage, error);
        // Clean up on error
        this.directExecutions.delete(scriptId);

        // Emit error event for UI overlay
        document.dispatchEvent(new CustomEvent('X1FloxScriptError', {
          detail: {
            scriptId,
            error: errorMessage
          }
        }));

        return { success: false, error: errorMessage };
      }
    }

    async getActiveChat(): Promise<any> {
      return new Promise((resolve) => {
        const requestId = `active-chat-${Date.now()}`;
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'Timeout' });
        }, 3000);

        const handler = (event: any) => {
          if (event.detail?.requestId === requestId) {
            clearTimeout(timeout);
            document.removeEventListener('X1FloxActiveChatResult', handler);
            if (event.detail.success) {
              // Use fallback getChatPhoto() if API didn't return photo
              const chatPhoto = event.detail.chatPhoto || this.getChatPhoto();
              resolve({
                success: true,
                data: { active: true, chatName: event.detail.chatName, chatId: event.detail.chatId, chatPhoto }
              });
            } else {
              resolve({ success: false, error: event.detail.error });
            }
          }
        };

        document.addEventListener('X1FloxActiveChatResult', handler);
        document.dispatchEvent(new CustomEvent('X1FloxGetActiveChat', {
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
            document.removeEventListener('X1FloxChatInfoResult', handler);
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

        document.addEventListener('X1FloxChatInfoResult', handler);
        document.dispatchEvent(new CustomEvent('X1FloxGetChatInfo', {
          detail: { requestId, chatId }
        }));
      });
    }

    private getChatPhoto(): string | undefined {
      console.log('[X1Flox Injector] Getting chat photo from DOM as fallback...');

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
          console.log('[X1Flox Injector] Found chat photo from selector:', selector, '→', img.src);
          return img.src;
        }
      }

      console.log('[X1Flox Injector] No chat photo found in DOM');
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
            document.removeEventListener('X1FloxOpenChatResult', handler);
            resolve({
              success: event.detail.success,
              error: event.detail.error
            });
          }
        };

        document.addEventListener('X1FloxOpenChatResult', handler);
        document.dispatchEvent(new CustomEvent('X1FloxOpenChat', {
          detail: { chatId, requestId }
        }));
      });
    }
    */
  }

  // Initialize
  new WhatsAppInjector();

  console.log('[X1Flox] Content script initialization complete');
})();
