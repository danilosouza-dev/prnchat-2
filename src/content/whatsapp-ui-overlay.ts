/**
 * PrinChat UI Overlay
 * Injects custom UI components into WhatsApp Web interface
 */

interface Script {
  id: string;
  name: string;
  steps: any[];
}

interface Message {
  id: string;
  content: string;
  type: string;
  caption?: string;
  audioData?: string | Blob;
  duration?: number;
  imageData?: string | Blob;
  videoData?: string | Blob;
  fileData?: string | Blob;
  fileName?: string;
  showTyping?: boolean;
  showRecording?: boolean;
  sendDelay?: number;
}

interface StatusItem {
  id: string;
  type: 'text' | 'audio' | 'image' | 'video' | 'file';
  status: 'sending' | 'success' | 'error';
  text: string;
  error?: string;
}

interface ScriptExecution {
  id: string;
  scriptName: string;
  chatName: string;
  chatPhoto?: string;
  totalSteps: number;
  completedSteps: number;
  status: 'running' | 'paused' | 'completed' | 'error';
  startTime: number;
  elapsedSeconds: number;
  error?: string;
}

interface MessageExecution {
  id: string;
  messagePreview: string;
  messageType: string;
  chatName: string;
  chatPhoto?: string;
  status: 'sending' | 'completed' | 'error';
  startTime: number;
  elapsedSeconds: number;
  hasDelay: boolean;
  sendDelay: number;
  error?: string;
}

class WhatsAppUIOverlay {
  private customHeader: HTMLElement | null = null; // Custom header above WhatsApp
  private shortcutBar: HTMLElement | null = null;
  // private fab: HTMLElement | null = null; // Not used in new design
  private statusPopup: HTMLElement | null = null; // Script execution popup
  private messageStatusPopup: HTMLElement | null = null; // Message execution popup (separate!)
  private tooltip: HTMLElement | null = null;
  private scripts: Script[] = [];
  private messages: Message[] = [];
  private confirmingMessageId: string | null = null;
  private confirmingScriptId: string | null = null;
  private requireConfirmation: boolean = true;
  private showShortcuts: boolean = true;
  private showScriptExecutionPopup: boolean = true;
  private showMessageExecutionPopup: boolean = true; // Show popup for delayed messages
  private runningScripts: Map<string, ScriptExecution> = new Map();
  private completedScripts: ScriptExecution[] = [];
  private scriptTimers: Map<string, NodeJS.Timeout> = new Map();
  private renderedCardIds: Set<string> = new Set(); // Track which cards have been rendered to avoid re-animating them

  // Message Execution System (PARALLEL execution like scripts run independently)
  private runningMessages: Map<string, MessageExecution> = new Map();
  private completedMessages: MessageExecution[] = [];
  private messageTimers: Map<string, NodeJS.Timeout> = new Map();

  // Execution states for pause/cancel (like scripts' directExecutions)
  private messageExecutions: Map<string, { isPaused: boolean, isCancelled: boolean }> = new Map();

  // Cache for active chat to avoid repeated GET_ACTIVE_CHAT calls during rapid sends
  private cachedChatId: string | null = null;
  private cachedChatTimestamp: number = 0;
  private readonly CHAT_CACHE_TTL = 10000; // 10 seconds cache
  private lastKnownChatElement: Element | null = null; // Track chat changes

  // MutationObserver to detect script popup size changes
  private scriptPopupObserver: MutationObserver | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      console.log('[PrinChat UI] Initializing overlay...');

      // Wait for WhatsApp to load
      console.log('[PrinChat UI] Step 1: Waiting for WhatsApp to load...');
      await this.waitForWhatsApp();
      console.log('[PrinChat UI] ✓ WhatsApp loaded');

      // Load data
      console.log('[PrinChat UI] Step 2: Loading scripts and messages...');
      await this.loadData();
      console.log('[PrinChat UI] ✓ Data loaded');

      // Create UI components
      console.log('[PrinChat UI] Step 3: Creating custom header...');
      this.createCustomHeader();
      console.log('[PrinChat UI] ✓ Custom header created');

      console.log('[PrinChat UI] Step 4: Creating shortcut bar...');
      this.createShortcutBar();
      console.log('[PrinChat UI] ✓ Shortcut bar created');

      console.log('[PrinChat UI] Step 5: Creating tooltip...');
      this.createTooltip();
      console.log('[PrinChat UI] ✓ Tooltip created');

      // Monitor chat changes
      console.log('[PrinChat UI] Step 6: Setting up chat monitor...');
      this.monitorChatChanges();
      console.log('[PrinChat UI] ✓ Chat monitor active');

      // Listen for execution events
      console.log('[PrinChat UI] Step 7: Setting up execution listeners...');
      this.listenForExecutionEvents();
      console.log('[PrinChat UI] ✓ Execution listeners active');

      // Listen for settings changes
      console.log('[PrinChat UI] Step 8: Setting up settings change listeners...');
      this.listenForSettingsChanges();
      console.log('[PrinChat UI] ✓ Settings change listeners active');

      // Listen for data changes (messages, scripts, tags)
      console.log('[PrinChat UI] Step 9: Setting up data change listeners...');
      this.listenForDataChanges();
      console.log('[PrinChat UI] ✓ Data change listeners active');

      // Setup resize/scroll listeners for responsive popups
      console.log('[PrinChat UI] Step 10: Setting up responsive popup listeners...');
      this.setupResizeListeners();
      console.log('[PrinChat UI] ✓ Responsive popup listeners active');

      console.log('[PrinChat UI] ✅ Overlay fully initialized');
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[PrinChat UI] ❌ Fatal error during initialization:', errorMessage);
      console.error('[PrinChat UI] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    }
  }

  private async waitForWhatsApp(): Promise<void> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 60; // 30 seconds (60 * 500ms)

