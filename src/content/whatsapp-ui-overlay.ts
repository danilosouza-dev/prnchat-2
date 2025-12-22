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
  private headerPopup: HTMLElement | null = null; // New header popup
  private isHeaderPopupOpen: boolean = false;
  private isHeaderPopupPinned: boolean = false;
  // private fab: HTMLElement | null = null; // Not used in new design
  private statusPopup: HTMLElement | null = null; // Script execution popup
  private messageStatusPopup: HTMLElement | null = null; // Message execution popup (separate!)
  private executionsPopup: HTMLElement | null = null; // Unified executions popup
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

      console.log('[PrinChat UI] Step 11: Setting up popup messaging...');
      this.listenForPopupMessages();
      console.log('[PrinChat UI] ✓ Popup messaging active');

      // Setup state synchronization with content script
      document.addEventListener('PrinChatSetState', (event: any) => {
        const viewMode = event.detail.viewMode;
        console.log('[PrinChat UI] State restored from extension:', viewMode);

        // Restore mode WITHOUT auto-opening popups (false param)
        if (viewMode === 'floating') {
          this.setFloatingMode(true, false);
        } else {
          // Ensure we are in header mode
          this.setFloatingMode(false, false);
        }
      });

      // Request initial state from content script
      console.log('[PrinChat UI] Requesting initial state...');
      document.dispatchEvent(new CustomEvent('PrinChatRequestState'));

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

        // Initialize header popup - LAZY LOADED NOW
        // this.createHeaderPopup();

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
   * DISABLED: Now showing in header executions popup instead
   */
  // @ts-expect-error - Keeping for potential future use
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
    // Update both floating popup AND executions popup (either/both may be open)

    // SMART UPDATE: Only add/remove cards when list changes, preserve existing cards for timers
    const runningSection = this.messageStatusPopup?.querySelector('[data-section="running-messages"]');
    if (runningSection) {
      this.updateMessageSection(runningSection, Array.from(this.runningMessages.values()).reverse(), false);
    }

    const completedSection = this.messageStatusPopup?.querySelector('[data-section="completed-messages"]');
    if (completedSection) {
      this.updateMessageSection(completedSection, [...this.completedMessages].reverse(), true);
    }

    // Also update executions popup if open
    if (this.executionsPopup) {
      const execRunning = this.executionsPopup.querySelector('[data-section="running-messages"]');
      if (execRunning) {
        this.updateMessageSection(execRunning, Array.from(this.runningMessages.values()).reverse(), false);
      }
      const execCompleted = this.executionsPopup.querySelector('[data-section="completed-messages"]');
      if (execCompleted) {
        this.updateMessageSection(execCompleted, [...this.completedMessages].reverse(), true);
      }
    }

    // Update executions badge in header
    this.updateExecutionsBadge();
  }

  /**
   * Smart update for message section - preserves existing cards BUT recreates when state changes
   */
  private updateMessageSection(section: Element, messages: MessageExecution[], isCompleted: boolean) {
    const existingCards = Array.from(section.querySelectorAll('[data-message-id]'));
    const existingIds = new Set(existingCards.map(card => card.getAttribute('data-message-id')!));
    const currentIds = new Set(messages.map(m => m.id));

    // Remove cards that no longer exist
    existingCards.forEach(card => {
      const id = card.getAttribute('data-message-id')!;
      if (!currentIds.has(id)) {
        card.remove();
      }
    });

    // Add new cards OR recreate if state changed
    messages.forEach((message, index) => {
      const existingCard = section.querySelector(`[data-message-id="${message.id}"]`);

      // Check if card needs recreation due to pause state change
      let needsRecreation = false;
      if (existingCard && !isCompleted) {
        const execution = this.messageExecutions.get(message.id);
        if (execution) {
          // Check if pause state changed
          const currentClass = existingCard.querySelector('.princhat-script-btn-icon')?.classList.contains('paused') ? true : false;
          const newPauseState = execution.isPaused;
          if (currentClass !== newPauseState) {
            needsRecreation = true;
            console.log(`[PrinChat UI] 🔄 Message ${message.id} state changed, recreating card`);
          }
        }
      }

      if (!existingIds.has(message.id) || needsRecreation) {
        // Remove old card if recreating
        if (needsRecreation && existingCard) {
          existingCard.remove();
        }

        const card = this.createMessageCard(message, isCompleted);
        if (index === 0) {
          section.prepend(card);
        } else {
          const prevCard = section.querySelector(`[data-message-id="${messages[index - 1].id}"]`);
          if (prevCard && prevCard.nextSibling) {
            section.insertBefore(card, prevCard.nextSibling);
          } else {
            section.appendChild(card);
          }
        }
      }
    });
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

    // Update pause/play icon directly in ALL popups without recreating card
    this.updateMessagePausePlayIcon(messageId, execution.isPaused);

    // Update UI
    if (this.showMessageExecutionPopup) {
      this.updateMessageStatusPopup();
    }
  }

  /**
   * Update pause/play icon in all popups for a message
   */
  private updateMessagePausePlayIcon(id: string, isPaused: boolean) {
    console.log(`[PrinChat UI] 🔄 updateMessagePausePlayIcon called: ${id}, isPaused=${isPaused}`);
    const pauseIcon = `<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>`;
    const playIcon = `<path d="M8 5v14l11-7z"/>`;
    const icon = isPaused ? playIcon : pauseIcon;

    // Update in floating popup
    const card = this.messageStatusPopup?.querySelector(`[data-message-id="${id}"]`);
    const btn = card?.querySelector('[data-action="pause-play"] svg path');
    if (btn) btn.setAttribute('d', icon);

    // Update in executions popup
    if (this.executionsPopup) {
      const execCard = this.executionsPopup.querySelector(`[data-message-id="${id}"]`);
      const execBtn = execCard?.querySelector('[data-action="pause-play"] svg path');
      if (execBtn) execBtn.setAttribute('d', icon);
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

  // @ts-expect-error - Keeping for potential future use
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
    // Update both floating popup AND executions popup (either/both may be open)

    // SMART UPDATE: Only add/remove cards when list changes, preserve existing cards for timers
    const runningSection = this.statusPopup?.querySelector('[data-section="running"]');
    if (runningSection) {
      this.updateScriptSection(runningSection, Array.from(this.runningScripts.values()).reverse(), false);
    }

    const completedSection = this.statusPopup?.querySelector('[data-section="completed"]');
    if (completedSection) {
      this.updateScriptSection(completedSection, [...this.completedScripts].reverse(), true);
    }

    // Also update executions popup if open
    if (this.executionsPopup) {
      const execRunning = this.executionsPopup.querySelector('[data-section="running"]');
      if (execRunning) {
        this.updateScriptSection(execRunning, Array.from(this.runningScripts.values()).reverse(), false);
      }
      const execCompleted = this.executionsPopup.querySelector('[data-section="completed"]');
      if (execCompleted) {
        this.updateScriptSection(execCompleted, [...this.completedScripts].reverse(), true);
      }
    }

    // Update executions badge in header
    this.updateExecutionsBadge();
  }

  /**
   * Smart update for script section - preserves existing cards BUT recreates when state changes
   */
  private updateScriptSection(section: Element, scripts: ScriptExecution[], isCompleted: boolean) {
    const existingCards = Array.from(section.querySelectorAll('[data-script-id]'));
    const existingIds = new Set(existingCards.map(card => card.getAttribute('data-script-id')!));
    const currentIds = new Set(scripts.map(s => s.id));

    // Remove cards that no longer exist
    existingCards.forEach(card => {
      const id = card.getAttribute('data-script-id')!;
      if (!currentIds.has(id)) {
        card.remove();
      }
    });

    // Add new cards OR recreate if state changed
    scripts.forEach((script, index) => {
      const existingCard = section.querySelector(`[data-script-id="${script.id}"]`);

      // Check if card needs recreation due to state change
      let needsRecreation = false;
      if (existingCard && !isCompleted) {
        // Check if status changed (running <-> paused)
        const btn = existingCard.querySelector('.princhat-script-btn-icon');
        const currentClass = btn?.classList.contains('paused') ? 'paused' : 'running';
        const newClass = script.status === 'paused' ? 'paused' : 'running';
        console.log(`[PrinChat DEBUG] Script ${script.id}: currentClass=${currentClass}, newClass=${newClass}, needsRecreation=${currentClass !== newClass}`);
        if (currentClass !== newClass) {
          needsRecreation = true;
        }
      }

      if (!existingIds.has(script.id) || needsRecreation) {
        // Remove old card if recreating
        if (needsRecreation && existingCard) {
          existingCard.remove();
        }

        const card = this.createScriptCard(script, isCompleted);
        if (index === 0) {
          section.prepend(card);
        } else {
          const prevCard = section.querySelector(`[data-script-id="${scripts[index - 1].id}"]`);
          if (prevCard && prevCard.nextSibling) {
            section.insertBefore(card, prevCard.nextSibling);
          } else {
            section.appendChild(card);
          }
        }
      }
    });
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

    // Update pause/play icon directly in ALL popups without recreating card
    this.updatePausePlayIcon(scriptId, scriptExec.status === 'paused');

    this.updateStatusPopup();
  }

  /**
   * Update pause/play icon in all popups for a script/message
   */
  private updatePausePlayIcon(id: string, isPaused: boolean) {
    const pauseIconPath = 'M6 4h4v16H6V4zm8 0h4v16h-4V4z';
    const playIconPath = 'M8 5v14l11-7z';
    const iconPath = isPaused ? playIconPath : pauseIconPath;

    // Update in floating popup
    const card = this.statusPopup?.querySelector(`[data-script-id="${id}"]`);
    const btn = card?.querySelector('[data-action="pause-play"] svg path');
    if (btn) btn.setAttribute('d', iconPath);

    // Update in executions popup
    if (this.executionsPopup) {
      const execCard = this.executionsPopup.querySelector(`[data-script-id="${id}"]`);
      const execBtn = execCard?.querySelector('[data-action="pause-play"] svg path');
      if (execBtn) execBtn.setAttribute('d', iconPath);
    }
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

        // Update timer in floating popup (if exists)
        const card = this.statusPopup?.querySelector(`[data-script-id="${scriptId}"]`);
        const timerEl = card?.querySelector('.princhat-script-card-timer');
        if (timerEl) {
          timerEl.textContent = `${scriptExec.elapsedSeconds}s`;
        }

        // ALSO update timer in executions popup (if exists and open)
        if (this.executionsPopup) {
          const execCard = this.executionsPopup.querySelector(`[data-script-id="${scriptId}"]`);
          const execTimerEl = execCard?.querySelector('.princhat-script-card-timer');
          if (execTimerEl) {
            execTimerEl.textContent = `${scriptExec.elapsedSeconds}s`;
          }
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

  private createHeaderPopup() {
    console.log('[PrinChat UI] Creating header popup...');

    // Remove existing if any
    const existing = document.querySelector('.princhat-header-popup');
    if (existing) existing.remove();

    // Create container
    this.headerPopup = document.createElement('div');
    this.headerPopup.className = 'princhat-header-popup';
    // Use visibility hidden instead of display none to ensure iframe loads
    this.headerPopup.style.visibility = 'hidden';
    this.headerPopup.style.opacity = '0';
    this.headerPopup.style.display = 'flex'; // Ensure layout is calculated

    // Get popup URL from marker
    const marker = document.getElementById('PrinChatInjected');
    // Try header specific URL first, fallback to generic
    const popupUrl = marker?.getAttribute('data-header-popup-url') || marker?.getAttribute('data-popup-url') || '';
    console.log('[PrinChat UI] Header Popup URL:', popupUrl);

    if (popupUrl) {
      // Use innerHTML to match FAB implementation exactly
      // This ensures identical DOM structure and initialization behavior
      this.headerPopup.innerHTML = `
        <div style="width: 100%; height: 100%; overflow: hidden; border-radius: 8px;">
          <iframe
            src="${popupUrl}"
            frameborder="0"
            style="width: 100%; height: 100%; border: none;"
          ></iframe>
        </div>
      `;
    } else {
      console.error('[PrinChat UI] Popup URL not found in marker');
      this.headerPopup.innerHTML = '<div style="color:white;padding:20px;">Erro: URL do popup não encontrada</div>';
    }

    // Append to body (z-index will handle layering)
    document.body.appendChild(this.headerPopup);

    // Create backdrop for closing
    const backdrop = document.createElement('div');
    backdrop.className = 'princhat-header-popup-backdrop';
    backdrop.style.display = 'none'; // Initially hidden
    backdrop.addEventListener('click', () => this.toggleHeaderPopup(false));
    document.body.appendChild(backdrop);

    // Store reference to backdrop on the popup element for easy access
    (this.headerPopup as any)._backdrop = backdrop;
  }

  private toggleHeaderPopup(show?: boolean) {
    // Lazy load: Create popup if it doesn't exist and we want to show it
    // If show is false/undefined and popup doesn't exist, do nothing (nothing to close/toggle)
    const shouldShow = show !== undefined ? show : !this.isHeaderPopupOpen;

    if (shouldShow && !this.headerPopup) {
      console.log('[PrinChat UI] First open: creating header popup (lazy load)...');
      this.createHeaderPopup();
    }

    if (!this.headerPopup) return;
    const backdrop = (this.headerPopup as any)._backdrop;

    this.isHeaderPopupOpen = shouldShow;

    if (shouldShow) {
      this.repositionPopupForHeader();

      // Add active state to header button
      const messagesBtn = document.querySelector('.princhat-header-icon-btn[data-action="messages"]');
      if (messagesBtn) {
        messagesBtn.classList.add('active');
      }

      this.headerPopup.style.visibility = 'visible';
      // this.headerPopup.style.display = 'flex'; // Already set in create
      if (backdrop && !this.isHeaderPopupPinned) backdrop.style.display = 'block';

      // Small delay for animation
      requestAnimationFrame(() => {
        if (this.headerPopup) this.headerPopup.style.opacity = '1';
      });

      console.log('[PrinChat UI] Header popup opened');
    } else {
      // Remove active state from button (header)
      const messagesBtn = document.querySelector('.princhat-header-icon-btn[data-action="messages"]');
      if (messagesBtn) {
        messagesBtn.classList.remove('active');
      }

      this.headerPopup.style.opacity = '0';
      if (backdrop) backdrop.style.display = 'none';

      // Wait for animation
      setTimeout(() => {
        if (this.headerPopup && !this.isHeaderPopupOpen) {
          this.headerPopup.style.visibility = 'hidden';
          // this.headerPopup.style.display = 'none'; // Keep flex to maintain iframe state
        }
      }, 200);

      console.log('[PrinChat UI] Header popup closed');
    }
  }

  /**
   * Toggle notifications dropdown (FAKE notifications for preview)
   */
  private toggleNotificationsDropdown(button: HTMLElement) {
    const existingDropdown = document.querySelector('.princhat-notifications-dropdown');

    if (existingDropdown) {
      // Close dropdown
      existingDropdown.remove();
      button.classList.remove('active');
      return;
    }

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'princhat-notifications-dropdown';

    // Fake notifications for preview
    const fakeNotifications = [
      {
        id: '1',
        type: 'promo',
        icon: '🎉',
        title: 'Promoção Especial!',
        message: 'Ganhe 50% de desconto nos próximos 3 meses. Aproveite!',
        timestamp: Date.now() - 3600000 // 1h atrás
      },
      {
        id: '2',
        type: 'update',
        icon: '🔔',
        title: 'Nova Atualização Disponível',
        message: 'Versão 2.1.0 com melhorias de performance e novos recursos.',
        timestamp: Date.now() - 86400000 // 1 dia atrás
      },
      {
        id: '3',
        type: 'alert',
        icon: '⚠️',
        title: 'Manutenção Programada',
        message: 'Sistema estará em manutenção dia 25/11 das 2h às 4h.',
        timestamp: Date.now() - 172800000 // 2 dias atrás
      }
    ];

    // Format relative time
    const formatRelativeTime = (timestamp: number) => {
      const now = Date.now();
      const diff = now - timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return 'agora';
      if (minutes < 60) return `${minutes}m atrás`;
      if (hours < 24) return `${hours}h atrás`;
      return `${days}d atrás`;
    };

    // Build dropdown content
    dropdown.innerHTML = `
      <div class="princhat-notifications-header">
        <span>Notificações</span>
        <button class="princhat-notifications-clear-all">Limpar tudo</button>
      </div>
      <div class="princhat-notifications-list">
        ${fakeNotifications.map(notif => `
          <div class="princhat-notification-item ${notif.type}">
            <div class="princhat-notification-icon">${notif.icon}</div>
            <div class="princhat-notification-content">
              <div class="princhat-notification-title">${notif.title}</div>
              <div class="princhat-notification-message">${notif.message}</div>
              <div class="princhat-notification-time">${formatRelativeTime(notif.timestamp)}</div>
            </div>
            <button class="princhat-notification-close" data-id="${notif.id}">×</button>
          </div>
        `).join('')}
      </div>
    `;

    // Position dropdown below button
    const rect = button.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.right = `${window.innerWidth - rect.right}px`;

    document.body.appendChild(dropdown);
    button.classList.add('active');

    // Add event listeners
    const clearAllBtn = dropdown.querySelector('.princhat-notifications-clear-all');
    clearAllBtn?.addEventListener('click', () => {
      const list = dropdown.querySelector('.princhat-notifications-list');
      if (list) {
        list.innerHTML = '<div class="princhat-notifications-empty">Nenhuma notificação no momento</div>';
      }
    });

    // Close individual notification
    dropdown.querySelectorAll('.princhat-notification-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = (e.target as HTMLElement).closest('.princhat-notification-item');
        if (item) {
          item.remove();
          // Check if list is empty
          const remainingItems = dropdown.querySelectorAll('.princhat-notification-item');
          if (remainingItems.length === 0) {
            const list = dropdown.querySelector('.princhat-notifications-list');
            if (list) {
              list.innerHTML = '<div class="princhat-notifications-empty">Nenhuma notificação no momento</div>';
            }
          }
        }
      });
    });

    // Close dropdown when clicking outside
    const closeDropdown = (e: MouseEvent) => {
      if (!dropdown.contains(e.target as Node) && !button.contains(e.target as Node)) {
        dropdown.remove();
        button.classList.remove('active');
        document.removeEventListener('click', closeDropdown);
      }
    };

    // Add listener after a short delay to prevent immediate closure
    setTimeout(() => {
      document.addEventListener('click', closeDropdown);
    }, 100);
  }

  /**
   * Toggle executions popup (contains script + message execution popups)
   */
  private toggleExecutionsPopup(button: HTMLElement) {
    const existingPopup = document.querySelector('.princhat-executions-popup');

    if (existingPopup) {
      // Close popup
      existingPopup.remove();
      button.classList.remove('active');
      return;
    }

    // Create popup container
    const popup = document.createElement('div');
    popup.className = 'princhat-executions-popup';

    // Header
    const header = document.createElement('div');
    header.className = 'princhat-executions-header';
    header.innerHTML = '<span>Execuções em Andamento</span>';
    popup.appendChild(header);

    // Content container for both popups
    const content = document.createElement('div');
    content.className = 'princhat-executions-content';
    popup.appendChild(content);

    // Check if there are any executions
    const hasScripts = this.runningScripts.size > 0;
    const hasMessages = this.runningMessages.size > 0;
    const hasCompleted = this.completedScripts.length > 0 || this.completedMessages.length > 0;

    if (!hasScripts && !hasMessages && !hasCompleted) {
      // Empty state
      const emptyState = document.createElement('div');
      emptyState.className = 'princhat-executions-empty';
      emptyState.textContent = 'Nenhuma execução em andamento';
      content.appendChild(emptyState);
    } else {
      // Render script popup inside if there are scripts
      if (hasScripts || this.completedScripts.length > 0) {
        const scriptsContainer = this.renderScriptExecutions();
        if (scriptsContainer) {
          content.appendChild(scriptsContainer);
        }
      }

      // Render message popup inside if there are messages
      if (hasMessages || this.completedMessages.length > 0) {
        const messagesContainer = this.renderMessageExecutions();
        if (messagesContainer) {
          content.appendChild(messagesContainer);
        }
      }
    }

    // Position popup below button
    const rect = button.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = `${rect.bottom + 8}px`;
    popup.style.right = `${window.innerWidth - rect.right}px`;

    document.body.appendChild(popup);
    button.classList.add('active');

    // Store reference for updates
    this.executionsPopup = popup;

    // Close popup when clicking outside
    const closePopup = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Don't close if clicking on action buttons or their children
      const isActionButton = target.closest('[data-action]');
      if (isActionButton) {
        return; // Keep popup open
      }

      if (!popup.contains(e.target as Node) && !button.contains(e.target as Node)) {
        popup.remove();
        button.classList.remove('active');
        this.executionsPopup = null;
        document.removeEventListener('click', closePopup);
      }
    };

    // Add listener after a short delay to prevent immediate closure
    setTimeout(() => {
      document.addEventListener('click', closePopup);
    }, 100);
  }

  /**
   * Render script executions for the executions popup
   */
  private renderScriptExecutions(): HTMLElement | null {
    // Create container with ORIGINAL popup structure
    const container = document.createElement('div');
    container.className = 'princhat-script-popup-inline'; // Special class for inline rendering

    // Build HTML matching original popup structure
    container.innerHTML = `
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

    // Populate running scripts using ORIGINAL method
    const runningSection = container.querySelector('[data-section="running"]');
    if (runningSection) {
      const runningArray = Array.from(this.runningScripts.values()).reverse();
      runningArray.forEach((scriptExec) => {
        const card = this.createScriptCard(scriptExec, false);
        runningSection.appendChild(card);
      });
    }

    // Populate completed scripts using ORIGINAL method  
    const completedSection = container.querySelector('[data-section="completed"]');
    if (completedSection) {
      const completedReversed = [...this.completedScripts].reverse();
      completedReversed.forEach((scriptExec) => {
        const card = this.createScriptCard(scriptExec, true);
        completedSection.appendChild(card);
      });
    }

    // Add event listeners for buttons
    const cancelAllBtn = container.querySelector('[data-action="cancel-all"]');
    cancelAllBtn?.addEventListener('click', () => this.cancelAllScripts());

    const clearAllBtn = container.querySelector('[data-action="clear-all"]');
    clearAllBtn?.addEventListener('click', () => this.clearAllCompleted());

    return container;
  }

  /**
   * Render message executions for the executions popup
   */
  private renderMessageExecutions(): HTMLElement | null {
    // Create container with ORIGINAL popup structure
    const container = document.createElement('div');
    container.className = 'princhat-message-popup-inline'; // Special class for inline rendering

    // Build HTML matching original popup structure
    container.innerHTML = `
      <!-- Seção EM ENVIO -->
      <div class="princhat-message-section">
        <div class="princhat-message-section-header">
          <span class="princhat-message-section-title">EM ENVIO (MENSAGENS)</span>
          <button class="princhat-message-btn-discrete" data-action="cancel-all-messages">Cancelar Todos</button>
        </div>
        <div class="princhat-message-section-body" data-section="running-messages"></div>
      </div>

      <!-- Seção ENVIO CONCLUÍDO -->
      <div class="princhat-message-section">
        <div class="princhat-message-section-header">
          <span class="princhat-message-section-title">ENVIO CONCLUÍDO</span>
          <button class="princhat-message-btn-discrete" data-action="clear-all-messages">Limpar Lista</button>
        </div>
        <div class="princhat-message-section-body" data-section="completed-messages"></div>
      </div>
    `;

    // Populate running messages using ORIGINAL method
    const runningSection = container.querySelector('[data-section="running-messages"]');
    if (runningSection) {
      const runningArray = Array.from(this.runningMessages.values()).reverse();
      runningArray.forEach((msgExec) => {
        const card = this.createMessageCard(msgExec, false);
        runningSection.appendChild(card);
      });
    }

    // Populate completed messages using ORIGINAL method
    const completedSection = container.querySelector('[data-section="completed-messages"]');
    if (completedSection) {
      const completedReversed = [...this.completedMessages].reverse();
      completedReversed.forEach((msgExec) => {
        const card = this.createMessageCard(msgExec, true);
        completedSection.appendChild(card);
      });
    }

    // Add event listeners for buttons
    const cancelAllBtn = container.querySelector('[data-action="cancel-all-messages"]');
    cancelAllBtn?.addEventListener('click', () => this.cancelAllMessages());

    const clearAllBtn = container.querySelector('[data-action="clear-all-messages"]');
    clearAllBtn?.addEventListener('click', () => this.clearAllCompletedMessages());

    return container;
  }

  /**
   * Create execution card for a script
   */
  // @ts-expect-error - Keeping for potential future use
  private createScriptExecutionCard(scriptExec: any): HTMLElement {
    const card = document.createElement('div');
    card.className = 'princhat-execution-card';
    card.innerHTML = `
      <div class="princhat-execution-card-name">${scriptExec.scriptName || scriptExec.name || 'Script'}</div>
      <div class="princhat-execution-card-status">${scriptExec.status || 'Executando...'}</div>
    `;
    return card;
  }

  /**
   * Create execution card for a message
   */
  // @ts-expect-error - Keeping for potential future use
  private createMessageExecutionCard(msgExec: any): HTMLElement {
    const card = document.createElement('div');
    card.className = 'princhat-execution-card';

    // Safely get message preview
    let messagePreview = 'Mensagem';
    if (msgExec.message?.text) {
      messagePreview = msgExec.message.text.substring(0, 30) + (msgExec.message.text.length > 30 ? '...' : '');
    } else if (msgExec.message?.caption) {
      messagePreview = msgExec.message.caption.substring(0, 30) + '...';
    } else if (msgExec.messageText) {
      messagePreview = msgExec.messageText.substring(0, 30) + (msgExec.messageText.length > 30 ? '...' : '');
    }

    card.innerHTML = `
      <div class="princhat-execution-card-name">${messagePreview}</div>
      <div class="princhat-execution-card-status">${msgExec.status || 'Enviando...'}</div>
    `;
    return card;
  }

  /**
   * Update executions badge in header
   */
  private updateExecutionsBadge() {
    const button = document.querySelector('.princhat-header-icon-btn[data-executions-badge="true"]');
    if (!button) return;

    const badge = button.querySelector('.princhat-executions-badge');
    if (!badge) return;

    // Calculate total executions
    const totalExecutions = this.runningScripts.size + this.runningMessages.size;

    // Update badge
    badge.textContent = totalExecutions.toString();

    // Show/hide based on count
    if (totalExecutions > 0) {
      (badge as HTMLElement).style.display = 'flex';
    } else {
      (badge as HTMLElement).style.display = 'none';
    }
  }

  /**
   * Update executions popup content (if open)
   */
  // @ts-expect-error - Deprecated, keeping for reference
  private updateExecutionsPopup() {
    if (!this.executionsPopup) return;

    // Find content container
    const content = this.executionsPopup.querySelector('.princhat-executions-content');
    if (!content) return;

    // Clear current content
    content.innerHTML = '';

    // Check if there are any executions
    const hasScripts = this.runningScripts.size > 0 || this.completedScripts.length > 0;
    const hasMessages = this.runningMessages.size > 0 || this.completedMessages.length > 0;

    if (!hasScripts && !hasMessages) {
      // Empty state
      const emptyState = document.createElement('div');
      emptyState.className = 'princhat-executions-empty';
      emptyState.textContent = 'Nenhuma execução em andamento';
      content.appendChild(emptyState);
    } else {
      // Render script popup inside if there are scripts
      if (hasScripts) {
        const scriptsContainer = this.renderScriptExecutions();
        if (scriptsContainer) {
          content.appendChild(scriptsContainer);
        }
      }

      // Render message popup inside if there are messages  
      if (hasMessages) {
        const messagesContainer = this.renderMessageExecutions();
        if (messagesContainer) {
          content.appendChild(messagesContainer);
        }
      }
    }
  }

  private listenForPopupMessages() {
    window.addEventListener('message', (event) => {
      if (!event.data) return;

      if (event.data.type === 'PRINCHAT_POPUP_PIN_TOGGLE') {
        const pinned = event.data.pinned;
        console.log('[PrinChat UI] Popup pinned state changed:', pinned);
        this.setPopupPinned(pinned);
      } else if (event.data.type === 'PRINCHAT_TOGGLE_FAB_MODE') {
        const floating = event.data.floating;
        console.log('[PrinChat UI] Floating mode toggled by user:', floating);
        // User interaction -> Auto open
        this.setFloatingMode(floating, true);
      }
    });

    // Restore state if needed (e.g. from localStorage)
    // For now defaulting to false as per property init
  }

  private setFloatingMode(floating: boolean, autoOpen: boolean = false) {
    const marker = document.getElementById('PrinChatInjected');
    const messagesBtn = document.querySelector('.princhat-header-icon-btn[data-action="messages"]') as HTMLElement;

    if (floating) {
      // Switch to Floating Mode
      // 1. Hide Header Button
      if (messagesBtn) messagesBtn.style.display = 'none';

      // 2. Show DOM-based FAB (controlled by whatsapp-fab.ts)
      if (marker) {
        marker.setAttribute('data-show-fab', 'true');
        console.log('[PrinChat UI] Enabled existing FAB via marker');

        // Auto-open FAB popup if requested
        if (autoOpen) {
          marker.setAttribute('data-open-fab', 'true');
        }
      }

      // 3. Close header popup if open
      if (this.isHeaderPopupOpen) {
        this.toggleHeaderPopup(false);
      }
    } else {
      // Switch to Header Mode
      // 1. Show Header Button
      if (messagesBtn) messagesBtn.style.display = 'flex';

      // 2. Hide DOM-based FAB
      if (marker) {
        marker.setAttribute('data-show-fab', 'false');
        console.log('[PrinChat UI] Disabled existing FAB via marker');
      }

      // 3. Auto-open header popup if requested
      if (autoOpen) {
        // We use setTimeout to ensure UI is ready
        setTimeout(() => {
          this.toggleHeaderPopup(true);
        }, 100);
      }
    }
  }

  private repositionPopupForHeader() {
    if (!this.headerPopup) return;
    const messagesBtn = document.querySelector('.princhat-header-icon-btn[data-action="messages"]');
    if (messagesBtn) {
      const rect = messagesBtn.getBoundingClientRect();
      this.headerPopup.style.bottom = 'auto';
      this.headerPopup.style.top = `${rect.bottom + 12}px`;
      const rightOffset = window.innerWidth - rect.right;
      this.headerPopup.style.right = `${rightOffset}px`;
      this.headerPopup.style.left = 'auto';
    }
  }

  private setPopupPinned(pinned: boolean) {
    this.isHeaderPopupPinned = pinned;

    if (!this.headerPopup) return;

    const backdrop = (this.headerPopup as any)._backdrop as HTMLElement;
    if (backdrop) {
      if (pinned) {
        // Hide backdrop to allow interaction with page
        backdrop.style.display = 'none';
        this.headerPopup.classList.add('pinned');
        console.log('[PrinChat UI] Popup pinned: Backdrop hidden');
      } else {
        if (this.isHeaderPopupOpen) {
          // Show backdrop if unpinned and currently open
          backdrop.style.display = 'block';
        }
        this.headerPopup.classList.remove('pinned');
        console.log('[PrinChat UI] Popup unpinned: Backdrop restored');
      }
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

    console.log('[PrinChat UI] Marker found:', !!marker);
    console.log('[PrinChat UI] Logo URL from marker:', logoUrl);

    if (logoUrl) {
      const logo = document.createElement('img');
      logo.className = 'princhat-header-logo';
      logo.src = logoUrl;
      logo.alt = 'PrinChat';
      logo.onerror = () => {
        console.error('[PrinChat UI] Failed to load logo from:', logoUrl);
      };
      logo.onload = () => {
        console.log('[PrinChat UI] Logo loaded successfully from:', logoUrl);
      };
      leftSection.appendChild(logo);
      console.log('[PrinChat UI] Logo img element created and appended');
    } else {
      console.warn('[PrinChat UI] Logo URL not found in marker');
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

      // Add notification badge for notifications button (FAKE for preview)
      if (icon.name === 'notifications') {
        const badge = document.createElement('span');
        badge.className = 'princhat-notification-badge';
        badge.textContent = '3'; // Fake count
        button.appendChild(badge);
      }

      // Add executions badge for refresh button (dynamic count)
      if (icon.name === 'refresh') {
        const badge = document.createElement('span');
        badge.className = 'princhat-executions-badge';
        badge.textContent = '0';
        badge.style.display = 'none'; // Hidden when 0
        button.appendChild(badge);
        // Store reference for updates
        button.dataset.executionsBadge = 'true';
      }

      // Add click handler
      button.addEventListener('click', () => {
        console.log(`[PrinChat UI] Header icon clicked: ${icon.name}`);

        // Handle different actions
        if (icon.name === 'messages') {
          // Changed: Toggle header popup instead of opening options page
          this.toggleHeaderPopup();
          // chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS_PAGE', tab: 'messages' });
        } else if (icon.name === 'refresh') {
          console.log(`[PrinChat UI] Executions clicked`);
          console.log(`[PrinChat UI] this.toggleExecutionsPopup exists?`, typeof this.toggleExecutionsPopup);
          try {
            this.toggleExecutionsPopup(button);
          } catch (error) {
            console.error('[PrinChat UI] ❌ Error calling toggleExecutionsPopup:', error);
          }
        } else if (icon.name === 'notifications') {
          console.log(`[PrinChat UI] Notifications clicked`);
          this.toggleNotificationsDropdown(button);
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
    // Show placeholder initially
    profileImg.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

    // Use continuous interval with hybrid strategy: WPP API first, then DOM fallback
    let attemptCount = 0;
    const maxAttempts = 60;
    const photoLoadInterval = setInterval(async () => {
      attemptCount++;

      console.log(`[PrinChat UI] 🔄 Attempt ${attemptCount}/${maxAttempts}`);

      // Check if we still have placeholder
      const hasPlaceholder = profileImg.querySelector('svg') !== null;
      if (!hasPlaceholder) {
        console.log('[PrinChat UI] Photo already loaded, stopping interval');
        clearInterval(photoLoadInterval);
        return;
      }

      let photoUrl: string | null = null;

      // Strategy 1: Try WPP.profile.getMyProfilePicture() first (official API)
      try {
        const WPP = (window as any).WPP;
        if (WPP?.profile?.getMyProfilePicture) {
          console.log('[PrinChat UI] Strategy 1: Trying WPP.profile.getMyProfilePicture()...');
          const myProfilePic = await WPP.profile.getMyProfilePicture();

          if (myProfilePic) {
            photoUrl = myProfilePic.eurl || myProfilePic.imgFull || myProfilePic.img;
            if (photoUrl) {
              console.log('[PrinChat UI] ✅ Got photo from WPP API:', photoUrl);
            }
          }
        }
      } catch (error) {
        console.log('[PrinChat UI] WPP API failed:', error);
      }

      // Strategy 2: Fallback to DOM search if WPP API didn't work
      if (!photoUrl) {
        console.log('[PrinChat UI] Strategy 2: Searching for photo in DOM...');

        const selectors = [
          // Navbar profile button (most specific)
          'button[aria-label="Perfil"] img._ao3e',
          'button[data-navbar-item="true"][aria-label="Perfil"] img',
          // Alternative selectors
          'button[aria-label="Perfil"] img[src*=".cdn.whatsapp.net"]',
          'header img._ao3e[src*=".cdn.whatsapp.net"]',
          'img._ao3e[src*="/v/t61."]',
        ];

        for (const selector of selectors) {
          try {
            const imgElement = document.querySelector(selector) as HTMLImageElement;
            if (imgElement?.src?.startsWith('https://media')) {
              photoUrl = imgElement.src;
              console.log(`[PrinChat UI] ✅ Found photo in DOM with selector: "${selector}"`);
              break;
            }
          } catch (error) {
            // Continue to next selector
          }
        }
      }

      // If we got a photo URL from either strategy, load it
      if (photoUrl) {
        profileImg.innerHTML = '';
        const img = document.createElement('img');
        img.src = photoUrl;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        profileImg.appendChild(img);
        console.log('[PrinChat UI] ✅ Profile photo loaded successfully on attempt', attemptCount);
        clearInterval(photoLoadInterval);
        return;
      }

      console.log(`[PrinChat UI] ⚠️ No profile photo found yet (attempt ${attemptCount})`);

      // Stop after max attempts
      if (attemptCount >= maxAttempts) {
        console.log('[PrinChat UI] ⚠️ Stopped trying after', maxAttempts, 'attempts');
        clearInterval(photoLoadInterval);
      }
    }, 1000); // Try every 1 second

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

      // DISABLED: Floating popup - now shown in header executions popup
      // Only create/show popup if enabled in settings
      // if (this.showScriptExecutionPopup) {
      //   // Create popup if not exists
      //   if (!this.statusPopup) {
      //     this.createStatusPopup();
      //   }
      //
      //   this.updateStatusPopup();
      // } else {
      //   console.log('[PrinChat UI] Script execution popup is disabled in settings');
      // }

      // Update badge instead
      this.updateStatusPopup(); // Still call to update badge
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
      // DISABLED: Floating popup - now shown in header executions popup
      // if (this.showMessageExecutionPopup) {
      //   if (!this.messageStatusPopup) {
      //     this.createMessageStatusPopup();
      //   }
      //   this.updateMessageStatusPopup();
      // } else {
      //   console.log('[PrinChat UI] Message execution popup is disabled in settings');
      // }

      // Update badge instead
      this.updateExecutionsBadge();
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

        // Update timer in floating popup (if exists)
        const card = this.messageStatusPopup?.querySelector(`[data-message-id="${messageId}"]`);
        const timerEl = card?.querySelector('.princhat-script-card-timer');
        if (timerEl) {
          timerEl.textContent = `${msgExec.elapsedSeconds}s`;
        }

        // ALSO update timer in executions popup (if exists and open)
        if (this.executionsPopup) {
          const execCard = this.executionsPopup.querySelector(`[data-message-id="${messageId}"]`);
          const execTimerEl = execCard?.querySelector('.princhat-script-card-timer');
          if (execTimerEl) {
            execTimerEl.textContent = `${msgExec.elapsedSeconds}s`;
          }
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
          // DISABLED: Floating popup - now shown in header executions popup
          // If popup was just enabled and there are running scripts, show it
          // else if (this.showScriptExecutionPopup && this.runningScripts.size > 0 && !this.statusPopup) {
          //   console.log('[PrinChat UI] Creating status popup (enabled in settings with running scripts)');
          //   this.createStatusPopup();
          //   this.updateStatusPopup();
          // }
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
