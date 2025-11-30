/**
 * X1Flox UI Overlay
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
  showTyping?: boolean;
  showRecording?: boolean;
  sendDelay?: number;
}

interface StatusItem {
  id: string;
  type: 'text' | 'audio' | 'image' | 'video';
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
      console.log('[X1Flox UI] Initializing overlay...');

      // Wait for WhatsApp to load
      console.log('[X1Flox UI] Step 1: Waiting for WhatsApp to load...');
      await this.waitForWhatsApp();
      console.log('[X1Flox UI] ✓ WhatsApp loaded');

      // Load data
      console.log('[X1Flox UI] Step 2: Loading scripts and messages...');
      await this.loadData();
      console.log('[X1Flox UI] ✓ Data loaded');

      // Create UI components
      console.log('[X1Flox UI] Step 3: Creating shortcut bar...');
      this.createShortcutBar();
      console.log('[X1Flox UI] ✓ Shortcut bar created');

      console.log('[X1Flox UI] Step 4: Creating tooltip...');
      this.createTooltip();
      console.log('[X1Flox UI] ✓ Tooltip created');

      // Monitor chat changes
      console.log('[X1Flox UI] Step 5: Setting up chat monitor...');
      this.monitorChatChanges();
      console.log('[X1Flox UI] ✓ Chat monitor active');

      // Listen for execution events
      console.log('[X1Flox UI] Step 6: Setting up execution listeners...');
      this.listenForExecutionEvents();
      console.log('[X1Flox UI] ✓ Execution listeners active');

      // Listen for settings changes
      console.log('[X1Flox UI] Step 7: Setting up settings change listeners...');
      this.listenForSettingsChanges();
      console.log('[X1Flox UI] ✓ Settings change listeners active');

      // Listen for data changes (messages, scripts, tags)
      console.log('[X1Flox UI] Step 8: Setting up data change listeners...');
      this.listenForDataChanges();
      console.log('[X1Flox UI] ✓ Data change listeners active');

      // Setup resize/scroll listeners for responsive popups
      console.log('[X1Flox UI] Step 9: Setting up responsive popup listeners...');
      this.setupResizeListeners();
      console.log('[X1Flox UI] ✓ Responsive popup listeners active');

      console.log('[X1Flox UI] ✅ Overlay fully initialized');
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[X1Flox UI] ❌ Fatal error during initialization:', errorMessage);
      console.error('[X1Flox UI] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    }
  }

  private async waitForWhatsApp(): Promise<void> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 60; // 30 seconds (60 * 500ms)

      const checkInterval = setInterval(() => {
        attempts++;
        const main = document.querySelector('#main');

        console.log(`[X1Flox UI] Checking for WhatsApp #main (attempt ${attempts}/${maxAttempts})...`);

        if (main) {
          console.log('[X1Flox UI] Found #main element');
          clearInterval(checkInterval);
          resolve();
        } else if (attempts >= maxAttempts) {
          console.error('[X1Flox UI] Timeout: #main element not found after 30 seconds');
          clearInterval(checkInterval);
          reject(new Error('WhatsApp #main element not found'));
        }
      }, 500);
    });
  }

  private async loadData() {
    try {
      console.log('[X1Flox UI] Requesting scripts and messages from content script...');
      // Request data from content script via custom event
      const response = await this.requestFromContentScript({ type: 'GET_SCRIPTS_AND_MESSAGES' });

      console.log('[X1Flox UI] Response received:', response);

      if (response && response.success) {
        this.scripts = response.data.scripts || [];
        this.messages = response.data.messages || [];

        // Load settings
        console.log('[X1Flox UI] Loading settings...');
        const settingsResponse = await this.requestFromContentScript({ type: 'GET_SETTINGS' });
        if (settingsResponse && settingsResponse.success) {
          this.requireConfirmation = settingsResponse.data?.requireSendConfirmation ?? true;
          this.showShortcuts = settingsResponse.data?.showShortcuts ?? true;
          this.showScriptExecutionPopup = settingsResponse.data?.showScriptExecutionPopup ?? true;
          this.showMessageExecutionPopup = settingsResponse.data?.showMessageExecutionPopup ?? true;
          console.log('[X1Flox UI] Require confirmation:', this.requireConfirmation);
          console.log('[X1Flox UI] Show shortcuts:', this.showShortcuts);
          console.log('[X1Flox UI] Show script execution popup:', this.showScriptExecutionPopup);
          console.log('[X1Flox UI] Show message execution popup:', this.showMessageExecutionPopup);
        }
        console.log('[X1Flox UI] Loaded', this.scripts.length, 'scripts and', this.messages.length, 'messages');
      } else {
        console.error('[X1Flox UI] Failed to load data:', response?.error || 'Unknown error');
        // Initialize with empty arrays to prevent errors
        this.scripts = [];
        this.messages = [];
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[X1Flox UI] Error loading data:', errorMessage);
      // Initialize with empty arrays to prevent errors
      this.scripts = [];
      this.messages = [];
    }
  }

  private async requestFromContentScript(message: any, timeoutMs: number = 5000): Promise<any> {
    return new Promise((resolve) => {
      const requestId = `ui-${Date.now()}-${Math.random()}`;
      console.log('[X1Flox UI] Sending request:', message.type, 'with ID:', requestId);

      const handler = (event: any) => {
        console.log('[X1Flox UI] Response event received:', event.detail);
        if (event.detail?.requestId === requestId) {
          console.log('[X1Flox UI] Response matches request ID:', requestId);
          document.removeEventListener('X1FloxUIResponse', handler);
          resolve(event.detail.response);
        }
      };

      document.addEventListener('X1FloxUIResponse', handler);
      console.log('[X1Flox UI] Added response listener for:', requestId);

      // Configurable timeout
      setTimeout(() => {
        console.log('[X1Flox UI] Request timed out:', requestId);
        document.removeEventListener('X1FloxUIResponse', handler);
        resolve({ success: false, error: `Request timeout after ${timeoutMs}ms`, isTimeout: true });
      }, timeoutMs);

      console.log('[X1Flox UI] Dispatching X1FloxUIRequest event...');
      document.dispatchEvent(new CustomEvent('X1FloxUIRequest', {
        detail: { requestId, message }
      }));
      console.log('[X1Flox UI] Event dispatched successfully');
    });
  }

  private createShortcutBar() {
    console.log('[X1Flox UI] Creating shortcut bar with', this.scripts.length, 'scripts and', this.messages.length, 'messages');

    // Remove existing bar if any
    const existing = document.querySelector('.x1flox-shortcut-bar');
    if (existing) {
      console.log('[X1Flox UI] Removing existing shortcut bar');
      existing.remove();
    }

    // Create shortcut bar
    this.shortcutBar = document.createElement('div');
    this.shortcutBar.className = 'x1flox-shortcut-bar';
    console.log('[X1Flox UI] Shortcut bar div created');

    // Add script buttons
    this.scripts.forEach((script, index) => {
      console.log(`[X1Flox UI] Adding script button ${index + 1}/${this.scripts.length}:`, script.name);
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
      console.log(`[X1Flox UI] Adding message button ${index + 1}/${this.messages.length}:`, preview);
      const btn = this.createShortcutButton(
        preview,
        'message',
        message.id,
        () => this.handleMessageCardClick(message),
        () => this.handleMessageSendClick(message)
      );
      this.shortcutBar!.appendChild(btn);
    });

    console.log('[X1Flox UI] Appending shortcut bar to WhatsApp footer');

    // Try to find WhatsApp footer and insert shortcut bar inside it
    const footer = document.querySelector('#main footer');
    if (footer) {
      console.log('[X1Flox UI] Found WhatsApp footer, inserting shortcut bar at the end');
      footer.appendChild(this.shortcutBar);
    } else {
      console.log('[X1Flox UI] WhatsApp footer not found, appending to body');
      document.body.appendChild(this.shortcutBar);
    }

    console.log('[X1Flox UI] Shortcut bar appended, checking visibility...');

    // Verify it's in the DOM
    const inDOM = document.querySelector('.x1flox-shortcut-bar');
    console.log('[X1Flox UI] Shortcut bar in DOM?', !!inDOM);
    if (inDOM) {
      const styles = window.getComputedStyle(inDOM);
      console.log('[X1Flox UI] Shortcut bar display:', styles.display, 'visibility:', styles.visibility, 'opacity:', styles.opacity);
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
    btn.className = `x1flox-shortcut-btn`;
    btn.dataset.id = id;
    btn.dataset.type = type;
    btn.title = text;

    // Icon based on message type (for messages) or script icon (for scripts)
    let iconSvg = '';

    if (type === 'script') {
      // Script icon - filled circle (bullet)
      iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="8"/>
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
      <div class="x1flox-shortcut-btn-icon">${iconSvg}</div>
      <span class="x1flox-shortcut-btn-text">${text}</span>
      <button class="x1flox-shortcut-btn-action" title="Clique para enviar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
      </button>
    `;

    // Card click handler
    btn.addEventListener('click', (e) => {
      // Don't trigger if clicking the action button
      if ((e.target as HTMLElement).closest('.x1flox-shortcut-btn-action')) {
        return;
      }
      onCardClick();
    });

    // Action button click handler
    const actionBtn = btn.querySelector('.x1flox-shortcut-btn-action');
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

    console.log('[X1Flox UI] Message card clicked:', message.id);
    // Toggle confirmation state
    if (this.confirmingMessageId === message.id) {
      this.confirmingMessageId = null;
      console.log('[X1Flox UI] Deselecting message');
    } else {
      this.confirmingMessageId = message.id;
      this.confirmingScriptId = null; // Clear script confirmation
      console.log('[X1Flox UI] Selecting message for confirmation');
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
    const buttons = document.querySelectorAll('.x1flox-shortcut-btn');
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
      const actionBtn = element.querySelector('.x1flox-shortcut-btn-action');
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
      console.log('[X1Flox UI] Using cached chat ID:', this.cachedChatId);
      return this.cachedChatId;
    }

    // Fetch fresh chat ID
    console.log('[X1Flox UI] Fetching active chat (cache expired or empty)...');
    const chatResponse = await this.requestFromContentScript({
      type: 'GET_ACTIVE_CHAT'
    }, 15000);

    if (!chatResponse || !chatResponse.success || !chatResponse.data?.chatId) {
      console.error('[X1Flox UI] Nenhum chat ativo selecionado');
      return null;
    }

    // Update cache
    this.cachedChatId = chatResponse.data.chatId;
    this.cachedChatTimestamp = now;
    console.log('[X1Flox UI] Chat ID cached:', this.cachedChatId);

    return this.cachedChatId;
  }

  /**
   * Invalidate chat cache when user changes chat
   * Called by monitorChatChanges when chat changes are detected
   */
  private invalidateChatCache() {
    console.log('[X1Flox UI] Invalidating chat cache');
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
      console.log('[X1Flox UI] Sending message without delay (no popup):', message.type);
      await this.sendMessageDirect(message);
      return;
    }

    // Message has delay - show popup with pause/cancel controls
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // IMPORTANT: Capture chat info NOW (not after delay) - like scripts do
    const chatId = await this.getActiveChatId();
    if (!chatId) {
      console.error('[X1Flox UI] No active chat selected');
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

    console.log('[X1Flox UI] Starting message execution with delay (PARALLEL):', message.type, 'ID:', messageId, 'Chat:', chatName);

    // Execute in background (don't await - allows parallel execution)
    // Pass chatId, chatName, chatPhoto so message goes to correct chat even if user switches
    this.executeMessageWithDelay(message, messageId, chatId, chatName, chatPhoto).catch((error: any) => {
      const errorMessage = error?.message || String(error);
      console.error('[X1Flox UI] Message execution failed:', errorMessage);
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
      document.dispatchEvent(new CustomEvent('X1FloxMessageStart', {
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

      // Process delay in overlay ONLY if there's NO animation
      // If animation exists, page script must handle delay+animation together
      // (animation needs to happen DURING the delay, not after it)
      const hasAnimation = message.showTyping || message.showRecording;

      if (sendDelay > 0 && !hasAnimation) {
        console.log('[X1Flox UI] Waiting', sendDelay, 'ms with pause/cancel support (no animation)...');

        // Break delay into 100ms chunks (like scripts do for pause/cancel responsiveness)
        const chunks = Math.ceil(sendDelay / 100);
        for (let i = 0; i < chunks; i++) {
          const execution = this.messageExecutions.get(messageId);
          if (!execution) break;

          // Check if cancelled
          if (execution.isCancelled) {
            console.log('[X1Flox UI] Message cancelled during delay:', messageId);
            this.messageExecutions.delete(messageId);
            return;
          }

          // Wait if paused
          while (execution.isPaused && !execution.isCancelled) {
            console.log('[X1Flox UI] Message paused, waiting...', messageId);
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Check again after pause
          if (execution.isCancelled) {
            console.log('[X1Flox UI] Message cancelled after pause:', messageId);
            this.messageExecutions.delete(messageId);
            return;
          }

          // Sleep for chunk
          await new Promise(resolve => setTimeout(resolve, Math.min(100, sendDelay - i * 100)));
        }
      } else if (hasAnimation) {
        console.log('[X1Flox UI] Message has animation - page script will handle delay+animation together');
        // Note: Animation must happen during delay, so page script processes both
      }

      // Check one more time before sending
      const execution = this.messageExecutions.get(messageId);
      if (execution?.isCancelled) {
        console.log('[X1Flox UI] Message cancelled before send:', messageId);
        this.messageExecutions.delete(messageId);
        return;
      }

      // Send message to page script
      // IMPORTANT: Use targetChatId (captured at start), not current chat
      console.log('[X1Flox UI] Sending message to target chat:', targetChatId);

      const messageToSend = {
        ...message,
        // If animation: pass original sendDelay (page script handles delay+animation together)
        // If no animation: pass 0 (delay already processed in overlay)
        sendDelay: hasAnimation ? message.sendDelay : 0,
        showTyping: message.showTyping,
        showRecording: message.showRecording
      };

      await this.sendMessageDirect(messageToSend, targetChatId);

      // Clean up execution state
      this.messageExecutions.delete(messageId);

      console.log('[X1Flox UI] ✅ Message sent successfully');

      // Dispatch complete event
      document.dispatchEvent(new CustomEvent('X1FloxMessageComplete', {
        detail: { messageId, success: true }
      }));

    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[X1Flox UI] ❌ Error sending message:', errorMessage);

      // Clean up execution state
      this.messageExecutions.delete(messageId);

      // Dispatch error event
      document.dispatchEvent(new CustomEvent('X1FloxMessageError', {
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
        console.error('[X1Flox UI] Nenhum chat ativo selecionado');
        throw new Error('Nenhum chat ativo selecionado');
      }

      console.log('[X1Flox UI] Sending message to chat:', chatId, 'Type:', message.type);

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

        default:
          console.error('[X1Flox UI] Tipo de mensagem não suportado:', message.type);
          return;
      }

      if (response && response.success) {
        console.log('[X1Flox UI] Message sent successfully');
      } else {
        throw new Error(response?.error || 'Erro ao enviar mensagem');
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[X1Flox UI] Error sending message:', errorMessage);
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
    this.messageStatusPopup.className = 'x1flox-script-popup x1flox-message-popup';
    this.messageStatusPopup.innerHTML = `
      <button class="x1flox-script-popup-close">✕</button>

      <!-- Seção EM ENVIO (MENSAGENS) -->
      <div class="x1flox-script-section">
        <div class="x1flox-script-section-header">
          <span class="x1flox-script-section-title">ENVIANDO MENSAGENS</span>
          <button class="x1flox-script-btn-discrete" data-action="cancel-all-messages">Cancelar Todos</button>
        </div>
        <div class="x1flox-script-section-body" data-section="running-messages"></div>
      </div>

      <!-- Seção ENVIO CONCLUÍDO (MENSAGENS) -->
      <div class="x1flox-script-section">
        <div class="x1flox-script-section-header">
          <span class="x1flox-script-section-title">ENVIO CONCLUÍDO</span>
          <button class="x1flox-script-btn-discrete" data-action="clear-all-messages">Limpar Lista</button>
        </div>
        <div class="x1flox-script-section-body" data-section="completed-messages"></div>
      </div>
    `;

    // Close button
    const closeBtn = this.messageStatusPopup.querySelector('.x1flox-script-popup-close');
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
    card.className = isNewCard ? 'x1flox-script-card new-card' : 'x1flox-script-card';
    card.dataset.messageId = msgExec.id;

    // Mark this card as rendered
    this.renderedCardIds.add(msgExec.id);

    const photoHtml = msgExec.chatPhoto
      ? `<img src="${msgExec.chatPhoto}" alt="${msgExec.chatName}" class="x1flox-script-card-photo">`
      : `<div class="x1flox-script-card-photo-placeholder">${msgExec.chatName.charAt(0).toUpperCase()}</div>`;

    if (isCompleted) {
      // Card concluído (simples - igual scripts)
      card.innerHTML = `
        ${photoHtml}
        <div class="x1flox-script-card-info">
          <div class="x1flox-script-card-contact">${msgExec.chatName}</div>
          <div class="x1flox-script-card-name">${msgExec.messagePreview}</div>
        </div>
        <div class="x1flox-script-card-status">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#00a884">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          <span>enviado</span>
        </div>
        <button class="x1flox-script-btn-discrete" data-action="clear-message" data-id="${msgExec.id}">Limpar</button>
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
          <div class="x1flox-script-card-info">
            <div class="x1flox-script-card-contact">${msgExec.chatName}</div>
            <div class="x1flox-script-card-name">${msgExec.messagePreview}</div>
          </div>
          <div class="x1flox-script-card-timer">${msgExec.elapsedSeconds}s</div>
          <button class="x1flox-script-btn-icon ${buttonClass}" data-action="pause-play-message" data-id="${msgExec.id}" title="${buttonTitle}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              ${pausePlayIcon}
            </svg>
          </button>
          <button class="x1flox-script-btn-discrete" data-action="cancel-message" data-id="${msgExec.id}">Cancelar</button>
        `;

        const pausePlayBtn = card.querySelector('[data-action="pause-play-message"]');
        pausePlayBtn?.addEventListener('click', () => this.togglePauseMessage(msgExec.id));

        const cancelBtn = card.querySelector('[data-action="cancel-message"]');
        cancelBtn?.addEventListener('click', () => this.cancelMessage(msgExec.id));
      } else {
        // Sem delay - layout simples
        card.innerHTML = `
          ${photoHtml}
          <div class="x1flox-script-card-info">
            <div class="x1flox-script-card-contact">${msgExec.chatName}</div>
            <div class="x1flox-script-card-name">${msgExec.messagePreview}</div>
          </div>
          <div class="x1flox-script-card-progress">Enviando...</div>
          <button class="x1flox-script-btn-discrete" data-action="cancel-message" data-id="${msgExec.id}">Cancelar</button>
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
      console.log('[X1Flox UI] Message resumed:', messageId);
    } else {
      // Pause
      execution.isPaused = true;
      this.stopMessageTimer(messageId); // Stop timer
      console.log('[X1Flox UI] Message paused:', messageId);
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
    console.log('[X1Flox UI] Message cancelled:', messageId);
  }

  /**
   * Cancel all running messages
   */
  private cancelAllMessages() {
    this.runningMessages.forEach((_, messageId) => {
      this.cancelMessage(messageId);
    });
    console.log('[X1Flox UI] All messages cancelled');
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
    console.log('[X1Flox UI] Completed message cleared:', messageId);
  }

  /**
   * Clear all completed messages
   */
  private clearAllCompletedMessages() {
    const completedSection = this.messageStatusPopup?.querySelector('[data-section="completed-messages"]');
    const cards = completedSection?.querySelectorAll('.x1flox-script-card') || [];

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
    console.log('[X1Flox UI] All completed messages cleared');
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

      console.log('[X1Flox UI] Positioning message popup below script popup:', {
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

      console.log('[X1Flox UI] Positioning message popup (script not open):', { top, left, maxHeight, availableSpace });

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
      // NOTE: Do NOT dispatch X1FloxScriptStart here!
      // The content script (executeScriptWithSteps) will dispatch it to avoid duplication

      // Get active chat using cache for performance
      console.log('[X1Flox UI] Getting active chat for script execution...');
      const chatId = await this.getActiveChatId();

      if (!chatId) {
        throw new Error('Nenhum chat ativo selecionado');
      }

      console.log('[X1Flox UI] Active chat:', chatId);

      // Build full steps with message data
      // Steps from database have { messageId, delayAfter }
      // Need to transform to { message: {...}, delayAfter }
      console.log('[X1Flox UI] Loading message data for steps...');
      console.log('[X1Flox UI] Script has', script.steps.length, 'steps');
      console.log('[X1Flox UI] Available messages:', this.messages.length);

      // If no messages loaded, try to reload data first
      if (this.messages.length === 0) {
        console.log('[X1Flox UI] ⚠️ No messages loaded, attempting to reload data...');
        await this.loadData();
        console.log('[X1Flox UI] After reload: Available messages:', this.messages.length);
      }

      const fullSteps = await Promise.all(script.steps.map(async (step) => {
        const messageId = (step as any).messageId;
        const message = this.messages.find(m => m.id === messageId);

        if (!message) {
          console.error('[X1Flox UI] ❌ Message not found!');
          console.error('[X1Flox UI] Looking for message ID:', messageId);
          console.error('[X1Flox UI] Available message IDs:', this.messages.map(m => m.id));
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

        return {
          message: {
            type: message.type,
            content: message.content,
            caption: message.caption,
            audioData,
            duration: message.duration,
            imageData,
            videoData
          },
          delayAfter: (step as any).delayAfter
        };
      }));

      // Execute script via content script
      // Use a very long timeout for script execution to support pause/resume functionality
      // Scripts can be paused indefinitely by the user, so a short timeout would cause false errors
      // Each individual message already has its own timeout (90s-150s depending on type)
      // User can manually cancel if needed via the UI controls
      console.log('[X1Flox UI] Executing script with', fullSteps.length, 'steps');
      const response = await this.requestFromContentScript({
        type: 'EXECUTE_SCRIPT',
        payload: {
          scriptId: scriptId, // Include scriptId for progress tracking
          steps: fullSteps,
          chatId: chatId,
          scriptName: script.name
        }
      }, 24 * 60 * 60 * 1000); // 24 hours timeout (effectively infinite for user-controlled scripts)

      // NOTE: Do NOT dispatch X1FloxScriptComplete here!
      // The content script (executeScriptWithSteps) already dispatches it
      // Dispatching here would create duplicate cards in the completed section

      if (!response || !response.success) {
        // Check if this is a user cancellation (not an error)
        if (response?.error === 'Script cancelled by user') {
          console.log('[X1Flox UI] Script cancelled by user');
          return; // Exit silently - cancellation is not an error
        }

        // Check if this is a timeout
        if (response?.isTimeout) {
          const timeoutError = 'Script execution timeout. The script may be too large or WhatsApp is not responding.';
          console.warn('[X1Flox UI] Script timeout:', response.error);
          document.dispatchEvent(new CustomEvent('X1FloxScriptError', {
            detail: { scriptId, error: timeoutError }
          }));
          return; // Exit without throwing - timeout is logged as warning
        }

        throw new Error(response?.error || 'Erro ao executar script');
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[X1Flox UI] Error executing script:', errorMessage, error);

      // Only dispatch error if script hasn't started yet (no card created)
      // If script is running, executeScriptWithSteps will dispatch the error
      document.dispatchEvent(new CustomEvent('X1FloxScriptError', {
        detail: { scriptId, error: errorMessage }
      }));
    }
  }

  // FAB methods commented out - not used in new design
  // private createFAB(text: string) {
  //   if (this.fab) this.fab.remove();
  //   this.fab = document.createElement('div');
  //   this.fab.className = 'x1flox-fab';
  //   this.fab.innerHTML = `
  //     <svg class="x1flox-fab-icon" viewBox="0 0 24 24" fill="currentColor">
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
  //     this.fab.style.animation = 'x1flox-slide-out 0.3s ease';
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
    console.log('[X1Flox UI] Getting chat photo from DOM...');

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
        console.log('[X1Flox UI] Found chat photo from selector:', selector, '→', img.src);
        return img.src;
      }
    }

    console.log('[X1Flox UI] No chat photo found in DOM');
    return undefined;
  }

  private createStatusPopup() {
    // Remove existing popup
    if (this.statusPopup) this.statusPopup.remove();

    this.statusPopup = document.createElement('div');
    this.statusPopup.className = 'x1flox-script-popup';
    this.statusPopup.innerHTML = `
      <button class="x1flox-script-popup-close">✕</button>

      <!-- Seção EM ENVIO -->
      <div class="x1flox-script-section">
        <div class="x1flox-script-section-header">
          <span class="x1flox-script-section-title">EM ENVIO (SCRIPTS/GATILHOS)</span>
          <button class="x1flox-script-btn-discrete" data-action="cancel-all">Cancelar Todos</button>
        </div>
        <div class="x1flox-script-section-body" data-section="running"></div>
      </div>

      <!-- Seção ENVIO CONCLUÍDO -->
      <div class="x1flox-script-section">
        <div class="x1flox-script-section-header">
          <span class="x1flox-script-section-title">ENVIO CONCLUÍDO</span>
          <button class="x1flox-script-btn-discrete" data-action="clear-all">Limpar Lista</button>
        </div>
        <div class="x1flox-script-section-body" data-section="completed"></div>
      </div>
    `;

    // Close button
    const closeBtn = this.statusPopup.querySelector('.x1flox-script-popup-close');
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
  //   const titleEl = this.statusPopup.querySelector('.x1flox-status-title');
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
    card.className = isNewCard ? 'x1flox-script-card new-card' : 'x1flox-script-card';
    card.dataset.scriptId = scriptExec.id;

    // Mark this card as rendered
    this.renderedCardIds.add(scriptExec.id);

    const photoHtml = scriptExec.chatPhoto
      ? `<img src="${scriptExec.chatPhoto}" alt="${scriptExec.chatName}" class="x1flox-script-card-photo">`
      : `<div class="x1flox-script-card-photo-placeholder">${scriptExec.chatName.charAt(0).toUpperCase()}</div>`;

    const progress = `${scriptExec.completedSteps}/${scriptExec.totalSteps}`;

    if (isCompleted) {
      // Card concluído
      card.innerHTML = `
        ${photoHtml}
        <div class="x1flox-script-card-info">
          <div class="x1flox-script-card-contact">${scriptExec.chatName}</div>
          <div class="x1flox-script-card-name">★ ${scriptExec.scriptName}</div>
        </div>
        <div class="x1flox-script-card-progress">${progress}</div>
        <div class="x1flox-script-card-status">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#00a884">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          <span>enviado</span>
        </div>
        <button class="x1flox-script-btn-discrete" data-action="clear" data-id="${scriptExec.id}">Limpar</button>
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
        <div class="x1flox-script-card-info">
          <div class="x1flox-script-card-contact">${scriptExec.chatName}</div>
          <div class="x1flox-script-card-name">★ ${scriptExec.scriptName}</div>
        </div>
        <div class="x1flox-script-card-progress">${progress}</div>
        <div class="x1flox-script-card-timer">${scriptExec.elapsedSeconds}s</div>
        <button class="x1flox-script-btn-icon ${buttonClass}" data-action="pause-play" data-id="${scriptExec.id}" title="${isPaused ? 'Continuar' : 'Pausar'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            ${pausePlayIcon}
          </svg>
        </button>
        <button class="x1flox-script-btn-discrete" data-action="cancel" data-id="${scriptExec.id}">Cancelar</button>
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
      console.log('[X1Flox UI] Script paused:', scriptId);

      // Dispatch event to pause script execution in content script
      document.dispatchEvent(new CustomEvent('X1FloxPauseScript', {
        detail: { scriptId }
      }));
    } else if (scriptExec.status === 'paused') {
      scriptExec.status = 'running';
      this.startScriptTimer(scriptId);
      console.log('[X1Flox UI] Script resumed:', scriptId);

      // Dispatch event to resume script execution in content script
      document.dispatchEvent(new CustomEvent('X1FloxResumeScript', {
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
    document.dispatchEvent(new CustomEvent('X1FloxCancelScript', {
      detail: { scriptId }
    }));

    console.log('[X1Flox UI] Script cancelled:', scriptId);
  }

  private cancelAllScripts() {
    this.runningScripts.forEach((_, scriptId) => {
      this.cancelScript(scriptId);
    });
    console.log('[X1Flox UI] All scripts cancelled');
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
    console.log('[X1Flox UI] Completed script cleared:', scriptId);
  }

  private clearAllCompleted() {
    // Find all completed cards and animate them out
    const completedSection = this.statusPopup?.querySelector('[data-section="completed"]');
    const cards = completedSection?.querySelectorAll('.x1flox-script-card') || [];

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
    console.log('[X1Flox UI] All completed scripts cleared');
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
        const timerEl = card?.querySelector('.x1flox-script-card-timer');
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
      console.log('[X1Flox UI] Script not found in running scripts:', scriptId);
      return;
    }

    // Don't move paused scripts to completed
    if (scriptExec.status === 'paused') {
      console.log('[X1Flox UI] Script is paused, not moving to completed:', scriptId);
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
        console.log('[X1Flox UI] Script moved to completed:', scriptId);
      }, 300); // Match animation duration (0.3s)
    } else {
      // If card not found, move immediately
      scriptExec.status = 'completed';
      this.completedScripts.push(scriptExec);
      this.runningScripts.delete(scriptId);
      this.renderedCardIds.delete(scriptId);
      this.updateStatusPopup();
      console.log('[X1Flox UI] Script moved to completed:', scriptId);
    }
  }

  // Not used in new design
  // private getStatusIcon(status: 'sending' | 'success' | 'error'): string {
  //   const icons = {
  //     sending: '<svg class="x1flox-status-icon sending" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8Z"/></svg>',
  //     success: '<svg class="x1flox-status-icon success" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  //     error: '<svg class="x1flox-status-icon error" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>'
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

  private createTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'x1flox-tooltip';
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
    const barInDOM = document.querySelector('.x1flox-shortcut-bar');
    if (!barInDOM && this.shortcutBar) {
      console.log('[X1Flox UI] Shortcut bar was removed from DOM, recreating...');
      this.ensureShortcutBarInDOM();
    }

    const main = document.querySelector('#main');
    const hasActiveChat = main && main.querySelector('[data-tab]');
    const shouldShowShortcuts = hasActiveChat && this.showShortcuts;
    const currentValue = document.body.getAttribute('data-x1flox-chat-active');
    const newValue = shouldShowShortcuts ? 'true' : 'false';

    // Detect chat changes and invalidate cache
    const currentChatElement = main?.querySelector('[data-tab]');
    if (currentChatElement && currentChatElement !== this.lastKnownChatElement) {
      console.log('[X1Flox UI] Chat changed detected, invalidating cache');
      this.invalidateChatCache();
      this.lastKnownChatElement = currentChatElement;
    } else if (!currentChatElement && this.lastKnownChatElement) {
      // Chat closed
      console.log('[X1Flox UI] Chat closed, invalidating cache');
      this.invalidateChatCache();
      this.lastKnownChatElement = null;
    }

    if (currentValue !== newValue) {
      console.log('[X1Flox UI] Updating shortcut bar visibility:', newValue);
      document.body.setAttribute('data-x1flox-chat-active', newValue);
    }
  }

  private ensureShortcutBarInDOM() {
    if (!this.shortcutBar) return;

    // Try to find WhatsApp footer and insert shortcut bar inside it
    const footer = document.querySelector('#main footer');
    if (footer && !footer.contains(this.shortcutBar)) {
      console.log('[X1Flox UI] Reinserting shortcut bar into footer');
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
    document.addEventListener('X1FloxScriptStart', async (event: any) => {
      const { scriptName, totalSteps, scriptId, targetChatId, targetChatName, targetChatPhoto } = event.detail;
      console.log('[X1Flox UI] Script started:', scriptName, 'with', totalSteps, 'steps');

      // Determine which chat to show
      let chatName: string;
      let chatPhoto: string | undefined;

      if (targetChatName) {
        // Use provided target chat info (from trigger or specific execution)
        chatName = targetChatName;
        chatPhoto = targetChatPhoto; // Use photo from trigger/execution
        console.log('[X1Flox UI] Using target chat:', chatName, 'ID:', targetChatId, 'Photo:', !!chatPhoto);
      } else {
        // Get active chat info (for popup manual execution) with extended timeout
        const chatResponse = await this.requestFromContentScript({ type: 'GET_ACTIVE_CHAT' }, 15000);
        chatName = chatResponse?.data?.chatName || 'Chat';
        chatPhoto = chatResponse?.data?.chatPhoto || this.getChatPhoto();
        console.log('[X1Flox UI] Using active chat:', chatName);
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
        console.log('[X1Flox UI] Script execution popup is disabled in settings');
      }
    });

    // Listen for script progress
    document.addEventListener('X1FloxScriptProgress', (event: any) => {
      const { scriptId, step, status } = event.detail;
      console.log('[X1Flox UI] Script progress - scriptId:', scriptId, 'step:', step, 'status:', status);

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
    document.addEventListener('X1FloxScriptComplete', (event: any) => {
      const { scriptId, success } = event.detail;
      console.log('[X1Flox UI] Script completed:', scriptId, success);

      if (success) {
        this.moveToCompleted(scriptId);
      }
    });

    // Listen for script errors
    document.addEventListener('X1FloxScriptError', (event: any) => {
      const { scriptId, error } = event.detail;
      console.log('[X1Flox UI] Script error:', scriptId, error);

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
    document.addEventListener('X1FloxMessageStart', (event: any) => {
      const { messageId, messagePreview, messageType, chatName, chatPhoto, hasDelay, sendDelay } = event.detail;
      console.log('[X1Flox UI] Message started:', messagePreview);

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
        console.log('[X1Flox UI] Message execution popup is disabled in settings');
      }
    });

    // Listen for message completion
    document.addEventListener('X1FloxMessageComplete', (event: any) => {
      const { messageId, success } = event.detail;
      console.log('[X1Flox UI] Message completed:', messageId, success);

      if (success) {
        this.moveMessageToCompleted(messageId);
      }
    });

    // Listen for message errors
    document.addEventListener('X1FloxMessageError', (event: any) => {
      const { messageId, error } = event.detail;
      console.log('[X1Flox UI] Message error:', messageId, error);

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
    document.addEventListener('X1FloxSendSingleMessageFromPopup', async (event: any) => {
      const { message } = event.detail;
      console.log('[X1Flox UI] Single message request from popup:', message);

      if (!message) {
        console.error('[X1Flox UI] No message provided in event');
        return;
      }

      // Message media data (audio/image/video) comes as base64 from popup
      // (converted before sending to survive CustomEvent serialization)
      // Call sendSingleMessage() which will:
      // 1. Capture chat info
      // 2. Create execution state
      // 3. Dispatch X1FloxMessageStart event
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
        const timerEl = card?.querySelector('.x1flox-script-card-timer');
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
      console.log('[X1Flox UI] Message not found in running messages:', messageId);
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
        console.log('[X1Flox UI] Message moved to completed:', messageId);
      }, 300);
    } else {
      msgExec.status = 'completed';
      this.completedMessages.push(msgExec);
      this.runningMessages.delete(messageId);
      this.renderedCardIds.delete(messageId);
      if (this.showMessageExecutionPopup) {
        this.updateMessageStatusPopup();
      }
      console.log('[X1Flox UI] Message moved to completed:', messageId);
    }
  }

  private listenForSettingsChanges() {
    // Listen for settings updates from content script
    console.log('[X1Flox UI] Setting up X1FloxSettingsChanged listener...');
    document.addEventListener('X1FloxSettingsChanged', (event: any) => {
      console.log('[X1Flox UI] ⚙️ X1FloxSettingsChanged event received!');
      const { settings } = event.detail;
      console.log('[X1Flox UI] Settings changed:', settings);

      if (settings) {
        // Update local settings
        if (settings.requireSendConfirmation !== undefined) {
          this.requireConfirmation = settings.requireSendConfirmation;
          console.log('[X1Flox UI] Updated requireConfirmation:', this.requireConfirmation);
        }

        if (settings.showShortcuts !== undefined) {
          const oldValue = this.showShortcuts;
          this.showShortcuts = settings.showShortcuts;
          console.log('[X1Flox UI] Updated showShortcuts:', oldValue, '→', this.showShortcuts);

          // Update shortcut bar visibility immediately
          console.log('[X1Flox UI] Calling updateShortcutBarVisibility()...');
          this.updateShortcutBarVisibility();
          console.log('[X1Flox UI] ✅ Visibility updated');
        }

        if (settings.showScriptExecutionPopup !== undefined) {
          const oldValue = this.showScriptExecutionPopup;
          this.showScriptExecutionPopup = settings.showScriptExecutionPopup;
          console.log('[X1Flox UI] Updated showScriptExecutionPopup:', oldValue, '→', this.showScriptExecutionPopup);

          // If popup was just disabled, hide it (but keep tracking scripts)
          if (!this.showScriptExecutionPopup && this.statusPopup) {
            console.log('[X1Flox UI] Hiding status popup (disabled in settings)');
            this.closeStatusPopup();
          }
          // If popup was just enabled and there are running scripts, show it
          else if (this.showScriptExecutionPopup && this.runningScripts.size > 0 && !this.statusPopup) {
            console.log('[X1Flox UI] Creating status popup (enabled in settings with running scripts)');
            this.createStatusPopup();
            this.updateStatusPopup();
          }
        }

        if (settings.showMessageExecutionPopup !== undefined) {
          const oldValue = this.showMessageExecutionPopup;
          this.showMessageExecutionPopup = settings.showMessageExecutionPopup;
          console.log('[X1Flox UI] Updated showMessageExecutionPopup:', oldValue, '→', this.showMessageExecutionPopup);
        }
      }
    });
    console.log('[X1Flox UI] ✅ X1FloxSettingsChanged listener registered');
  }

  private listenForDataChanges() {
    // Listen for data updates (messages, scripts, tags) from content script
    console.log('[X1Flox UI] Setting up X1FloxDataChanged listener...');
    document.addEventListener('X1FloxDataChanged', (event: any) => {
      console.log('[X1Flox UI] 📊 X1FloxDataChanged event received!');
      const { messagesChanged, scriptsChanged, tagsChanged } = event.detail;
      console.log('[X1Flox UI] Changes:', { messagesChanged, scriptsChanged, tagsChanged });

      // Reload data and refresh UI
      console.log('[X1Flox UI] Refreshing UI overlay with new data...');
      this.refresh();
      console.log('[X1Flox UI] ✅ UI overlay refreshed');
    });
    console.log('[X1Flox UI] ✅ X1FloxDataChanged listener registered');
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
(window as any).x1floxUI = WhatsAppUIOverlay;