      const checkInterval = setInterval(() => {
        attempts++;
        const main = document.querySelector('#main');

        console.log(`[PrinChat UI] Checking for WhatsApp #main (attempt ${attempts}/${maxAttempts})...`);

        if (main) {
          console.log('[PrinChat UI] Found #main element');
          clearInterval(checkInterval);
          resolve();
        } else if (attempts >= maxAttempts) {
          console.error('[PrinChat UI] Timeout: #main element not found after 30 seconds');
          clearInterval(checkInterval);
          reject(new Error('WhatsApp #main element not found'));
        }
      }, 500);
    });
  }

  private async loadData() {
    try {
      console.log('[PrinChat UI] Requesting scripts and messages from content script...');
      // Request data from content script via custom event
      const response = await this.requestFromContentScript({ type: 'GET_SCRIPTS_AND_MESSAGES' });

      console.log('[PrinChat UI] Response received:', response);

      if (response && response.success) {
        this.scripts = response.data.scripts || [];
        this.messages = response.data.messages || [];

        // Debug: Check file messages after receiving from injector
        console.log('[PrinChat UI] 🔍 DEBUG - Messages received in UI overlay');
        const fileMessages = this.messages.filter((m: any) => m.type === 'file');
        fileMessages.forEach((msg: any) => {
          console.log('[PrinChat UI] 🔍 File message in UI overlay:', {
            id: msg.id,
            name: msg.name,
            hasFileData: !!msg.fileData,
            fileDataType: typeof msg.fileData,
            fileDataValue: msg.fileData,
            isString: typeof msg.fileData === 'string',
            length: typeof msg.fileData === 'string' ? msg.fileData.length : 0
          });
        });

        // Note: Large media restoration is now done by the injector before sending
        // No need to restore here as the injector already handled it

        // Load settings
        console.log('[PrinChat UI] Loading settings...');
        const settingsResponse = await this.requestFromContentScript({ type: 'GET_SETTINGS' });
        if (settingsResponse && settingsResponse.success) {
          this.requireConfirmation = settingsResponse.data?.requireSendConfirmation ?? true;
          this.showShortcuts = settingsResponse.data?.showShortcuts ?? true;
          this.showScriptExecutionPopup = settingsResponse.data?.showScriptExecutionPopup ?? true;
          this.showMessageExecutionPopup = settingsResponse.data?.showMessageExecutionPopup ?? true;
          console.log('[PrinChat UI] Require confirmation:', this.requireConfirmation);
          console.log('[PrinChat UI] Show shortcuts:', this.showShortcuts);
          console.log('[PrinChat UI] Show script execution popup:', this.showScriptExecutionPopup);
          console.log('[PrinChat UI] Show message execution popup:', this.showMessageExecutionPopup);
        }
        console.log('[PrinChat UI] Loaded', this.scripts.length, 'scripts and', this.messages.length, 'messages');
      } else {
        console.error('[PrinChat UI] Failed to load data:', response?.error || 'Unknown error');
        // Initialize with empty arrays to prevent errors
        this.scripts = [];
        this.messages = [];
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[PrinChat UI] Error loading data:', errorMessage);
      // Initialize with empty arrays to prevent errors
      this.scripts = [];
      this.messages = [];
    }
  }

  private async requestFromContentScript(message: any, timeoutMs: number = 5000): Promise<any> {
    return new Promise((resolve) => {
      const requestId = `ui-${Date.now()}-${Math.random()}`;
      console.log('[PrinChat UI] Sending request:', message.type, 'with ID:', requestId);

      const handler = (event: any) => {
        console.log('[PrinChat UI] Response event received:', event.detail);
        if (event.detail?.requestId === requestId) {
          console.log('[PrinChat UI] Response matches request ID:', requestId);
          document.removeEventListener('PrinChatUIResponse', handler);
          resolve(event.detail.response);
        }
      };

      document.addEventListener('PrinChatUIResponse', handler);
      console.log('[PrinChat UI] Added response listener for:', requestId);

      // Configurable timeout
      setTimeout(() => {
        console.log('[PrinChat UI] Request timed out:', requestId);
        document.removeEventListener('PrinChatUIResponse', handler);
        resolve({ success: false, error: `Request timeout after ${timeoutMs}ms`, isTimeout: true });
      }, timeoutMs);

      console.log('[PrinChat UI] Dispatching PrinChatUIRequest event...');
      document.dispatchEvent(new CustomEvent('PrinChatUIRequest', {
        detail: { requestId, message }
      }));
      console.log('[PrinChat UI] Event dispatched successfully');
    });
  }

  private createShortcutBar() {
    console.log('[PrinChat UI] Creating shortcut bar with', this.scripts.length, 'scripts and', this.messages.length, 'messages');

    // Remove existing bar if any
    const existing = document.querySelector('.princhat-shortcut-bar');
    if (existing) {
      console.log('[PrinChat UI] Removing existing shortcut bar');
      existing.remove();
    }

    // Create shortcut bar
    this.shortcutBar = document.createElement('div');
    this.shortcutBar.className = 'princhat-shortcut-bar';
    console.log('[PrinChat UI] Shortcut bar div created');

    // Add script buttons
    this.scripts.forEach((script, index) => {
      console.log(`[PrinChat UI] Adding script button ${index + 1}/${this.scripts.length}:`, script.name);
      const btn = this.createShortcutButton(
        script.name,
        'script',
        script.id,
        () => this.handleScriptCardClick(script),
        () => this.handleScriptExecuteClick(script)
      );
      this.shortcutBar!.appendChild(btn);
    });

    // Add message buttons
    this.messages.forEach((message, index) => {
      const preview = message.content.substring(0, 30) + (message.content.length > 30 ? '...' : '');
      console.log(`[PrinChat UI] Adding message button ${index + 1}/${this.messages.length}:`, preview);
      const btn = this.createShortcutButton(
        preview,
        'message',
        message.id,
        () => this.handleMessageCardClick(message),
        () => this.handleMessageSendClick(message)
      );
      this.shortcutBar!.appendChild(btn);
    });

    console.log('[PrinChat UI] Appending shortcut bar to WhatsApp footer');

    // Try to find WhatsApp footer and insert shortcut bar inside it
    const footer = document.querySelector('#main footer');
    if (footer) {
      console.log('[PrinChat UI] Found WhatsApp footer, inserting shortcut bar at the end');
      footer.appendChild(this.shortcutBar);
    } else {
      console.log('[PrinChat UI] WhatsApp footer not found, appending to body');
      document.body.appendChild(this.shortcutBar);
    }

    console.log('[PrinChat UI] Shortcut bar appended, checking visibility...');

    // Verify it's in the DOM
    const inDOM = document.querySelector('.princhat-shortcut-bar');
    console.log('[PrinChat UI] Shortcut bar in DOM?', !!inDOM);
    if (inDOM) {
      const styles = window.getComputedStyle(inDOM);
      console.log('[PrinChat UI] Shortcut bar display:', styles.display, 'visibility:', styles.visibility, 'opacity:', styles.opacity);
    }
  }

  private createShortcutButton(
    text: string,
    type: 'script' | 'message',
    id: string,
    onCardClick: () => void,
    onActionClick: () => void
  ): HTMLElement {
    const btn = document.createElement('div');
    btn.className = `princhat-shortcut-btn`;
    btn.dataset.id = id;
    btn.dataset.type = type;
    btn.title = text;

    // Icon based on message type (for messages) or script icon (for scripts)
    let iconSvg = '';

    if (type === 'script') {
      // Script icon - Zap/Lightning bolt
      iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>`;
    } else {
      // Message icon based on message type
      const message = this.messages.find(m => m.id === id);
      const messageType = message?.type || 'text';

      switch (messageType) {
        case 'text':
          iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>`;
          break;
        case 'audio':
          iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>`;
          break;
        case 'image':
          iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          </svg>`;
          break;
        case 'video':
          iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
          </svg>`;
          break;

        default:
          iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>`;
      }
    }

    btn.innerHTML = `
      <div class="princhat-shortcut-btn-icon">${iconSvg}</div>
      <span class="princhat-shortcut-btn-text">${text}</span>
      <button class="princhat-shortcut-btn-action" title="Clique para enviar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
      </button>
    `;

    // Card click handler
    btn.addEventListener('click', (e) => {
      // Don't trigger if clicking the action button
      if ((e.target as HTMLElement).closest('.princhat-shortcut-btn-action')) {
        return;
      }
      onCardClick();
    });

    // Action button click handler
    const actionBtn = btn.querySelector('.princhat-shortcut-btn-action');
    actionBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      onActionClick();
    });

    // Tooltip on hover
    btn.addEventListener('mouseenter', (e) => {
      this.showTooltip(text, e.currentTarget as HTMLElement);
    });

    btn.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });

    return btn;
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Get a preview of the message for display in popup
   */
  private getMessagePreview(message: Message): string {
    const maxLength = 30;
    switch (message.type) {
      case 'text':
        const text = message.content.substring(0, maxLength);
        return text.length < message.content.length ? `${text}...` : text;
      case 'audio':
        return '🎤 Áudio';
      case 'image':
        return message.caption ? `🖼️ ${message.caption.substring(0, maxLength)}` : '🖼️ Imagem';
      case 'video':
        return message.caption ? `🎥 ${message.caption.substring(0, maxLength)}` : '🎥 Vídeo';

      default:
        return 'Mensagem';
    }
  }

  private handleMessageCardClick(message: Message) {
    if (!this.requireConfirmation) return;

    console.log('[PrinChat UI] Message card clicked:', message.id);
    // Toggle confirmation state
    if (this.confirmingMessageId === message.id) {
      this.confirmingMessageId = null;
      console.log('[PrinChat UI] Deselecting message');
    } else {
      this.confirmingMessageId = message.id;
      this.confirmingScriptId = null; // Clear script confirmation
      console.log('[PrinChat UI] Selecting message for confirmation');
    }
    this.updateShortcutButtons();
  }

  private async handleMessageSendClick(message: Message) {
    if (this.requireConfirmation) {
      if (this.confirmingMessageId === message.id) {
        // Confirmed - deselect immediately and send message
        this.confirmingMessageId = null;
        this.updateShortcutButtons();
        await this.sendSingleMessage(message);
      } else {
        // First click - set confirmation state
        this.confirmingMessageId = message.id;
        this.confirmingScriptId = null;
        this.updateShortcutButtons();
      }
    } else {
      // No confirmation required - send immediately
      await this.sendSingleMessage(message);
    }
  }

  private handleScriptCardClick(script: Script) {
    if (!this.requireConfirmation) return;

    // Toggle confirmation state
    if (this.confirmingScriptId === script.id) {
      this.confirmingScriptId = null;
    } else {
      this.confirmingScriptId = script.id;
      this.confirmingMessageId = null; // Clear message confirmation
    }
    this.updateShortcutButtons();
  }

  private async handleScriptExecuteClick(script: Script) {
    if (this.requireConfirmation) {
      if (this.confirmingScriptId === script.id) {
        // Confirmed - deselect immediately and execute script
        this.confirmingScriptId = null;
        this.updateShortcutButtons();
        await this.executeScript(script);
      } else {
        // First click - set confirmation state
        this.confirmingScriptId = script.id;
        this.confirmingMessageId = null;
        this.updateShortcutButtons();
      }
    } else {
      // No confirmation required - execute immediately
      await this.executeScript(script);
    }
  }

  private updateShortcutButtons() {
    const buttons = document.querySelectorAll('.princhat-shortcut-btn');
    buttons.forEach((btn) => {
      const element = btn as HTMLElement;
      const id = element.dataset.id;
      const type = element.dataset.type;

      // Remove confirming class from all
      element.classList.remove('confirming');

      // Add confirming class to the active one
      if (type === 'message' && id === this.confirmingMessageId) {
        element.classList.add('confirming');
      } else if (type === 'script' && id === this.confirmingScriptId) {
        element.classList.add('confirming');
      }

      // Update action button icon
      const actionBtn = element.querySelector('.princhat-shortcut-btn-action');
      if (actionBtn) {
        const isConfirming = (type === 'message' && id === this.confirmingMessageId) ||
          (type === 'script' && id === this.confirmingScriptId);
        actionBtn.innerHTML = isConfirming
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
               <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
             </svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
               <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
             </svg>`;
      }
    });
  }

  /**
   * Get active chat ID with caching to support rapid message sends
   * Cache is valid for 10 seconds to avoid repeated GET_ACTIVE_CHAT calls
   */
  private async getActiveChatId(): Promise<string | null> {
    const now = Date.now();

    // Return cached value if still valid
    if (this.cachedChatId && (now - this.cachedChatTimestamp) < this.CHAT_CACHE_TTL) {
      console.log('[PrinChat UI] Using cached chat ID:', this.cachedChatId);
      return this.cachedChatId;
    }

    // Fetch fresh chat ID
    console.log('[PrinChat UI] Fetching active chat (cache expired or empty)...');
    const chatResponse = await this.requestFromContentScript({
      type: 'GET_ACTIVE_CHAT'
    }, 15000);

    if (!chatResponse || !chatResponse.success || !chatResponse.data?.chatId) {
      console.error('[PrinChat UI] Nenhum chat ativo selecionado');
      return null;
    }

    // Update cache
    this.cachedChatId = chatResponse.data.chatId;
    this.cachedChatTimestamp = now;
    console.log('[PrinChat UI] Chat ID cached:', this.cachedChatId);

    return this.cachedChatId;
  }

  /**
   * Invalidate chat cache when user changes chat
   * Called by monitorChatChanges when chat changes are detected
   */
  private invalidateChatCache() {
    console.log('[PrinChat UI] Invalidating chat cache');
    this.cachedChatId = null;
    this.cachedChatTimestamp = 0;
  }

  /**
   * Check if message has delay (only sendDelay > 0)
   * Animations (showTyping/showRecording) are handled by injector and don't need popup
   */
  private messageHasDelay(message: Message): boolean {
    const sendDelay = message.sendDelay || 0;
    return sendDelay > 0;
  }

  /**
   * Send message in PARALLEL (each executes independently with own delay/pause/cancel)
   */
  private async sendSingleMessage(message: Message) {
    // IMPORTANT: Only show popup for messages with delay
    // Messages without delay are sent directly without popup
    const hasDelay = this.messageHasDelay(message);

    if (!hasDelay) {
      // Send directly without popup (no delay = no need for pause/cancel controls)
      console.log('[PrinChat UI] Sending message without delay (no popup):', message.type);
      await this.sendMessageDirect(message);
      return;
    }

    // Message has delay - show popup with pause/cancel controls
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // IMPORTANT: Capture chat info NOW (not after delay) - like scripts do
    const chatId = await this.getActiveChatId();
    if (!chatId) {
      console.error('[PrinChat UI] No active chat selected');
      return;
    }

    // Capture chat name and photo NOW (before delay)
    const chatResponse = await this.requestFromContentScript({ type: 'GET_ACTIVE_CHAT' }, 15000);
    const chatName = chatResponse?.data?.chatName || 'Chat';
    const chatPhoto = chatResponse?.data?.chatPhoto;

    // Create execution state (for pause/cancel control)
    this.messageExecutions.set(messageId, {
      isPaused: false,
      isCancelled: false
    });

    console.log('[PrinChat UI] Starting message execution with delay (PARALLEL):', message.type, 'ID:', messageId, 'Chat:', chatName);

    // Execute in background (don't await - allows parallel execution)
    // Pass chatId, chatName, chatPhoto so message goes to correct chat even if user switches
    this.executeMessageWithDelay(message, messageId, chatId, chatName, chatPhoto).catch((error: any) => {
      const errorMessage = error?.message || String(error);
      console.error('[PrinChat UI] Message execution failed:', errorMessage);
    });
  }

  /**
   * Execute message with delay processing IN OVERLAY (allows pause/cancel)
   */
  private async executeMessageWithDelay(message: Message, messageId: string, targetChatId: string, targetChatName: string, targetChatPhoto?: string) {
    try {
      // Use target chat info (captured before delay), not current chat

      const sendDelay = message.sendDelay || 0;

      // Dispatch start event (creates popup card)
      document.dispatchEvent(new CustomEvent('PrinChatMessageStart', {
        detail: {
          messageId,
          messagePreview: this.getMessagePreview(message),
          messageType: message.type,
          chatName: targetChatName,
          chatPhoto: targetChatPhoto,
          hasDelay: sendDelay > 0,
          sendDelay
        }
      }));

      // NEW ARCHITECTURE: Always process delay in overlay for full control
      // If animation exists, start it BEFORE delay and stop it AFTER (or on cancel)
      const hasAnimation = message.showTyping || message.showRecording;

      // If animation: start it in page script (runs in parallel with delay)
      if (hasAnimation && sendDelay > 0) {
        console.log('[PrinChat UI] Starting animation in page script (parallel with delay)...');
        // Dispatch event to start animation in page script
        document.dispatchEvent(new CustomEvent('PrinChatStartAnimation', {
          detail: {
            messageId,
            chatId: targetChatId,
            animationType: message.showTyping ? 'typing' : 'recording',
            duration: sendDelay
          }
        }));
      }

      // ALWAYS process delay in overlay (allows pause/cancel for ALL messages)
      if (sendDelay > 0) {
        console.log('[PrinChat UI] Waiting', sendDelay, 'ms with pause/cancel support...');

        // Break delay into 100ms chunks (like scripts do for pause/cancel responsiveness)
        const chunks = Math.ceil(sendDelay / 100);
        for (let i = 0; i < chunks; i++) {
          const execution = this.messageExecutions.get(messageId);
          if (!execution) break;

          // Check if cancelled
          if (execution.isCancelled) {
            console.log('[PrinChat UI] Message cancelled during delay:', messageId);
            // If animation was running, stop it
            if (hasAnimation) {
              document.dispatchEvent(new CustomEvent('PrinChatStopAnimation', {
                detail: { messageId, chatId: targetChatId }
              }));
            }
            this.messageExecutions.delete(messageId);
            return;
          }

          // Wait if paused
          while (execution.isPaused && !execution.isCancelled) {
            console.log('[PrinChat UI] Message paused, waiting...', messageId);
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Check again after pause
          if (execution.isCancelled) {
            console.log('[PrinChat UI] Message cancelled after pause:', messageId);
            // If animation was running, stop it
            if (hasAnimation) {
              document.dispatchEvent(new CustomEvent('PrinChatStopAnimation', {
                detail: { messageId, chatId: targetChatId }
              }));
            }
            this.messageExecutions.delete(messageId);
            return;
          }

          // Sleep for chunk
          await new Promise(resolve => setTimeout(resolve, Math.min(100, sendDelay - i * 100)));
        }
      }

      // Check one more time before sending
      const execution = this.messageExecutions.get(messageId);
      if (execution?.isCancelled) {
        console.log('[PrinChat UI] Message cancelled before send:', messageId);
        this.messageExecutions.delete(messageId);
        return;
      }

      // Send message to page script
      // IMPORTANT: Use targetChatId (captured at start), not current chat
      // Delay already processed - animation (if any) already running
      console.log('[PrinChat UI] Delay complete, sending message to target chat:', targetChatId);

      const messageToSend = {
        ...message,
        // ALWAYS send with sendDelay=0 (delay already processed in overlay)
        // Animation (if exists) is already running and will be stopped by page script
        sendDelay: 0,
        // Keep animation flags so page script knows to stop animation
        showTyping: message.showTyping,
        showRecording: message.showRecording
      };

      await this.sendMessageDirect(messageToSend, targetChatId);

      // Clean up execution state
      this.messageExecutions.delete(messageId);

      console.log('[PrinChat UI] ✅ Message sent successfully');

      // Dispatch complete event
      document.dispatchEvent(new CustomEvent('PrinChatMessageComplete', {
        detail: { messageId, success: true }
      }));

    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[PrinChat UI] ❌ Error sending message:', errorMessage);

      // Clean up execution state
      this.messageExecutions.delete(messageId);

      // Dispatch error event
      document.dispatchEvent(new CustomEvent('PrinChatMessageError', {
        detail: { messageId, error: error.message }
      }));
    }
  }

  /**
   * Send message directly (actual sending logic)
   * @param message - Message to send
   * @param targetChatId - Optional target chat ID (if not provided, uses active chat)
   */
  private async sendMessageDirect(message: Message, targetChatId?: string) {
    try {
      // Use provided chatId or get active chat
      const chatId = targetChatId || await this.getActiveChatId();

      if (!chatId) {
        console.error('[PrinChat UI] Nenhum chat ativo selecionado');
        throw new Error('Nenhum chat ativo selecionado');
      }

      console.log('[PrinChat UI] Sending message to chat:', chatId, 'Type:', message.type);

      // Send based on message type
      let response;
      switch (message.type) {
        case 'text':
          // Dynamic timeout: sendDelay + 90s buffer for network/processing
          // This ensures timeout never happens before the typing animation completes
          const textTimeout = (message.sendDelay || 0) + 90000;
          response = await this.requestFromContentScript({
            type: 'SEND_MESSAGE',
            payload: {
              content: message.content,
              chatId,
              showTyping: message.showTyping,
              sendDelay: message.sendDelay
            }
          }, textTimeout);
          break;

        case 'image':
          // Data comes as base64 string from service worker
          // (Blobs are converted before sending via chrome.runtime.sendMessage)
          let imageData = message.imageData;

          // Just in case we still get a Blob somehow, convert it
          if (imageData instanceof Blob) {
            imageData = await this.blobToBase64(imageData);
          }

          // Dynamic timeout: sendDelay + 90s buffer (higher than injector to avoid race)
          const imageTimeout = (message.sendDelay || 0) + 90000;
          response = await this.requestFromContentScript({
            type: 'SEND_IMAGE',
            payload: {
              imageData,
              caption: message.caption || '',
              chatId,
              sendDelay: message.sendDelay
            }
          }, imageTimeout);
          break;

        case 'video':
          // Data comes as base64 string from service worker
          let videoData = message.videoData;
          if (videoData instanceof Blob) {
            videoData = await this.blobToBase64(videoData);
          }
          // Dynamic timeout: sendDelay + 150s buffer (higher than injector to avoid race)
          const videoTimeout = (message.sendDelay || 0) + 150000;
          response = await this.requestFromContentScript({
            type: 'SEND_VIDEO',
            payload: {
              videoData,
              caption: message.caption || '',
              chatId,
              sendDelay: message.sendDelay
            }
          }, videoTimeout);
          break;

        case 'audio':
          // Data comes as base64 string from service worker
          let audioData = message.audioData;
          if (audioData instanceof Blob) {
            audioData = await this.blobToBase64(audioData);
          }
          // Dynamic timeout: sendDelay + 120s buffer for upload/processing
          const audioTimeout = (message.sendDelay || 0) + 120000;
          response = await this.requestFromContentScript({
            type: 'SEND_AUDIO',
            payload: {
              audioData,
              duration: message.duration,
              chatId,
              showRecording: message.showRecording,
              sendDelay: message.sendDelay
            }
          }, audioTimeout);
          break;

        case 'file':
          console.log('[PrinChat UI] 🔍 DEBUG FILE - message object:', message);
          console.log('[PrinChat UI] 🔍 DEBUG FILE - message.fileData type:', typeof message.fileData);
          console.log('[PrinChat UI] 🔍 DEBUG FILE - message.fileData value:', message.fileData);
          console.log('[PrinChat UI] 🔍 DEBUG FILE - message.fileName:', message.fileName);

          // Data comes as base64 string from service worker
          let fileData = message.fileData;

          console.log('[PrinChat UI] 🔍 DEBUG FILE - fileData before Blob check:', fileData);
          console.log('[PrinChat UI] 🔍 DEBUG FILE - fileData instanceof Blob?', fileData instanceof Blob);

          if (fileData instanceof Blob) {
            console.log('[PrinChat UI] 🔍 DEBUG FILE - Converting Blob to base64...');
            fileData = await this.blobToBase64(fileData);
            console.log('[PrinChat UI] 🔍 DEBUG FILE - After conversion:', typeof fileData, fileData?.substring?.(0, 100));
          }

          // Validate fileData is a string (base64 or blob URL)
          console.log('[PrinChat UI] 🔍 DEBUG FILE - Final fileData type:', typeof fileData);
          console.log('[PrinChat UI] 🔍 DEBUG FILE - Final fileData valid?', !!fileData && typeof fileData === 'string');

          if (!fileData || typeof fileData !== 'string') {
            console.error('[PrinChat UI] ❌ DEBUG FILE - Validation failed!');
            console.error('[PrinChat UI] ❌ DEBUG FILE - fileData:', fileData);
            console.error('[PrinChat UI] ❌ DEBUG FILE - Complete message:', JSON.stringify(message, null, 2));

            // Provide helpful error message
            let errorMsg = 'Arquivo não encontrado ou inválido.';
            if (fileData === null || fileData === undefined) {
              errorMsg = 'O arquivo desta mensagem não foi encontrado. Por favor, edite a mensagem e selecione o arquivo novamente.';
            } else if (typeof fileData === 'object') {
              errorMsg = 'Erro ao carregar o arquivo. Por favor, edite a mensagem e selecione o arquivo novamente.';
            }

            throw new Error(errorMsg);
          }

          console.log('[PrinChat UI] ✅ DEBUG FILE - Validation passed, sending file...');

          // Dynamic timeout: sendDelay + 150s buffer (files can be large like videos)
          const fileTimeout = (message.sendDelay || 0) + 150000;
          response = await this.requestFromContentScript({
            type: 'SEND_FILE',
            payload: {
              fileData,
              caption: message.caption || '',
              fileName: message.fileName || 'file',
              chatId,
              sendDelay: message.sendDelay
            }
          }, fileTimeout);
          break;

        default:
          console.error('[PrinChat UI] Tipo de mensagem não suportado:', message.type);
          return;
      }

      if (response && response.success) {
        console.log('[PrinChat UI] Message sent successfully');
      } else {
        throw new Error(response?.error || 'Erro ao enviar mensagem');
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[PrinChat UI] Error sending message:', errorMessage);
      throw error; // Re-throw for queue processor to handle
    }
  }

  /**
   * Create dedicated popup for message execution (SEPARATE from scripts!)
   */
  private createMessageStatusPopup() {
    // Remove existing popup
    if (this.messageStatusPopup) this.messageStatusPopup.remove();

    this.messageStatusPopup = document.createElement('div');
    this.messageStatusPopup.className = 'princhat-script-popup princhat-message-popup';
    this.messageStatusPopup.innerHTML = `
      <button class="princhat-script-popup-close">✕</button>

      <!-- Seção EM ENVIO (MENSAGENS) -->
      <div class="princhat-script-section">
        <div class="princhat-script-section-header">
          <span class="princhat-script-section-title">ENVIANDO MENSAGENS</span>
          <button class="princhat-script-btn-discrete" data-action="cancel-all-messages">Cancelar Todos</button>
        </div>
        <div class="princhat-script-section-body" data-section="running-messages"></div>
      </div>

      <!-- Seção ENVIO CONCLUÍDO (MENSAGENS) -->
      <div class="princhat-script-section">
        <div class="princhat-script-section-header">
          <span class="princhat-script-section-title">ENVIO CONCLUÍDO</span>
          <button class="princhat-script-btn-discrete" data-action="clear-all-messages">Limpar Lista</button>
        </div>
        <div class="princhat-script-section-body" data-section="completed-messages"></div>
      </div>
    `;

    // Close button
    const closeBtn = this.messageStatusPopup.querySelector('.princhat-script-popup-close');
    closeBtn?.addEventListener('click', () => this.closeMessageStatusPopup());

    // Cancel all button
    const cancelAllBtn = this.messageStatusPopup.querySelector('[data-action="cancel-all-messages"]');
    cancelAllBtn?.addEventListener('click', () => this.cancelAllMessages());

    // Clear all button
    const clearAllBtn = this.messageStatusPopup.querySelector('[data-action="clear-all-messages"]');
    clearAllBtn?.addEventListener('click', () => this.clearAllCompletedMessages());

    // Position below chat header (similar to scripts but separate)
    this.positionMessageStatusPopup();

    document.body.appendChild(this.messageStatusPopup);
  }

  /**
   * Update message popup content
   */
  private updateMessageStatusPopup() {
    if (!this.messageStatusPopup) return;

    // Update running messages section
    const runningSection = this.messageStatusPopup.querySelector('[data-section="running-messages"]');
    if (runningSection) {
      runningSection.innerHTML = '';
      const runningArray = Array.from(this.runningMessages.values()).reverse();

      runningArray.forEach((msgExec) => {
        const card = this.createMessageCard(msgExec, false);
        runningSection.appendChild(card);
      });
    }

    // Update completed messages section
    const completedSection = this.messageStatusPopup.querySelector('[data-section="completed-messages"]');
    if (completedSection) {
      completedSection.innerHTML = '';
      const completedReversed = [...this.completedMessages].reverse();

      completedReversed.forEach((msgExec) => {
        const card = this.createMessageCard(msgExec, true);
        completedSection.appendChild(card);
      });
    }
  }

  /**
   * Create message card for popup (SIMILAR to script card but adapted for messages)
   */
  private createMessageCard(msgExec: MessageExecution, isCompleted: boolean): HTMLElement {
    const card = document.createElement('div');

    // Only animate new cards, not re-rendered existing ones
    const isNewCard = !this.renderedCardIds.has(msgExec.id);
    card.className = isNewCard ? 'princhat-script-card new-card' : 'princhat-script-card';
    card.dataset.messageId = msgExec.id;

    // Mark this card as rendered
    this.renderedCardIds.add(msgExec.id);

    const photoHtml = msgExec.chatPhoto
      ? `<img src="${msgExec.chatPhoto}" alt="${msgExec.chatName}" class="princhat-script-card-photo">`
      : `<div class="princhat-script-card-photo-placeholder">${msgExec.chatName.charAt(0).toUpperCase()}</div>`;

    if (isCompleted) {
      // Card concluído (simples - igual scripts)
      card.innerHTML = `
        ${photoHtml}
        <div class="princhat-script-card-info">
          <div class="princhat-script-card-contact">${msgExec.chatName}</div>
          <div class="princhat-script-card-name">${msgExec.messagePreview}</div>
        </div>
        <div class="princhat-script-card-status">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#00a884">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          <span>enviado</span>
        </div>
        <button class="princhat-script-btn-discrete" data-action="clear-message" data-id="${msgExec.id}">Limpar</button>
      `;

      const clearBtn = card.querySelector('[data-action="clear-message"]');
      clearBtn?.addEventListener('click', () => this.clearCompletedMessage(msgExec.id));
    } else {
      // Card em execução
      // Se tem delay: mostra cronômetro e pause/play
      // Se não tem delay: só mostra "Enviando..." e cancelar
      if (msgExec.hasDelay) {
        // Check if paused
        const execution = this.messageExecutions.get(msgExec.id);
        const isPaused = execution?.isPaused || false;
        const pausePlayIcon = isPaused
          ? '<path d="M8 5v14l11-7z"/>' // Play icon
          : '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>'; // Pause icon
        const buttonClass = isPaused ? 'paused' : 'running';
        const buttonTitle = isPaused ? 'Continuar' : 'Pausar';

        card.innerHTML = `
          ${photoHtml}
          <div class="princhat-script-card-info">
            <div class="princhat-script-card-contact">${msgExec.chatName}</div>
            <div class="princhat-script-card-name">${msgExec.messagePreview}</div>
          </div>
          <div class="princhat-script-card-timer">${msgExec.elapsedSeconds}s</div>
          <button class="princhat-script-btn-icon ${buttonClass}" data-action="pause-play-message" data-id="${msgExec.id}" title="${buttonTitle}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              ${pausePlayIcon}
            </svg>
          </button>
          <button class="princhat-script-btn-discrete" data-action="cancel-message" data-id="${msgExec.id}">Cancelar</button>
        `;

        const pausePlayBtn = card.querySelector('[data-action="pause-play-message"]');
        pausePlayBtn?.addEventListener('click', () => this.togglePauseMessage(msgExec.id));

        const cancelBtn = card.querySelector('[data-action="cancel-message"]');
        cancelBtn?.addEventListener('click', () => this.cancelMessage(msgExec.id));
      } else {
        // Sem delay - layout simples
        card.innerHTML = `
          ${photoHtml}
          <div class="princhat-script-card-info">
            <div class="princhat-script-card-contact">${msgExec.chatName}</div>
            <div class="princhat-script-card-name">${msgExec.messagePreview}</div>
          </div>
          <div class="princhat-script-card-progress">Enviando...</div>
          <button class="princhat-script-btn-discrete" data-action="cancel-message" data-id="${msgExec.id}">Cancelar</button>
        `;

        const cancelBtn = card.querySelector('[data-action="cancel-message"]');
        cancelBtn?.addEventListener('click', () => this.cancelMessage(msgExec.id));
      }
    }

    return card;
  }

  private togglePauseMessage(messageId: string) {
    const msgExec = this.runningMessages.get(messageId);
    const execution = this.messageExecutions.get(messageId);

    if (!msgExec || !execution) return;

    if (execution.isPaused) {
      // Resume
      execution.isPaused = false;
      this.startMessageTimer(messageId); // Resume timer
      console.log('[PrinChat UI] Message resumed:', messageId);
    } else {
      // Pause
      execution.isPaused = true;
      this.stopMessageTimer(messageId); // Stop timer
      console.log('[PrinChat UI] Message paused:', messageId);
    }

    // Update UI
    if (this.showMessageExecutionPopup) {
      this.updateMessageStatusPopup();
    }
  }

  /**
   * Cancel individual message
   */
  private cancelMessage(messageId: string) {
    // Mark as cancelled in execution state (will stop delay loop)
    const execution = this.messageExecutions.get(messageId);
    if (execution) {
      execution.isCancelled = true;
    }

    // Stop timer and remove from Maps IMMEDIATELY to prevent recreation during animation
    this.stopMessageTimer(messageId);
    this.runningMessages.delete(messageId);
    // DON'T delete messageExecutions here - the execution loop needs to read isCancelled
    // It will be cleaned up in the execution loop after checking isCancelled

    // Remove from UI with animation
    const card = this.messageStatusPopup?.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement;
    if (card) {
      card.classList.add('removing');
      setTimeout(() => {
        this.renderedCardIds.delete(messageId);
        this.updateMessageStatusPopup();
      }, 300);
    } else {
      this.renderedCardIds.delete(messageId);
      this.updateMessageStatusPopup();
    }
    console.log('[PrinChat UI] Message cancelled:', messageId);
  }

  /**
   * Cancel all running messages
   */
  private cancelAllMessages() {
    this.runningMessages.forEach((_, messageId) => {
      this.cancelMessage(messageId);
    });
    console.log('[PrinChat UI] All messages cancelled');
  }

  /**
   * Clear individual completed message
   */
  private clearCompletedMessage(messageId: string) {
    // Remove from array IMMEDIATELY to prevent recreation during animation
    this.completedMessages = this.completedMessages.filter(m => m.id !== messageId);

    const card = this.messageStatusPopup?.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement;
    if (card) {
      card.classList.add('removing');
      setTimeout(() => {
        this.renderedCardIds.delete(messageId);
        this.updateMessageStatusPopup();
      }, 300);
    } else {
      this.renderedCardIds.delete(messageId);
      this.updateMessageStatusPopup();
    }
    console.log('[PrinChat UI] Completed message cleared:', messageId);
  }

  /**
   * Clear all completed messages
   */
  private clearAllCompletedMessages() {
    const completedSection = this.messageStatusPopup?.querySelector('[data-section="completed-messages"]');
    const cards = completedSection?.querySelectorAll('.princhat-script-card') || [];

    if (cards.length > 0) {
      cards.forEach(card => card.classList.add('removing'));
      setTimeout(() => {
        this.completedMessages.forEach(m => this.renderedCardIds.delete(m.id));
        this.completedMessages = [];
        this.updateMessageStatusPopup();
      }, 300);
    } else {
      this.completedMessages.forEach(m => this.renderedCardIds.delete(m.id));
      this.completedMessages = [];
      this.updateMessageStatusPopup();
    }
    console.log('[PrinChat UI] All completed messages cleared');
  }

  /**
   * Position message popup (similar to script popup but wider)
   */
  private positionMessageStatusPopup() {
    if (!this.messageStatusPopup) return;

    const scriptPopupIsOpen = this.statusPopup && document.body.contains(this.statusPopup);
    const chatHeader = document.querySelector('#main header');

    if (scriptPopupIsOpen && chatHeader) {
      // Script popup is open: position message popup below it
      // Use chat header for LEFT calculation to ensure perfect alignment
      const chatHeaderRect = chatHeader.getBoundingClientRect();
      const scriptPopupRect = this.statusPopup!.getBoundingClientRect();

      const top = scriptPopupRect.bottom + 8; // 8px gap below script popup
      const left = chatHeaderRect.left + 8; // Same left calculation as script popup
      const right = left + 420; // popup width

      // Calculate available space below script popup to prevent overlap
      const availableSpace = window.innerHeight - top - 20; // 20px bottom margin
      const maxHeight = Math.min(500, Math.max(150, availableSpace)); // Between 150px and 500px

      console.log('[PrinChat UI] Positioning message popup below script popup:', {
        top,
        left,
        availableSpace,
        maxHeight,
        scriptPopupBottom: scriptPopupRect.bottom,
        scriptPopupHeight: scriptPopupRect.height
      });

      this.messageStatusPopup.style.position = 'fixed';
      this.messageStatusPopup.style.top = `${top}px`;
      this.messageStatusPopup.style.left = `${left}px`;
      this.messageStatusPopup.style.width = '420px';
      this.messageStatusPopup.style.maxHeight = `${maxHeight}px`;
      this.messageStatusPopup.style.zIndex = '1003'; // Above script popup (1002)

      // Set CSS custom properties for close button positioning
      this.messageStatusPopup.style.setProperty('--popup-top', `${top}px`);
      this.messageStatusPopup.style.setProperty('--popup-right', `${right}px`);
    } else if (chatHeader) {
      // Script popup is NOT open: allow popup to grow more
      const rect = chatHeader.getBoundingClientRect();
      const top = rect.bottom + 8; // 8px gap below header
      const left = rect.left + 8; // 8px from left edge
      const right = left + 420; // popup width

      const availableSpace = window.innerHeight - top - 20;
      const maxHeight = Math.min(500, Math.max(200, availableSpace)); // Up to 500px

      console.log('[PrinChat UI] Positioning message popup (script not open):', { top, left, maxHeight, availableSpace });

      this.messageStatusPopup.style.position = 'fixed';
      this.messageStatusPopup.style.top = `${top}px`;
      this.messageStatusPopup.style.left = `${left}px`;
      this.messageStatusPopup.style.width = '420px';
      this.messageStatusPopup.style.maxHeight = `${maxHeight}px`;
      this.messageStatusPopup.style.zIndex = '1003'; // Above script popup (1002)

      // Set CSS custom properties for close button positioning
      this.messageStatusPopup.style.setProperty('--popup-top', `${top}px`);
      this.messageStatusPopup.style.setProperty('--popup-right', `${right}px`);
    } else {
      // Fallback position
      this.messageStatusPopup.style.position = 'fixed';
      this.messageStatusPopup.style.top = '80px';
      this.messageStatusPopup.style.left = '24px';
      this.messageStatusPopup.style.width = '420px';
      this.messageStatusPopup.style.maxHeight = '500px';
      this.messageStatusPopup.style.zIndex = '1003'; // Above script popup (1002)

      // Set CSS custom properties for close button positioning
      this.messageStatusPopup.style.setProperty('--popup-top', '80px');
      this.messageStatusPopup.style.setProperty('--popup-right', '444px');
    }
  }

  /**
   * Close message popup
   */
  private closeMessageStatusPopup() {
    if (this.messageStatusPopup) {
      this.messageStatusPopup.remove();
      this.messageStatusPopup = null;
    }
  }

  private async executeScript(script: Script) {
    const scriptId = `script-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // NOTE: Do NOT dispatch PrinChatScriptStart here!
      // The content script (executeScriptWithSteps) will dispatch it to avoid duplication

      // Get active chat using cache for performance
      console.log('[PrinChat UI] Getting active chat for script execution...');
      const chatId = await this.getActiveChatId();

      if (!chatId) {
        throw new Error('Nenhum chat ativo selecionado');
      }

      console.log('[PrinChat UI] Active chat:', chatId);

      // Build full steps with message data
      // Steps from database have { messageId, delayAfter }
      // Need to transform to { message: {...}, delayAfter }
      console.log('[PrinChat UI] Loading message data for steps...');
      console.log('[PrinChat UI] Script has', script.steps.length, 'steps');
      console.log('[PrinChat UI] Available messages:', this.messages.length);

      // If no messages loaded, try to reload data first
      if (this.messages.length === 0) {
        console.log('[PrinChat UI] ⚠️ No messages loaded, attempting to reload data...');
        await this.loadData();
        console.log('[PrinChat UI] After reload: Available messages:', this.messages.length);
      }

      const fullSteps = await Promise.all(script.steps.map(async (step) => {
        const messageId = (step as any).messageId;
        const message = this.messages.find(m => m.id === messageId);

        if (!message) {
          console.error('[PrinChat UI] ❌ Message not found!');
          console.error('[PrinChat UI] Looking for message ID:', messageId);
          console.error('[PrinChat UI] Available message IDs:', this.messages.map(m => m.id));
          throw new Error(`Message ${messageId} not found. Recarregue a página do WhatsApp Web.`);
        }

        // Convert Blobs to base64
        let imageData = message.imageData;
        if (imageData instanceof Blob) {
          imageData = await this.blobToBase64(imageData);
        }

        let videoData = message.videoData;
        if (videoData instanceof Blob) {
          videoData = await this.blobToBase64(videoData);
        }

        let audioData = message.audioData;
        if (audioData instanceof Blob) {
          audioData = await this.blobToBase64(audioData);
        }

        let fileData = message.fileData;
        if (fileData instanceof Blob) {
          fileData = await this.blobToBase64(fileData);
        }

        return {
          message: {
            type: message.type,
            content: message.content,
            caption: message.caption,
            audioData,
            duration: message.duration,
            imageData,
            videoData,
            fileData,
            fileName: message.fileName
          },
          delayAfter: (step as any).delayAfter
        };
      }));

      // Execute script via content script
      // Use a very long timeout for script execution to support pause/resume functionality
      // Scripts can be paused indefinitely by the user, so a short timeout would cause false errors
      // Each individual message already has its own timeout (90s-150s depending on type)
      // User can manually cancel if needed via the UI controls
      console.log('[PrinChat UI] Executing script with', fullSteps.length, 'steps');
      const response = await this.requestFromContentScript({
        type: 'EXECUTE_SCRIPT',
        payload: {
          scriptId: scriptId, // Include scriptId for progress tracking
          steps: fullSteps,
          chatId: chatId,
          scriptName: script.name
        }
      }, 24 * 60 * 60 * 1000); // 24 hours timeout (effectively infinite for user-controlled scripts)

      // NOTE: Do NOT dispatch PrinChatScriptComplete here!
      // The content script (executeScriptWithSteps) already dispatches it
      // Dispatching here would create duplicate cards in the completed section

      if (!response || !response.success) {
        // Check if this is a user cancellation (not an error)
        if (response?.error === 'Script cancelled by user') {
          console.log('[PrinChat UI] Script cancelled by user');
          return; // Exit silently - cancellation is not an error
        }

        // Check if this is a timeout
        if (response?.isTimeout) {
          const timeoutError = 'Script execution timeout. The script may be too large or WhatsApp is not responding.';
          console.warn('[PrinChat UI] Script timeout:', response.error);
          document.dispatchEvent(new CustomEvent('PrinChatScriptError', {
            detail: { scriptId, error: timeoutError }
          }));
          return; // Exit without throwing - timeout is logged as warning
        }

        throw new Error(response?.error || 'Erro ao executar script');
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[PrinChat UI] Error executing script:', errorMessage, error);

      // Only dispatch error if script hasn't started yet (no card created)
      // If script is running, executeScriptWithSteps will dispatch the error
      document.dispatchEvent(new CustomEvent('PrinChatScriptError', {
        detail: { scriptId, error: errorMessage }
      }));
    }
  }

  // FAB methods commented out - not used in new design
  // private createFAB(text: string) {
  //   if (this.fab) this.fab.remove();
  //   this.fab = document.createElement('div');
  //   this.fab.className = 'princhat-fab';
  //   this.fab.innerHTML = `
  //     <svg class="princhat-fab-icon" viewBox="0 0 24 24" fill="currentColor">
  //       <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
  //     </svg>
  //     <span>${text}</span>
  //   `;
  //   document.body.appendChild(this.fab);
  // }
  //
  // private updateFAB(text: string) {
  //   if (!this.fab) return;
  //   const span = this.fab.querySelector('span');
  //   if (span) span.textContent = text;
  // }
  //
  // private closeFAB() {
  //   if (this.fab) {
  //     this.fab.style.animation = 'princhat-slide-out 0.3s ease';
  //     setTimeout(() => {
  //       if (this.fab) this.fab.remove();
  //       this.fab = null;
  //     }, 300);
  //   }
  // }

  private setupScriptPopupObserver() {
    if (!this.statusPopup) return;

    // Disconnect existing observer if any
    if (this.scriptPopupObserver) {
      this.scriptPopupObserver.disconnect();
    }

    // Create new observer to watch for changes in popup content
    this.scriptPopupObserver = new MutationObserver(() => {
      // Popup content changed (cards added/removed)
      // Update max-height and reposition message popup
      this.updateScriptPopupMaxHeight();

      if (this.messageStatusPopup && document.body.contains(this.messageStatusPopup)) {
        this.positionMessageStatusPopup();
      }
    });

    // Observe the popup for child changes (cards being added/removed)
    this.scriptPopupObserver.observe(this.statusPopup, {
      childList: true,
      subtree: true
    });
  }

  private updateScriptPopupMaxHeight() {
    if (!this.statusPopup) return;

    const chatHeader = document.querySelector('#main header');
    if (chatHeader) {
      const rect = chatHeader.getBoundingClientRect();
      const top = rect.bottom + 8;

      // Calculate available space for script popup
      const availableSpace = window.innerHeight - top - 20;

      // Allow popup to grow up to 500px or available space
      const maxHeight = Math.min(500, Math.max(200, availableSpace));

      this.statusPopup.style.maxHeight = `${maxHeight}px`;
    } else {
      this.statusPopup.style.maxHeight = '500px';
    }
  }

  private positionStatusPopup() {
    if (!this.statusPopup) return;

    // Find WhatsApp chat header
    const chatHeader = document.querySelector('#main header');
    if (chatHeader) {
      const rect = chatHeader.getBoundingClientRect();
      const top = rect.bottom + 8; // 8px gap below header
      const left = rect.left + 8; // 8px from left edge
      const right = left + 420; // popup width

      this.statusPopup.style.position = 'fixed';
      this.statusPopup.style.top = `${top}px`;
      this.statusPopup.style.left = `${left}px`;

      // Set CSS custom properties for close button positioning
      this.statusPopup.style.setProperty('--popup-top', `${top}px`);
      this.statusPopup.style.setProperty('--popup-right', `${right}px`);
    } else {
      // Fallback position
      this.statusPopup.style.position = 'fixed';
      this.statusPopup.style.top = '80px';
      this.statusPopup.style.left = '24px';

      // Set CSS custom properties for close button positioning
      this.statusPopup.style.setProperty('--popup-top', '80px');
      this.statusPopup.style.setProperty('--popup-right', '444px');
    }
  }

  private getChatPhoto(): string | undefined {
    console.log('[PrinChat UI] Getting chat photo from DOM...');

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
        console.log('[PrinChat UI] Found chat photo from selector:', selector, '→', img.src);
        return img.src;
      }
    }

    console.log('[PrinChat UI] No chat photo found in DOM');
    return undefined;
  }

  private createStatusPopup() {
    // Remove existing popup
    if (this.statusPopup) this.statusPopup.remove();

    this.statusPopup = document.createElement('div');
    this.statusPopup.className = 'princhat-script-popup';
    this.statusPopup.innerHTML = `
      <button class="princhat-script-popup-close">✕</button>

      <!-- Seção EM ENVIO -->
      <div class="princhat-script-section">
        <div class="princhat-script-section-header">
          <span class="princhat-script-section-title">EM ENVIO (SCRIPTS/GATILHOS)</span>
          <button class="princhat-script-btn-discrete" data-action="cancel-all">Cancelar Todos</button>
        </div>
        <div class="princhat-script-section-body" data-section="running"></div>
      </div>

      <!-- Seção ENVIO CONCLUÍDO -->
      <div class="princhat-script-section">
        <div class="princhat-script-section-header">
          <span class="princhat-script-section-title">ENVIO CONCLUÍDO</span>
          <button class="princhat-script-btn-discrete" data-action="clear-all">Limpar Lista</button>
        </div>
        <div class="princhat-script-section-body" data-section="completed"></div>
      </div>
    `;

    // Close button
    const closeBtn = this.statusPopup.querySelector('.princhat-script-popup-close');
    closeBtn?.addEventListener('click', () => this.closeStatusPopup());

    // Cancel all button
    const cancelAllBtn = this.statusPopup.querySelector('[data-action="cancel-all"]');
    cancelAllBtn?.addEventListener('click', () => this.cancelAllScripts());

    // Clear all button
    const clearAllBtn = this.statusPopup.querySelector('[data-action="clear-all"]');
    clearAllBtn?.addEventListener('click', () => this.clearAllCompleted());

    // Position below chat header
    this.positionStatusPopup();

    document.body.appendChild(this.statusPopup);

    // Setup observer to detect when popup grows (cards added)
    this.setupScriptPopupObserver();

    // Control max-height dynamically
    this.updateScriptPopupMaxHeight();

    // Reposition message popup if it's already open (animate down smoothly)
    if (this.messageStatusPopup && document.body.contains(this.messageStatusPopup)) {
      this.positionMessageStatusPopup();
    }
  }

  // Not used in new design
  // private updateStatusPopupTitle(title: string) {
  //   if (!this.statusPopup) return;
  //   const titleEl = this.statusPopup.querySelector('.princhat-status-title');
  //   if (titleEl) titleEl.textContent = title;
  // }

  private updateStatusPopup() {
    if (!this.statusPopup) return;

    // Update running scripts section
    const runningSection = this.statusPopup.querySelector('[data-section="running"]');
    if (runningSection) {
      runningSection.innerHTML = '';
      // Convert Map to array and REVERSE to show newest first (at top)
      const runningArray = Array.from(this.runningScripts.values()).reverse();
      runningArray.forEach((scriptExec) => {
        const card = this.createScriptCard(scriptExec, false);
        runningSection.appendChild(card);
      });
    }

    // Update completed scripts section
    const completedSection = this.statusPopup.querySelector('[data-section="completed"]');
    if (completedSection) {
      completedSection.innerHTML = '';
      // Show newest completed first (at top)
      const completedReversed = [...this.completedScripts].reverse();
      completedReversed.forEach((scriptExec) => {
        const card = this.createScriptCard(scriptExec, true);
        completedSection.appendChild(card);
      });
    }
  }

  private createScriptCard(scriptExec: ScriptExecution, isCompleted: boolean): HTMLElement {
    const card = document.createElement('div');

    // Only animate new cards, not re-rendered existing ones
    const isNewCard = !this.renderedCardIds.has(scriptExec.id);
    card.className = isNewCard ? 'princhat-script-card new-card' : 'princhat-script-card';
    card.dataset.scriptId = scriptExec.id;

    // Mark this card as rendered
    this.renderedCardIds.add(scriptExec.id);

    const photoHtml = scriptExec.chatPhoto
      ? `<img src="${scriptExec.chatPhoto}" alt="${scriptExec.chatName}" class="princhat-script-card-photo">`
      : `<div class="princhat-script-card-photo-placeholder">${scriptExec.chatName.charAt(0).toUpperCase()}</div>`;

    const progress = `${scriptExec.completedSteps}/${scriptExec.totalSteps}`;

    if (isCompleted) {
      // Card concluído
      card.innerHTML = `
        ${photoHtml}
        <div class="princhat-script-card-info">
          <div class="princhat-script-card-contact">${scriptExec.chatName}</div>
          <div class="princhat-script-card-name">★ ${scriptExec.scriptName}</div>
        </div>
        <div class="princhat-script-card-progress">${progress}</div>
        <div class="princhat-script-card-status">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#00a884">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          <span>enviado</span>
        </div>
        <button class="princhat-script-btn-discrete" data-action="clear" data-id="${scriptExec.id}">Limpar</button>
      `;

      const clearBtn = card.querySelector('[data-action="clear"]');
      clearBtn?.addEventListener('click', () => this.clearCompletedScript(scriptExec.id));
    } else {
      // Card em execução
      const isPaused = scriptExec.status === 'paused';
      const pausePlayIcon = isPaused
        ? '<path d="M8 5v14l11-7z"/>' // Play icon
        : '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>'; // Pause icon
      const buttonClass = isPaused ? 'paused' : 'running';

      card.innerHTML = `
        ${photoHtml}
        <div class="princhat-script-card-info">
          <div class="princhat-script-card-contact">${scriptExec.chatName}</div>
          <div class="princhat-script-card-name">★ ${scriptExec.scriptName}</div>
        </div>
        <div class="princhat-script-card-progress">${progress}</div>
        <div class="princhat-script-card-timer">${scriptExec.elapsedSeconds}s</div>
        <button class="princhat-script-btn-icon ${buttonClass}" data-action="pause-play" data-id="${scriptExec.id}" title="${isPaused ? 'Continuar' : 'Pausar'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            ${pausePlayIcon}
          </svg>
        </button>
        <button class="princhat-script-btn-discrete" data-action="cancel" data-id="${scriptExec.id}">Cancelar</button>
      `;

      const pausePlayBtn = card.querySelector('[data-action="pause-play"]');
      pausePlayBtn?.addEventListener('click', () => this.togglePauseScript(scriptExec.id));

      const cancelBtn = card.querySelector('[data-action="cancel"]');
      cancelBtn?.addEventListener('click', () => this.cancelScript(scriptExec.id));
    }

    return card;
  }

  private togglePauseScript(scriptId: string) {
    const scriptExec = this.runningScripts.get(scriptId);
    if (!scriptExec) return;

    if (scriptExec.status === 'running') {
      scriptExec.status = 'paused';
      this.stopScriptTimer(scriptId);
      console.log('[PrinChat UI] Script paused:', scriptId);

      // Dispatch event to pause script execution in content script
      document.dispatchEvent(new CustomEvent('PrinChatPauseScript', {
        detail: { scriptId }
      }));
    } else if (scriptExec.status === 'paused') {
      scriptExec.status = 'running';
      this.startScriptTimer(scriptId);
      console.log('[PrinChat UI] Script resumed:', scriptId);

      // Dispatch event to resume script execution in content script
      document.dispatchEvent(new CustomEvent('PrinChatResumeScript', {
        detail: { scriptId }
      }));
    }

    this.updateStatusPopup();
  }

  private cancelScript(scriptId: string) {
    const scriptExec = this.runningScripts.get(scriptId);
    if (!scriptExec) return;

    // Stop timer and remove from Map IMMEDIATELY to prevent recreation during animation
    this.stopScriptTimer(scriptId);
    this.runningScripts.delete(scriptId);

    // Find the card element and animate it out
    const card = this.statusPopup?.querySelector(`[data-script-id="${scriptId}"]`) as HTMLElement;
    if (card) {
      card.classList.add('removing');
      // Wait for animation to complete before updating UI
      setTimeout(() => {
        this.renderedCardIds.delete(scriptId); // Remove from rendered set so it can animate again if re-added
        this.updateStatusPopup();
      }, 300); // Match animation duration in CSS (0.3s)
    } else {
      // If card not found, remove immediately
      this.renderedCardIds.delete(scriptId);
      this.updateStatusPopup();
    }

    // Dispatch event to cancel script execution in content script
    document.dispatchEvent(new CustomEvent('PrinChatCancelScript', {
      detail: { scriptId }
    }));

    console.log('[PrinChat UI] Script cancelled:', scriptId);
  }

  private cancelAllScripts() {
    this.runningScripts.forEach((_, scriptId) => {
      this.cancelScript(scriptId);
    });
    console.log('[PrinChat UI] All scripts cancelled');
  }

  private clearCompletedScript(scriptId: string) {
    // Remove from array IMMEDIATELY to prevent recreation during animation
    this.completedScripts = this.completedScripts.filter(s => s.id !== scriptId);

    // Find the card element and animate it out
    const card = this.statusPopup?.querySelector(`[data-script-id="${scriptId}"]`) as HTMLElement;
    if (card) {
      card.classList.add('removing');
      // Wait for animation to complete before updating UI
      setTimeout(() => {
        this.renderedCardIds.delete(scriptId); // Remove from rendered set so it can animate again if re-added
        this.updateStatusPopup();
      }, 300); // Match animation duration in CSS (0.3s)
    } else {
      // If card not found, remove immediately
      this.renderedCardIds.delete(scriptId);
      this.updateStatusPopup();
    }
    console.log('[PrinChat UI] Completed script cleared:', scriptId);
  }

  private clearAllCompleted() {
    // Find all completed cards and animate them out
    const completedSection = this.statusPopup?.querySelector('[data-section="completed"]');
    const cards = completedSection?.querySelectorAll('.princhat-script-card') || [];

    if (cards.length > 0) {
      // Add removing class to all cards
      cards.forEach(card => card.classList.add('removing'));

      // Wait for animation to complete before removing
      setTimeout(() => {
        this.completedScripts.forEach(s => this.renderedCardIds.delete(s.id));
        this.completedScripts = [];
        this.updateStatusPopup();
      }, 300); // Match animation duration in CSS (0.3s)
    } else {
      // If no cards found, remove immediately
      this.completedScripts.forEach(s => this.renderedCardIds.delete(s.id));
      this.completedScripts = [];
      this.updateStatusPopup();
    }
    console.log('[PrinChat UI] All completed scripts cleared');
  }

  private startScriptTimer(scriptId: string) {
    // Clear existing timer if any
    this.stopScriptTimer(scriptId);

    const timer = setInterval(() => {
      const scriptExec = this.runningScripts.get(scriptId);
      if (scriptExec && scriptExec.status === 'running') {
        scriptExec.elapsedSeconds++;
        // Update only the timer element to avoid re-rendering everything
        const card = this.statusPopup?.querySelector(`[data-script-id="${scriptId}"]`);
        const timerEl = card?.querySelector('.princhat-script-card-timer');
        if (timerEl) {
          timerEl.textContent = `${scriptExec.elapsedSeconds}s`;
        }
      }
    }, 1000);

    this.scriptTimers.set(scriptId, timer);
  }

  private stopScriptTimer(scriptId: string) {
    const timer = this.scriptTimers.get(scriptId);
    if (timer) {
      clearInterval(timer);
      this.scriptTimers.delete(scriptId);
    }
  }

  private moveToCompleted(scriptId: string) {
    const scriptExec = this.runningScripts.get(scriptId);
    if (!scriptExec) {
      console.log('[PrinChat UI] Script not found in running scripts:', scriptId);
      return;
    }

    // Don't move paused scripts to completed
    if (scriptExec.status === 'paused') {
      console.log('[PrinChat UI] Script is paused, not moving to completed:', scriptId);
      return;
    }

    this.stopScriptTimer(scriptId);

    // Find the card in running section and animate it out
    const card = this.statusPopup?.querySelector(`[data-script-id="${scriptId}"]`) as HTMLElement;
    if (card) {
      card.classList.add('removing');
      // Wait for exit animation, then move to completed section
      setTimeout(() => {
        scriptExec.status = 'completed';
        this.completedScripts.push(scriptExec);
        this.runningScripts.delete(scriptId);
        // Remove from rendered set so it animates as new card in completed section
        this.renderedCardIds.delete(scriptId);
        this.updateStatusPopup();
        console.log('[PrinChat UI] Script moved to completed:', scriptId);
      }, 300); // Match animation duration (0.3s)
    } else {
      // If card not found, move immediately
      scriptExec.status = 'completed';
      this.completedScripts.push(scriptExec);
      this.runningScripts.delete(scriptId);
      this.renderedCardIds.delete(scriptId);
      this.updateStatusPopup();
      console.log('[PrinChat UI] Script moved to completed:', scriptId);
    }
  }

  // Not used in new design
  // private getStatusIcon(status: 'sending' | 'success' | 'error'): string {
  //   const icons = {
  //     sending: '<svg class="princhat-status-icon sending" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8Z"/></svg>',
  //     success: '<svg class="princhat-status-icon success" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  //     error: '<svg class="princhat-status-icon error" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>'
  //   };
  //   return icons[status];
  // }

  private closeStatusPopup() {
    if (this.statusPopup) {
      this.statusPopup.classList.add('closing');
      setTimeout(() => {
        if (this.statusPopup) this.statusPopup.remove();
        this.statusPopup = null;
      }, 300);
    }
  }

  private createCustomHeader() {
    console.log('[PrinChat UI] Creating custom header...');

    // Remove existing header if any
    const existing = document.querySelector('.princhat-custom-header');
    if (existing) {
      console.log('[PrinChat UI] Removing existing custom header');
      existing.remove();
    }

    // Create header container
    this.customHeader = document.createElement('div');
    this.customHeader.className = 'princhat-custom-header';

    // Left section with logo
    const leftSection = document.createElement('div');
    leftSection.className = 'princhat-header-left';

    // Get logo URL from marker (set by content script which has access to chrome.runtime)
    const marker = document.getElementById('PrinChatInjected');
    const logoUrl = marker?.getAttribute('data-logo-url');

    if (logoUrl) {
      const logo = document.createElement('img');
      logo.className = 'princhat-header-logo';
      logo.src = logoUrl;
      logo.alt = 'PrinChat';
      leftSection.appendChild(logo);
    } else {
      console.warn('[PrinChat UI] Logo URL not found in marker, skipping logo');
    }

    // Right section with icons
    const rightSection = document.createElement('div');
    rightSection.className = 'princhat-header-right';

    // Icon buttons configuration (lucide-react icons)
    const iconButtons = [
      {
        name: 'messages',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        tooltip: 'Mensagens'
      },
      {
        name: 'refresh',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
        tooltip: 'Atualizar'
      },
      {
        name: 'calendar',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
        tooltip: 'Calendário'
      },
      {
        name: 'new-message',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" x2="15" y1="10" y2="10"/><line x1="12" x2="12" y1="7" y2="13"/></svg>',
        tooltip: 'Nova Mensagem'
      },
      {
        name: 'edit',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
        tooltip: 'Editar'
      },
      {
        name: 'help',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
        tooltip: 'Ajuda'
      },
      {
        name: 'notifications',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
        tooltip: 'Notificações'
      }
    ];

    // Create icon buttons
    iconButtons.forEach(icon => {
      const button = document.createElement('button');
      button.className = 'princhat-header-icon-btn';
      button.innerHTML = icon.svg;
      button.title = icon.tooltip;
      button.dataset.action = icon.name;

      // Add click handler
      button.addEventListener('click', () => {
        console.log(`[PrinChat UI] Header icon clicked: ${icon.name}`);

        // Handle different actions
        if (icon.name === 'messages') {
          chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS_PAGE', tab: 'messages' });
        } else if (icon.name === 'notifications') {
          console.log(`[PrinChat UI] Notifications clicked - to be implemented`);
          // TODO: Show notifications popup
        } else {
          console.log(`[PrinChat UI] Action not implemented yet: ${icon.name}`);
        }
      });

      rightSection.appendChild(button);
    });

    // Add user profile button
    const profileBtn = document.createElement('button');
    profileBtn.className = 'princhat-header-profile-btn';
    profileBtn.title = 'Perfil';

    // Create profile image
    const profileImg = document.createElement('div');
    profileImg.className = 'princhat-header-profile-img';

    // Try to get user's WhatsApp profile photo from sidebar
    const getUserPhoto = () => {
      // Try to find user's profile photo in WhatsApp's sidebar header (left side)
      const selectors = [
        'div[data-testid="default-user"] img',
        'header div[role="button"] img[src*="https://"]',
        'header div[role="button"] img[src*="blob:"]',
        'div._aou8 img',  // WhatsApp header avatar class
        'header img[alt]'
      ];

      for (const selector of selectors) {
        try {
          const img = document.querySelector(selector) as HTMLImageElement;
          if (img && img.src && (img.src.startsWith('https://') || img.src.startsWith('blob:'))) {
            console.log('[PrinChat UI] Found user profile photo:', img.src);
            return img.src;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }

      console.log('[PrinChat UI] User profile photo not found, using placeholder');
      return null;
    };

    const photoUrl = getUserPhoto();
    if (photoUrl) {
      // Use actual WhatsApp profile photo
      const img = document.createElement('img');
      img.src = photoUrl;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      profileImg.appendChild(img);
    } else {
      // Use placeholder icon
      profileImg.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    }

    profileBtn.appendChild(profileImg);
    profileBtn.addEventListener('click', () => {
      console.log('[PrinChat UI] Profile clicked');
      chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS_PAGE', tab: 'settings' });
    });

    rightSection.appendChild(profileBtn);

    // Assemble header
    this.customHeader.appendChild(leftSection);
    this.customHeader.appendChild(rightSection);

    // Find WhatsApp #app container and inject header as first child
    const appContainer = document.querySelector('#app');
    if (appContainer && appContainer.firstChild) {
      console.log('[PrinChat UI] Found #app container, injecting header as first child');
      appContainer.insertBefore(this.customHeader, appContainer.firstChild);
      document.body.classList.add('princhat-header-active');
      console.log('[PrinChat UI] Custom header injected inside #app');
    } else {
      console.warn('[PrinChat UI] #app container not found, injecting at body start');
      document.body.insertBefore(this.customHeader, document.body.firstChild);
      document.body.classList.add('princhat-header-active');
      console.log('[PrinChat UI] Custom header injected at body start (fallback)');
    }
  }

  private createTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'princhat-tooltip';
    this.tooltip.style.display = 'none';
    document.body.appendChild(this.tooltip);
  }

  private showTooltip(text: string, target: HTMLElement) {
    if (!this.tooltip) return;

    this.tooltip.textContent = text;
    this.tooltip.style.display = 'block';

    const rect = target.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();

    this.tooltip.style.left = `${rect.left + (rect.width / 2) - (tooltipRect.width / 2)}px`;
    this.tooltip.style.top = `${rect.top - tooltipRect.height - 8}px`;
  }

  private hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
  }

  private updateShortcutBarVisibility() {
    // Check if shortcut bar exists in DOM, if not recreate it
    const barInDOM = document.querySelector('.princhat-shortcut-bar');
    if (!barInDOM && this.shortcutBar) {
      console.log('[PrinChat UI] Shortcut bar was removed from DOM, recreating...');
      this.ensureShortcutBarInDOM();
    }

    const main = document.querySelector('#main');
    const hasActiveChat = main && main.querySelector('[data-tab]');
    const shouldShowShortcuts = hasActiveChat && this.showShortcuts;
    const currentValue = document.body.getAttribute('data-princhat-chat-active');
    const newValue = shouldShowShortcuts ? 'true' : 'false';

    // Detect chat changes and invalidate cache
    const currentChatElement = main?.querySelector('[data-tab]');
    if (currentChatElement && currentChatElement !== this.lastKnownChatElement) {
      console.log('[PrinChat UI] Chat changed detected, invalidating cache');
      this.invalidateChatCache();
      this.lastKnownChatElement = currentChatElement;
    } else if (!currentChatElement && this.lastKnownChatElement) {
      // Chat closed
      console.log('[PrinChat UI] Chat closed, invalidating cache');
      this.invalidateChatCache();
      this.lastKnownChatElement = null;
    }

    if (currentValue !== newValue) {
      console.log('[PrinChat UI] Updating shortcut bar visibility:', newValue);
      document.body.setAttribute('data-princhat-chat-active', newValue);
    }
  }

  private ensureShortcutBarInDOM() {
    if (!this.shortcutBar) return;

    // Try to find WhatsApp footer and insert shortcut bar inside it
    const footer = document.querySelector('#main footer');
    if (footer && !footer.contains(this.shortcutBar)) {
      console.log('[PrinChat UI] Reinserting shortcut bar into footer');
      footer.appendChild(this.shortcutBar);
    }
  }

  private monitorChatChanges() {
    // Check initially
    this.updateShortcutBarVisibility();

    // Monitor changes more frequently to catch footer recreation
    const observer = new MutationObserver(() => {
      this.updateShortcutBarVisibility();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  private listenForExecutionEvents() {
    // Listen for script start (triggered when script is executed from anywhere)
    document.addEventListener('PrinChatScriptStart', async (event: any) => {
      const { scriptName, totalSteps, scriptId, targetChatId, targetChatName, targetChatPhoto } = event.detail;
      console.log('[PrinChat UI] Script started:', scriptName, 'with', totalSteps, 'steps');

      // Determine which chat to show
      let chatName: string;
      let chatPhoto: string | undefined;

      if (targetChatName) {
        // Use provided target chat info (from trigger or specific execution)
        chatName = targetChatName;
        chatPhoto = targetChatPhoto; // Use photo from trigger/execution
        console.log('[PrinChat UI] Using target chat:', chatName, 'ID:', targetChatId, 'Photo:', !!chatPhoto);
      } else {
        // Get active chat info (for popup manual execution) with extended timeout
        const chatResponse = await this.requestFromContentScript({ type: 'GET_ACTIVE_CHAT' }, 15000);
        chatName = chatResponse?.data?.chatName || 'Chat';
        chatPhoto = chatResponse?.data?.chatPhoto || this.getChatPhoto();
        console.log('[PrinChat UI] Using active chat:', chatName);
      }

      // Create script execution object
      const scriptExecution: ScriptExecution = {
        id: scriptId || `script-${Date.now()}`,
        scriptName,
        chatName,
        chatPhoto,
        totalSteps,
        completedSteps: 0,
        status: 'running',
        startTime: Date.now(),
        elapsedSeconds: 0
      };

      // ALWAYS track script execution (even if popup is disabled)
      this.runningScripts.set(scriptExecution.id, scriptExecution);
      this.startScriptTimer(scriptExecution.id);

      // Only create/show popup if enabled in settings
      if (this.showScriptExecutionPopup) {
        // Create popup if not exists
        if (!this.statusPopup) {
          this.createStatusPopup();
        }

        this.updateStatusPopup();
      } else {
        console.log('[PrinChat UI] Script execution popup is disabled in settings');
      }
    });

    // Listen for script progress
    document.addEventListener('PrinChatScriptProgress', (event: any) => {
      const { scriptId, step, status } = event.detail;
      console.log('[PrinChat UI] Script progress - scriptId:', scriptId, 'step:', step, 'status:', status);

      const scriptExec = this.runningScripts.get(scriptId);
      if (!scriptExec) return;

      if (status === 'success') {
        scriptExec.completedSteps = step;
        // Only update popup if enabled
        if (this.showScriptExecutionPopup) {
          this.updateStatusPopup();
        }
      }
    });

    // Listen for script completion
    document.addEventListener('PrinChatScriptComplete', (event: any) => {
      const { scriptId, success } = event.detail;
      console.log('[PrinChat UI] Script completed:', scriptId, success);

      if (success) {
        this.moveToCompleted(scriptId);
      }
    });

    // Listen for script errors
    document.addEventListener('PrinChatScriptError', (event: any) => {
      const { scriptId, error } = event.detail;
      console.log('[PrinChat UI] Script error:', scriptId, error);

      const scriptExec = this.runningScripts.get(scriptId);
      if (scriptExec) {
        scriptExec.status = 'error';
        scriptExec.error = error;
        this.stopScriptTimer(scriptId);
        // Only update popup if enabled
        if (this.showScriptExecutionPopup) {
          this.updateStatusPopup();
        }
      }
    });

    // Listen for message start (SAME logic as scripts)
    document.addEventListener('PrinChatMessageStart', (event: any) => {
      const { messageId, messagePreview, messageType, chatName, chatPhoto, hasDelay, sendDelay } = event.detail;
      console.log('[PrinChat UI] Message started:', messagePreview);

      // Create message execution object
      const messageExecution: MessageExecution = {
        id: messageId,
        messagePreview,
        messageType,
        chatName,
        chatPhoto,
        status: 'sending',
        startTime: Date.now(),
        elapsedSeconds: 0,
        hasDelay,
        sendDelay
      };

      // ALWAYS track message execution (even if popup disabled)
      this.runningMessages.set(messageExecution.id, messageExecution);

      // Start timer if message has delay
      if (hasDelay) {
        this.startMessageTimer(messageExecution.id);
      }

      // Only create/show popup if enabled in settings
      if (this.showMessageExecutionPopup) {
        if (!this.messageStatusPopup) {
          this.createMessageStatusPopup();
        }
        this.updateMessageStatusPopup();
      } else {
        console.log('[PrinChat UI] Message execution popup is disabled in settings');
      }
    });

    // Listen for message completion
    document.addEventListener('PrinChatMessageComplete', (event: any) => {
      const { messageId, success } = event.detail;
      console.log('[PrinChat UI] Message completed:', messageId, success);

      if (success) {
        this.moveMessageToCompleted(messageId);
      }
    });

    // Listen for message errors
    document.addEventListener('PrinChatMessageError', (event: any) => {
      const { messageId, error } = event.detail;
      console.log('[PrinChat UI] Message error:', messageId, error);

      const msgExec = this.runningMessages.get(messageId);
      if (msgExec) {
        msgExec.status = 'error';
        msgExec.error = error;
        this.stopMessageTimer(messageId);
        // Only update popup if enabled
        if (this.showMessageExecutionPopup) {
          this.updateMessageStatusPopup();
        }
      }
    });

    // Listen for single message requests from popup/FAB
    // This routes popup messages through sendSingleMessage() so they show execution popup
    document.addEventListener('PrinChatSendSingleMessageFromPopup', async (event: any) => {
      const { messageId } = event.detail;
      console.log('[PrinChat UI] Single message request from popup, messageId:', messageId);

      if (!messageId) {
        console.error('[PrinChat UI] No messageId provided in event');
        return;
      }

      // Look up message from our cache (which already has restored media data)
      // This avoids chrome.tabs.sendMessage size limits for large media files
      const message = this.messages.find((m: any) => m.id === messageId);
      if (!message) {
        console.error('[PrinChat UI] Message not found in cache:', messageId);
        return;
      }

      console.log('[PrinChat UI] Found message in cache, type:', message.type);

      // Message media data is already in base64 format from GET_SCRIPTS_AND_MESSAGES restoration
      // Call sendSingleMessage() which will:
      // 1. Capture chat info
      // 2. Create execution state
      // 3. Dispatch PrinChatMessageStart event
      // 4. Execute with delay/pause/cancel support
      await this.sendSingleMessage(message);
    });
  }

  private startMessageTimer(messageId: string) {
    this.stopMessageTimer(messageId);

    const timer = setInterval(() => {
      const msgExec = this.runningMessages.get(messageId);
      const execution = this.messageExecutions.get(messageId);

      // Only count if not paused
      if (msgExec && msgExec.status === 'sending' && execution && !execution.isPaused) {
        msgExec.elapsedSeconds++;
        const card = this.messageStatusPopup?.querySelector(`[data-message-id="${messageId}"]`);
        const timerEl = card?.querySelector('.princhat-script-card-timer');
        if (timerEl) {
          timerEl.textContent = `${msgExec.elapsedSeconds}s`;
        }
      }
    }, 1000);

    this.messageTimers.set(messageId, timer);
  }

  private stopMessageTimer(messageId: string) {
    const timer = this.messageTimers.get(messageId);
    if (timer) {
      clearInterval(timer);
      this.messageTimers.delete(messageId);
    }
  }

  private moveMessageToCompleted(messageId: string) {
    const msgExec = this.runningMessages.get(messageId);
    if (!msgExec) {
      console.log('[PrinChat UI] Message not found in running messages:', messageId);
      return;
    }

    this.stopMessageTimer(messageId);

    const card = this.messageStatusPopup?.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement;
    if (card) {
      card.classList.add('removing');
      setTimeout(() => {
        msgExec.status = 'completed';
        this.completedMessages.push(msgExec);
        this.runningMessages.delete(messageId);
        this.renderedCardIds.delete(messageId);
        if (this.showMessageExecutionPopup) {
          this.updateMessageStatusPopup();
        }
        console.log('[PrinChat UI] Message moved to completed:', messageId);
      }, 300);
    } else {
      msgExec.status = 'completed';
      this.completedMessages.push(msgExec);
      this.runningMessages.delete(messageId);
      this.renderedCardIds.delete(messageId);
      if (this.showMessageExecutionPopup) {
        this.updateMessageStatusPopup();
      }
      console.log('[PrinChat UI] Message moved to completed:', messageId);
    }
  }

  private listenForSettingsChanges() {
    // Listen for settings updates from content script
    console.log('[PrinChat UI] Setting up PrinChatSettingsChanged listener...');
    document.addEventListener('PrinChatSettingsChanged', (event: any) => {
      console.log('[PrinChat UI] ⚙️ PrinChatSettingsChanged event received!');
      const { settings } = event.detail;
      console.log('[PrinChat UI] Settings changed:', settings);

      if (settings) {
        // Update local settings
        if (settings.requireSendConfirmation !== undefined) {
          this.requireConfirmation = settings.requireSendConfirmation;
          console.log('[PrinChat UI] Updated requireConfirmation:', this.requireConfirmation);
        }

        if (settings.showShortcuts !== undefined) {
          const oldValue = this.showShortcuts;
          this.showShortcuts = settings.showShortcuts;
          console.log('[PrinChat UI] Updated showShortcuts:', oldValue, '→', this.showShortcuts);

          // Update shortcut bar visibility immediately
          console.log('[PrinChat UI] Calling updateShortcutBarVisibility()...');
          this.updateShortcutBarVisibility();
          console.log('[PrinChat UI] ✅ Visibility updated');
        }

        if (settings.showScriptExecutionPopup !== undefined) {
          const oldValue = this.showScriptExecutionPopup;
          this.showScriptExecutionPopup = settings.showScriptExecutionPopup;
          console.log('[PrinChat UI] Updated showScriptExecutionPopup:', oldValue, '→', this.showScriptExecutionPopup);

          // If popup was just disabled, hide it (but keep tracking scripts)
          if (!this.showScriptExecutionPopup && this.statusPopup) {
            console.log('[PrinChat UI] Hiding status popup (disabled in settings)');
            this.closeStatusPopup();
          }
          // If popup was just enabled and there are running scripts, show it
          else if (this.showScriptExecutionPopup && this.runningScripts.size > 0 && !this.statusPopup) {
            console.log('[PrinChat UI] Creating status popup (enabled in settings with running scripts)');
            this.createStatusPopup();
            this.updateStatusPopup();
          }
        }

        if (settings.showMessageExecutionPopup !== undefined) {
          const oldValue = this.showMessageExecutionPopup;
          this.showMessageExecutionPopup = settings.showMessageExecutionPopup;
          console.log('[PrinChat UI] Updated showMessageExecutionPopup:', oldValue, '→', this.showMessageExecutionPopup);
        }
      }
    });
    console.log('[PrinChat UI] ✅ PrinChatSettingsChanged listener registered');
  }

  private listenForDataChanges() {
    // Listen for data updates (messages, scripts, tags) from content script
    console.log('[PrinChat UI] Setting up PrinChatDataChanged listener...');
    document.addEventListener('PrinChatDataChanged', (event: any) => {
      console.log('[PrinChat UI] 📊 PrinChatDataChanged event received!');
      const { messagesChanged, scriptsChanged, tagsChanged } = event.detail;
      console.log('[PrinChat UI] Changes:', { messagesChanged, scriptsChanged, tagsChanged });

      // Reload data and refresh UI
      console.log('[PrinChat UI] Refreshing UI overlay with new data...');
      this.refresh();
      console.log('[PrinChat UI] ✅ UI overlay refreshed');
    });
    console.log('[PrinChat UI] ✅ PrinChatDataChanged listener registered');
  }

  private setupResizeListeners() {
    // Debounce function to avoid too many reposition calls
    let resizeTimeout: NodeJS.Timeout;

    const repositionPopups = () => {
      // Reposition script popup if open
      if (this.statusPopup && document.body.contains(this.statusPopup)) {
        this.positionStatusPopup();
      }

      // Reposition message popup if open
      if (this.messageStatusPopup && document.body.contains(this.messageStatusPopup)) {
        this.positionMessageStatusPopup();
      }
    };

    // Listen for window resize
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(repositionPopups, 150); // Debounce 150ms
    });

    // Listen for scroll on chat container (WhatsApp scrolls internally)
    const chatContainer = document.querySelector('#main');
    if (chatContainer) {
      chatContainer.addEventListener('scroll', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(repositionPopups, 150); // Debounce 150ms
      });
    }
  }

  public refresh() {
    this.loadData().then(() => {
      this.createShortcutBar();
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new WhatsAppUIOverlay();
  });
} else {
  new WhatsAppUIOverlay();
}

// Export for potential external access
(window as any).princhatUI = WhatsAppUIOverlay;
