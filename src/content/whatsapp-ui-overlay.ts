/**
 * PrinChat UI Overlay
 * Injects custom UI components into WhatsApp Web interface
 */
// import { prinChatStore } from './whatsapp-store-accessor'; // Unused
// import { syncService } from '../services/sync-service'; // Removed to prevent split-brain DB
// import { db } from '../storage/db'; // Unused in UI (Delegated to Background)
import Sortable from 'sortablejs';

interface Script {
  id: string;
  name: string;
  steps: any[];
}

interface Message {
  id: string;
  name?: string;
  content: string;
  type: string;
  caption?: string;
  audioData?: string | Blob | null;
  audioUrl?: string; // Cloud URL
  duration?: number;
  // Extra fields for other types
  imageData?: string | Blob | null;
  imageUrl?: string;
  videoData?: string | Blob | null;
  videoUrl?: string;
  fileData?: string | Blob | null;
  fileUrl?: string;
  fileName?: string;
  showTyping?: boolean;
  showRecording?: boolean;
  sendDelay?: number;
}

// Signature interface (inline to avoid import issues)
interface Signature {
  id: string;
  text: string;
  formatting: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    monospace: boolean;
  };
  spacing: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

interface Schedule {
  id: string;
  chatId: string;
  chatName: string;
  type: 'message' | 'script';
  itemId: string;
  scheduledTime: number;
  status: 'pending' | 'paused' | 'completed' | 'cancelled' | 'failed';
  createdAt: number;
  updatedAt: number;
}

interface Note {
  id: string;
  chatId: string;
  chatName: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}


// Unused interface - commented out to avoid lint error
// interface StatusItem {
//   id: string;
//   type: 'text' | 'audio' | 'image' | 'video' | 'file';
//   status: 'sending' | 'success' | 'error';
//   text: string;
//   error?: string;
// }

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
  private directChatPopup: HTMLElement | null = null; // Direct chat popup
  private profileDropdown: HTMLElement | null = null; // Profile dropdown menu
  private helpPopup: HTMLElement | null = null; // Help popup
  private subscriptionPopup: HTMLElement | null = null; // Subscription popup
  private subscribeFormModal: HTMLElement | null = null; // Subscription form modal
  private scheduleListPopup: HTMLElement | null = null; // Schedule list popup
  private scheduleCreationModal: HTMLElement | null = null; // Schedule creation modal
  private scheduleDeleteConfirmationModal: HTMLElement | null = null; // Schedule delete confirmation modal
  private notesPopup: HTMLElement | null = null; // Notes popup
  private noteEditorModal: HTMLElement | null = null; // Note editor modal
  private tooltip: HTMLElement | null = null;
  private scripts: Script[] = [];
  private messages: Message[] = [];
  private confirmingMessageId: string | null = null;
  private confirmingScriptId: string | null = null;
  private requireConfirmation: boolean = true;
  private globalLabels: any[] = []; // Cached global labels for color/name lookup
  private showShortcuts: boolean = true;
  private showScriptExecutionPopup: boolean = true;
  private showMessageExecutionPopup: boolean = true; // Show popup for delayed messages
  private runningScripts: Map<string, ScriptExecution> = new Map();
  private completedScripts: ScriptExecution[] = [];
  private scriptTimers: Map<string, NodeJS.Timeout> = new Map();
  private renderedCardIds: Set<string> = new Set(); // Track which cards have been rendered to avoid re-animating them
  private renderDebounceTimer: any = null; // Timer for debouncing Kanban renders
  private areKanbanListenersSetup: boolean = false; // Flag to prevent duplicate listeners
  private isSortableInitialized: boolean = false; // Flag to prevent double-init
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

  // Signature Management
  private signatures: Signature[] = [];
  private editingSignatureId: string | null = null;

  // MutationObserver to detect script popup size changes
  private scriptPopupObserver: MutationObserver | null = null;

  private scheduleTimerInterval: NodeJS.Timeout | null = null;
  private globalSchedulesTimerInterval: NodeJS.Timeout | null = null;
  private globalSchedulesData: Schedule[] = [];
  private globalSchedulesPopup: HTMLElement | null = null; // Global schedules popup
  private globalNotesPopup: HTMLElement | null = null; // Global notes popup

  // Kanban System  
  private kanbanOverlay: HTMLElement | null = null; // Fullscreen Kanban overlay
  private isKanbanOpen: boolean = false;

  private currentChatId: string | null = null; // Track current chat ID for sync detection
  private chatCacheInvalidateTimer: NodeJS.Timeout | null = null; // Debounce timer for cache invalidation
  private isRenderingKanban: boolean = false; // Lock to prevent concurrent Kanban renders
  private sortableInstances: Sortable[] = []; // Track SortableJS instances for cleanup
  private instanceId: string = Math.random().toString(36).substring(7); // Debug ID
  private kanbanPollingInterval: NodeJS.Timeout | null = null; // Polling for tag updates
  private lastPolledTags: Map<string, string[]> = new Map(); // Cache of last seen tags per chatId


  constructor() {
    console.log(`[PrinChat UI] 🏁 VERSION CHECK: ${new Date().toISOString()}`);
    console.log(`[PrinChat UI] 🏁 Constructor called. Instance ID: ${this.instanceId}`);
    console.log(`[PrinChat UI] 📍 Location: ${window.location.href}`);
    console.log(`[PrinChat UI] 🖼️ Window Top? ${window.self === window.top}`);
    this.init();
  }

  private async init() {
    try {
      console.log('[PrinChat UI] Initializing overlay...');

      // Wait for WhatsApp to load
      console.log('[PrinChat UI] Step 1: Waiting for WhatsApp to load...');
      await this.waitForWhatsApp();
      console.log('[PrinChat UI] ✓ WhatsApp loaded');

      // Check authentication FIRST - block everything if not authenticated
      console.log('[PrinChat UI] Step 2: Checking authentication...');
      const isAuthenticated = await this.checkAuthViaContentScript();
      console.log('[PrinChat UI] Auth status:', isAuthenticated);

      // Create header (shows login button if not authenticated)
      console.log('[PrinChat UI] Step 3: Creating custom header...');
      await this.createCustomHeader();
      console.log('[PrinChat UI] ✓ Custom header created');

      // If not authenticated, stop here - don't initialize any features
      if (!isAuthenticated) {
        console.log('[PrinChat UI] ⚠️ Not authenticated - blocking all features');
        console.log('[PrinChat UI] ✓ Login-only mode initialized');
        return; // EXIT - no other features should load
      }

      // User is authenticated - continue with full initialization
      console.log('[PrinChat UI] ✅ Authenticated - initializing full features');

      // FINAL BACKUP: If header is missing after 2 seconds, force inject it again
      // This catches cases where createCustomHeader logic failed but didn't crash
      setTimeout(() => {
        if (!document.querySelector('.princhat-custom-header')) {
          console.warn('[PrinChat UI] ⚠️ Header missing in backup check - FORCE INJECTING');
          this.createCustomHeader();
        }
      }, 2000);

      // Load data
      console.log('[PrinChat UI] Step 4: Loading scripts and messages...');
      await this.loadData();

      // TRIGGER CLOUD SYNC (Delegate to Background)
      console.log('[PrinChat UI] Step 4b: Requesting Cloud Sync via Background...');
      this.requestFromContentScript({ type: 'TRIGGER_MANUAL_SYNC' })
        .then(res => console.log('[PrinChat UI] Sync Triggered:', res))
        .catch(err => console.error('[PrinChat UI] Sync Trigger Failed:', err));


      console.log('[PrinChat UI] ✓ Data loaded');

      // Pre-fetch Labels (Non-blocking) so Kanban has colors ready
      console.log('[PrinChat UI] 🏷️ Starting background label fetch...');
      this.requestFromContentScript({ type: 'GET_ALL_LABELS' })
        .then(response => {
          if (response && response.data && response.data.labels) {
            this.globalLabels = response.data.labels;
            console.log('[PrinChat UI] ✅ Background label fetch complete. Count:', this.globalLabels.length);
          }
        })
        .catch(err => console.warn('[PrinChat UI] Background label fetch failed (will retry on open):', err));

      // Update badge counts on load
      this.updateGlobalNotesBadge();
      this.updateGlobalSchedulesBadge();

      console.log('[PrinChat UI] Step 5: Creating shortcut bar...');
      this.createShortcutBar();
      console.log('[PrinChat UI] ✓ Shortcut bar created');

      console.log('[PrinChat UI] Step 6: Creating tooltip...');
      this.createTooltip();
      console.log('[PrinChat UI] ✓ Tooltip created');

      // Monitor chat changes
      console.log('[PrinChat UI] Step 7: Setting up chat monitor...');
      this.monitorChatChanges();

      // Setup navigation detection
      this.detectChatNavigation();

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

      // Inject schedule button into chat header
      console.log('[PrinChat UI] Step 12: Injecting schedule button...');
      this.injectScheduleButton();
      console.log('[PrinChat UI] ✓ Schedule button injected');

      // Inject notes button into chat header
      console.log('[PrinChat UI] Step 12.1: Injecting notes button...');
      this.injectNotesButton();
      console.log('[PrinChat UI] ✓ Notes button injected');

      // Inject Kanban button into WhatsApp sidebar
      console.log('[PrinChat UI] Step 12.2: Injecting Kanban button in sidebar...');
      this.injectKanbanButton();
      console.log('[PrinChat UI] ✓ Kanban button injected');

      // Inject critical Kanban styles (Time badge fix)
      console.log('[PrinChat UI] Step 12.3: Injecting Kanban styles...');
      this.injectKanbanStyles();
      console.log('[PrinChat UI] ✓ Kanban styles injected');

      // Monitor chat header changes
      console.log('[PrinChat UI] Step 13: Setting up chat header monitor...');
      this.monitorChatHeaderChanges();
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
    console.log('[PrinChat UI] waitForWhatsApp - readyState:', document.readyState);
    // WhatsApp Web is a SPA - body is always available when we inject
    // No need to wait for specific elements
    if (document.body) {
      console.log('[PrinChat UI] Body exists, resolving immediately');
      return Promise.resolve();
    }

    // Fallback: wait for body (should never happen)
    console.log('[PrinChat UI] Waiting for body...');
    return new Promise((resolve) => {
      const check = () => {
        if (document.body) {
          console.log('[PrinChat UI] Body found, resolving');
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
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

  /**
   * Send request to content script -> background
   */

  private async requestFromContentScript(message: any, timeoutMs: number = 5000): Promise<any> {
    return new Promise((resolve) => {
      const requestId = `ui-${Date.now()}-${Math.random()}`;
      console.log('[PrinChat UI] Sending request:', message.type, 'with ID:', requestId);

      let timeoutId: ReturnType<typeof setTimeout>; // Declare timeoutId here

      const handler = (event: any) => {
        // console.log('[PrinChat UI] Response event received:', event.detail);
        if (event.detail?.requestId === requestId) {
          // console.log('[PrinChat UI] Response matches request ID:', requestId);
          document.removeEventListener('PrinChatUIResponse', handler);

          const response = event.detail.response;
          resolve(response);
          // Stop timeout
          if (timeoutId) clearTimeout(timeoutId);
        }
      };

      document.addEventListener('PrinChatUIResponse', handler);
      // console.log('[PrinChat UI] Added response listener for:', requestId);

      // Configurable timeout
      timeoutId = setTimeout(() => { // Assign to the declared timeoutId
        console.log('[PrinChat UI] Request timed out:', requestId);
        document.removeEventListener('PrinChatUIResponse', handler);
        resolve({ success: false, error: `Request timeout after ${timeoutMs}ms`, isTimeout: true });
      }, timeoutMs);

      // console.log('[PrinChat UI] Dispatching PrinChatUIRequest event...');
      document.dispatchEvent(new CustomEvent('PrinChatUIRequest', {
        detail: { requestId, message }
      }));
      // console.log('[PrinChat UI] Event dispatched successfully');
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
      // console.log('[PrinChat UI] Using cached chat ID:', this.cachedChatId);
      return this.cachedChatId;
    }

    // Fetch fresh chat ID with retry
    // console.log('[PrinChat UI] Fetching active chat (cache expired or empty)...');

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      // console.log(`[PrinChat UI] Attempt ${attempts}/${maxAttempts} to get active chat...`);

      try {
        const chatResponse = await this.requestFromContentScript({
          type: 'GET_ACTIVE_CHAT'
        }, 20000); // Increased to 20s to allow page script to initialize after reload

        if (chatResponse && chatResponse.success && chatResponse.data?.chatId) {
          // Update cache
          this.cachedChatId = chatResponse.data.chatId;
          this.cachedChatTimestamp = now;
          console.log('[PrinChat UI] Chat ID cached:', this.cachedChatId);
          return this.cachedChatId;
        }

        console.warn(`[PrinChat UI] Attempt ${attempts} failed:`, chatResponse?.error || 'No chat data');

        // Wait before retry (except on last attempt)
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`[PrinChat UI] Attempt ${attempts} error:`, error);
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    console.error('[PrinChat UI] ❌ Falha ao obter chat ativo após', maxAttempts, 'tentativas');
    console.error('[PrinChat UI] 💡 Dica: Certifique-se de que um chat está aberto no WhatsApp Web');
    return null;
  }

  /**
   * Invalidate chat cache when user changes chat
   * Called by monitorChatChanges when chat changes are detected
   */

  private invalidateChatCache() {
    if (this.chatCacheInvalidateTimer) {
      clearTimeout(this.chatCacheInvalidateTimer);
    }

    this.chatCacheInvalidateTimer = setTimeout(() => {
      console.log('[PrinChat UI] Invalidating chat cache (Debounced)');
      this.cachedChatId = null;
      this.cachedChatTimestamp = 0;
    }, 500); // 500ms debounce
  }

  /**
   * Check if current environment is WhatsApp Business
   * URL is often the same (web.whatsapp.com), so we check for specific assets
   */
  private isWhatsAppBusiness(): boolean {
    // Check 1: Hostname (some business versions use business.whatsapp.com)
    if (window.location.hostname.includes('business')) return true;

    // Check 2: Intro image asset (reliable method)
    // Business usually has 'business' in the intro asset name
    const introImg = document.querySelector('[data-asset-intro-image-light]');
    if (introImg) {
      const assetName = introImg.getAttribute('data-asset-intro-image-light') || '';
      if (assetName.includes('business')) return true;
    }

    // Check 3: Check for specific Business UI elements (Catalog icon, etc)
    // This selector targets the catalog icon often present in business header/sidebar
    if (document.querySelector('span[data-icon="business-catalog"]')) return true;

    return false;
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
  private async sendSingleMessage(message: Message, targetChatId?: string) {
    // IMPORTANT: Only show popup for messages with delay
    // Messages without delay are sent directly without popup
    const hasDelay = this.messageHasDelay(message);

    if (!hasDelay) {
      // Send directly without popup (no delay = no need for pause/cancel controls)
      console.log('[PrinChat UI] Sending message without delay (no popup):', message.type);
      await this.sendMessageDirect(message, targetChatId);
      return;
    }

    // Message has delay - show popup with pause/cancel controls
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // IMPORTANT: Capture chat info NOW (not after delay) - like scripts do
    const chatId = targetChatId || await this.getActiveChatId();
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
          let imageData = message.imageData;

          // If no local data, try to fetch from cloud URL
          if (!imageData && message.imageUrl) {
            try {
              // console.log('[PrinChat UI] Requesting image fetch via background:', message.imageUrl);
              const response = await this.requestFromContentScript({
                type: 'FETCH_MEDIA_BLOB',
                payload: { url: message.imageUrl }
              });

              if (response && response.success && response.base64) {
                imageData = response.base64;
              } else {
                throw new Error(response?.error || 'Unknown background fetch error');
              }
            } catch (e) {
              console.error('[PrinChat UI] Failed to fetch image via background:', e);
            }
          }

          if (imageData instanceof Blob) {
            imageData = await this.blobToBase64(imageData);
          }

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
          let videoData = message.videoData;

          // If no local data, try to fetch from cloud URL
          if (!videoData && message.videoUrl) {
            try {
              // console.log('[PrinChat UI] Requesting video fetch via background:', message.videoUrl);
              const response = await this.requestFromContentScript({
                type: 'FETCH_MEDIA_BLOB',
                payload: { url: message.videoUrl }
              });

              if (response && response.success && response.base64) {
                videoData = response.base64;
              } else {
                throw new Error(response?.error || 'Unknown background fetch error');
              }
            } catch (e) {
              console.error('[PrinChat UI] Failed to fetch video via background:', e);
            }
          }

          if (videoData instanceof Blob) {
            videoData = await this.blobToBase64(videoData);
          }
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
          let audioData = message.audioData;

          // If no local data, try to fetch from cloud URL
          // If no local data, try to fetch from cloud URL via Background Worker (Bypass CSP)
          if (!audioData && message.audioUrl) {
            try {
              console.log('[PrinChat UI] Requesting audio fetch via background:', message.audioUrl);
              const response = await this.requestFromContentScript({
                type: 'FETCH_MEDIA_BLOB',
                payload: { url: message.audioUrl }
              });

              if (response && response.success && response.base64) {
                audioData = response.base64;
              } else {
                throw new Error(response?.error || 'Unknown background fetch error');
              }
            } catch (e) {
              console.error('[PrinChat UI] Failed to fetch audio via background:', e);
            }
          }

          if (audioData instanceof Blob) {
            audioData = await this.blobToBase64(audioData);
          }

          if (!audioData) {
            throw new Error('Audio data not found (local or cloud)');
          }

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
          let fileData = message.fileData;

          // If no local data, try to fetch from cloud URL via Background Worker (Bypass CSP)
          if (!fileData && message.fileUrl) {
            try {
              // console.log('[PrinChat UI] Requesting file fetch via background:', message.fileUrl);
              const response = await this.requestFromContentScript({
                type: 'FETCH_MEDIA_BLOB',
                payload: { url: message.fileUrl }
              });

              if (response && response.success && response.base64) {
                fileData = response.base64;
              } else {
                throw new Error(response?.error || 'Unknown background fetch error');
              }
            } catch (e) {
              console.error('[PrinChat UI] Failed to fetch file via background:', e);
            }
          }

          if (fileData instanceof Blob) {
            fileData = await this.blobToBase64(fileData);
          }

          if (!fileData || typeof fileData !== 'string') {
            // ... (keep error handling)
            let errorMsg = 'Arquivo não encontrado ou inválido.';
            if (fileData === null || fileData === undefined) {
              errorMsg = 'O arquivo desta mensagem não foi encontrado.';
            }
            console.error('[PrinChat UI] Valid fileData required. Got:', typeof fileData);
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
 * Helper to scrape header info directly from DOM (Bypassing page script)
 */
  /**
   * Helper to scrape header info directly from DOM (Bypassing page script)
   */
  private scrapeHeaderInfo() {
    let name = '';
    let photo = '';

    try {
      // Robust header search: Try data-testid first (Stable), then ID structure (Legacy/Variable)
      const header = document.querySelector('header[data-testid="conversation-header"]') ||
        document.querySelector('#main > header') ||
        document.querySelector('#main header');

      console.log('[PrinChat UI] 🔍 scrapeHeaderInfo: header found?', !!header);

      if (header) {
        // SCRAPE PHOTO
        // 1. Try finding an image that looks like a profile pic (usually clicked to open profile)
        const profileImg = header.querySelector('img[src^="http"], img[src^="blob:"], img.x1c4vz4f');
        if (profileImg) {
          photo = (profileImg as HTMLImageElement).src;
        }

        // Fallback for photo
        if (!photo) {
          const images = Array.from(header.querySelectorAll('img'));
          for (const img of images) {
            const src = (img as HTMLImageElement).src;
            if (src && !src.includes('data:image/svg') && !src.includes('data:image/gif') && (src.startsWith('blob:') || src.startsWith('http'))) {
              photo = src;
              break;
            }
          }
        }

        // SCRAPE NAME - ROBUST APPROACH
        // WhatsApp frequently changes their class names and attributes, so we need multiple strategies

        // 1. Find the clickable info area (usually has role="button")
        const infoDiv = header.querySelector('div[role="button"]');
        console.log('[PrinChat UI] 🔍 scrapeHeaderInfo: infoDiv found?', !!infoDiv);

        if (infoDiv) {
          // Strategy A: Look for explicit title attribute (Best for Business/Verified)
          const titleSpan = infoDiv.querySelector('span[title]');
          console.log('[PrinChat UI] 🔍 scrapeHeaderInfo: titleSpan found?', !!titleSpan);

          if (titleSpan) {
            const titleAttr = titleSpan.getAttribute('title');
            const textContent = titleSpan.textContent;
            console.log('[PrinChat UI] 🔍 scrapeHeaderInfo: titleAttr=', titleAttr, 'textContent=', textContent);
            name = titleAttr || textContent || '';
          }

          // Strategy B: Get ALL spans (no attribute filter) and find the name
          if (!name || name === 'Chat') {
            console.log('[PrinChat UI] 🔍 scrapeHeaderInfo: Trying Strategy B (all spans)');
            const allSpans = Array.from(infoDiv.querySelectorAll('span'));
            console.log('[PrinChat UI] 🔍 scrapeHeaderInfo: Found', allSpans.length, 'total spans');

            // Look for spans that likely contain the name (not status icons or empty)
            for (const s of allSpans) {
              const t = (s.textContent || '').trim();
              console.log('[PrinChat UI] 🔍 scrapeHeaderInfo: Checking span text:', JSON.stringify(t));

              // Skip empty, status indicators, or very short text
              if (!t || t.length < 2) {
                console.log('[PrinChat UI] 🔍 scrapeHeaderInfo: Skipping (too short/empty)');
                continue;
              }

              // Skip known status texts
              const lowerT = t.toLowerCase();
              if (lowerT.includes('online') ||
                lowerT.includes('visto') ||
                lowerT.includes('digitando') ||
                lowerT.includes('gravando') ||
                lowerT.includes('typing') ||
                lowerT.includes('recording') ||
                t.includes('...')) {
                console.log('[PrinChat UI] 🔍 scrapeHeaderInfo: Skipping (status text)');
                continue;
              }

              // If we found text that looks like a name (has some substance)
              if (t.length >= 3) {
                name = t;
                console.log('[PrinChat UI] ✅ scrapeHeaderInfo: Using name from span:', name);
                break;
              }
            }
          }

          // Strategy C: If still no name, get the first text node from infoDiv directly
          if (!name || name === 'Chat') {
            console.log('[PrinChat UI] 🔍 scrapeHeaderInfo: Trying Strategy C (direct text content)');
            const allText = infoDiv.textContent?.trim() || '';
            console.log('[PrinChat UI] 🔍 scrapeHeaderInfo: infoDiv full text:', JSON.stringify(allText));

            // Split by newlines and take the first substantial line
            const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            for (const line of lines) {
              console.log('[PrinChat UI] 🔍 scrapeHeaderInfo: Checking line:', JSON.stringify(line));
              const lowerLine = line.toLowerCase();

              // Skip status lines
              if (lowerLine.includes('online') ||
                lowerLine.includes('visto') ||
                lowerLine.includes('digitando') ||
                lowerLine.includes('gravando') ||
                line.includes('...')) {
                continue;
              }

              if (line.length >= 3) {
                name = line;
                console.log('[PrinChat UI] ✅ scrapeHeaderInfo: Using name from text content:', name);
                break;
              }
            }
          }
        }

        // Final sanity check: if name looks like a status, clear it
        if (name && (name.toLowerCase().startsWith('visto por') || name.toLowerCase() === 'online' || name.toLowerCase().startsWith('click here'))) {
          console.log('[PrinChat UI] ⚠️ scrapeHeaderInfo: Name looks like status, clearing:', name);
          name = '';
        }

        console.log('[PrinChat UI] 🎯 scrapeHeaderInfo FINAL result:', { name, photo: !!photo });
      }
    } catch (e) {
      console.error('[PrinChat UI] ❌ Error scraping header info:', e);
    }

    return { name, photo };
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
      clearBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearCompletedMessage(msgExec.id);
      });
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
      }
    }

    // Async update of chat info for ALL cards (Running or Completed)
    // We do this AFTER creating the card to not block the UI
    // Ensure we check even if completed to catch up missing info
    if (msgExec.chatName === 'Chat' || !msgExec.chatPhoto) {
      // DIRECT DOM SCRAPE FIRST (Most reliable given WPP errors)
      const scraped = this.scrapeHeaderInfo();

      if (scraped.name || scraped.photo) {
        // Update local object immediately for persistence
        if (scraped.name) msgExec.chatName = scraped.name;
        if (scraped.photo) msgExec.chatPhoto = scraped.photo;

        // Apply immediately to DOM
        if (scraped.name && card.isConnected) {
          const nameEl = card.querySelector('.princhat-script-card-contact');
          if (nameEl && ((nameEl.textContent === 'Chat' || nameEl.textContent === 'Unknown'))) {
            nameEl.textContent = scraped.name;
          }
        }
        if (scraped.photo && card.isConnected) {
          const photoPlaceholder = card.querySelector('.princhat-script-card-photo-placeholder');
          if (photoPlaceholder) {
            const img = document.createElement('img');
            img.src = scraped.photo;
            img.alt = scraped.name || 'Contact';
            img.className = 'princhat-script-card-photo';
            photoPlaceholder.replaceWith(img);
          }
        }
      }

      this.requestFromContentScript({ type: 'GET_ACTIVE_CHAT' }).then(response => {
        if (response?.success && response.data) {
          const realName = response.data.chatName || response.data.name || scraped.name;
          const realPhoto = response.data.chatPhoto || scraped.photo;

          // Update local object for persistence
          if (realName) msgExec.chatName = realName;
          if (realPhoto) msgExec.chatPhoto = realPhoto;

          // Update DOM if card still exists
          if (card.isConnected) {
            // Update Name
            if (realName && realName !== 'Chat' && realName !== 'Unknown') {
              const nameEl = card.querySelector('.princhat-script-card-contact');
              if (nameEl) nameEl.textContent = realName;
            }
            // Update Photo
            if (realPhoto) {
              const photoPlaceholder = card.querySelector('.princhat-script-card-photo-placeholder');
              // Re-query in case it was already replaced by scrape
              const existingImg = card.querySelector('img.princhat-script-card-photo');

              if (photoPlaceholder) {
                const img = document.createElement('img');
                img.src = realPhoto;
                img.alt = realName || 'Contact';
                img.className = 'princhat-script-card-photo';
                photoPlaceholder.replaceWith(img);
              } else if (existingImg && (existingImg as HTMLImageElement).src !== realPhoto) {
                // Update existing image if new one is different
                (existingImg as HTMLImageElement).src = realPhoto;
              }
            }
          }
        }
      });
    }

    const pausePlayBtn = card.querySelector('[data-action="pause-play-message"]');
    pausePlayBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePauseMessage(msgExec.id);
    });

    const cancelBtn = card.querySelector('[data-action="cancel-message"]');
    cancelBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelMessage(msgExec.id);
    });

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
  /**
   * Update pause/play icon in all popups for a message
   */
  private updateMessagePausePlayIcon(id: string, isPaused: boolean) {
    console.log(`[PrinChat UI] 🔄 updateMessagePausePlayIcon called: ${id}, isPaused = ${isPaused}`);
    const pauseIcon = `<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>`;
    const playIcon = `<path d="M8 5v14l11-7z"/>`;
    const iconContent = isPaused ? playIcon : pauseIcon; // Use icon content directly inside svg

    // Update in floating popup
    // Note: The card selector might need to match how createMessageCard sets it. 
    // In createMessageCard: card.dataset.messageId = msgExec.id; -> [data-message-id="..."]
    const card = this.messageStatusPopup?.querySelector(`[data-message-id="${id}"]`);
    if (card) {
      const btnSvg = card.querySelector('[data-action="pause-play-message"] svg');
      if (btnSvg) btnSvg.innerHTML = iconContent;

      // Also update title
      const btn = card.querySelector('[data-action="pause-play-message"]');
      if (btn) btn.setAttribute('title', isPaused ? 'Continuar' : 'Pausar');

      // Update class
      if (btn) {
        btn.classList.toggle('paused', isPaused);
        btn.classList.toggle('running', !isPaused);
      }
    }

    // Update in executions popup (if using same structure)
    // The createMessageCard is likely reused or similar.
    // Let's assume createMessageCard structure is consistent.
    if (this.executionsPopup) {
      // The executions popup might render differently or use same card logic.
      // Based on previous reads, createMessageExecutions also calls createMessageCard.
      const execCard = this.executionsPopup.querySelector(`[data-message-id="${id}"]`);
      if (execCard) {
        const execBtnSvg = execCard.querySelector('[data-action="pause-play-message"] svg');
        if (execBtnSvg) execBtnSvg.innerHTML = iconContent;

        // Also update title
        const execBtn = execCard.querySelector('[data-action="pause-play-message"]');
        if (execBtn) execBtn.setAttribute('title', isPaused ? 'Continuar' : 'Pausar');

        // Update class
        if (execBtn) {
          execBtn.classList.toggle('paused', isPaused);
          execBtn.classList.toggle('running', !isPaused);
        }
      }
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
    const card = this.messageStatusPopup?.querySelector(`[data - message - id= "${messageId}"]`) as HTMLElement;
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

    const card = this.messageStatusPopup?.querySelector(`[data - message - id= "${messageId}"]`) as HTMLElement;
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
      this.messageStatusPopup.style.top = `${top} px`;
      this.messageStatusPopup.style.left = `${left} px`;
      this.messageStatusPopup.style.width = '420px';
      this.messageStatusPopup.style.maxHeight = `${maxHeight} px`;
      this.messageStatusPopup.style.zIndex = '1003'; // Above script popup (1002)

      // Set CSS custom properties for close button positioning
      this.messageStatusPopup.style.setProperty('--popup-top', `${top} px`);
      this.messageStatusPopup.style.setProperty('--popup-right', `${right} px`);
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
      this.messageStatusPopup.style.top = `${top} px`;
      this.messageStatusPopup.style.left = `${left} px`;
      this.messageStatusPopup.style.width = '420px';
      this.messageStatusPopup.style.maxHeight = `${maxHeight} px`;
      this.messageStatusPopup.style.zIndex = '1003'; // Above script popup (1002)

      // Set CSS custom properties for close button positioning
      this.messageStatusPopup.style.setProperty('--popup-top', `${top} px`);
      this.messageStatusPopup.style.setProperty('--popup-right', `${right} px`);
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
    const scriptId = `script - ${Date.now()} -${Math.random().toString(36).substr(2, 9)} `;

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
          throw new Error(`Message ${messageId} not found.Recarregue a página do WhatsApp Web.`);
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
      clearBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearCompletedScript(scriptExec.id);
      });
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
      pausePlayBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePauseScript(scriptExec.id);
      });

      const cancelBtn = card.querySelector('[data-action="cancel"]');
      cancelBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cancelScript(scriptExec.id);
      });
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
      // Simple iframe structure - close button is now inside the iframe
      this.headerPopup.innerHTML = `
        <div style="width: 100%; height: 100%; overflow: hidden; border-radius: 8px;">
          <iframe
            src="${popupUrl}"
            frameborder="0"
            style="width: 100%; height: 100%; border: none;"
          ></iframe>
        </div>
      `;

      // Add close button handler
      const closeBtn = this.headerPopup.querySelector('.princhat-popup-close-btn');
      closeBtn?.addEventListener('click', () => {
        console.log('[PrinChat UI] Close button clicked');
        this.toggleHeaderPopup(false);
      });
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

    if (shouldShow) {
      // Close other global popups first (but keep header popup open since we are opening it)
      this.closeHeaderPopups(true);
    }

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

    this.closeAllGlobalPopups();

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
      },
      {
        id: '4',
        type: 'promo',
        icon: '🎁',
        title: 'Oferta Exclusiva',
        message: 'Aproveite nosso plano premium com recursos ilimitados.',
        timestamp: Date.now() - 7200000 // 2h atrás
      },
      {
        id: '5',
        type: 'update',
        icon: '✨',
        title: 'Novo Recurso',
        message: 'Agora você pode agendar mensagens para envio automático.',
        timestamp: Date.now() - 10800000 // 3h atrás
      },
      {
        id: '6',
        type: 'alert',
        icon: '📢',
        title: 'Comunicado Importante',
        message: 'Novos termos de serviço entrarão em vigor no próximo mês.',
        timestamp: Date.now() - 259200000 // 3 dias atrás
      },
      {
        id: '7',
        type: 'promo',
        icon: '💰',
        title: 'Cashback Disponível',
        message: 'Você tem R$ 25,00 de cashback para usar na próxima renovação.',
        timestamp: Date.now() - 14400000 // 4h atrás
      },
      {
        id: '8',
        type: 'update',
        icon: '🚀',
        title: 'Performance Melhorada',
        message: 'O sistema agora está 3x mais rápido no envio de mensagens.',
        timestamp: Date.now() - 345600000 // 4 dias atrás
      },
      {
        id: '9',
        type: 'alert',
        icon: '🔒',
        title: 'Segurança',
        message: 'Ative a autenticação de dois fatores para mais segurança.',
        timestamp: Date.now() - 432000000 // 5 dias atrás
      },
      {
        id: '10',
        type: 'promo',
        icon: '🌟',
        title: 'Upgrade Premium',
        message: 'Desbloqueie todos os recursos com nosso plano anual.',
        timestamp: Date.now() - 18000000 // 5h atrás
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
        <div class="princhat-notifications-header-actions">
          <button class="princhat-notifications-clear-all">Limpar tudo</button>
          <button class="princhat-popup-close-btn" title="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
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

      // Hide badge
      const badge = button.querySelector('.princhat-notification-badge') as HTMLElement;
      if (badge) {
        badge.style.display = 'none';
      }
    });

    // Close button handler
    const closeBtn = dropdown.querySelector('.princhat-popup-close-btn');
    closeBtn?.addEventListener('click', () => {
      dropdown.remove();
      button.classList.remove('active');
    });

    // Close individual notification
    dropdown.querySelectorAll('.princhat-notification-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = (e.target as HTMLElement).closest('.princhat-notification-item');
        if (item) {
          item.remove();

          // Update badge count
          const badge = button.querySelector('.princhat-notification-badge') as HTMLElement;
          const remainingItems = dropdown.querySelectorAll('.princhat-notification-item');
          const count = remainingItems.length;

          if (badge) {
            if (count === 0) {
              badge.style.display = 'none';
            } else {
              badge.textContent = count > 9 ? '9+' : count.toString();
            }
          }

          // Check if list is empty
          if (count === 0) {
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
      let target = e.target as HTMLElement;
      if (target.nodeType === Node.TEXT_NODE) {
        target = target.parentElement as HTMLElement;
      }
      if (!target || !target.closest) return;

      // Don't close if clicking inside popup, on button, or on any modal
      const isModal = target.closest('.princhat-modal-overlay') ||
        target.closest('.princhat-note-editor-modal') ||
        target.closest('.princhat-calendar-modal-overlay') ||
        target.closest('.princhat-schedule-modal') ||
        target.closest('.princhat-confirmation-modal');

      if (!dropdown.contains(target) && !button.contains(target) && !isModal) {
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
   * Toggle direct chat popup for starting a conversation with a phone number
   */
  private toggleDirectChatPopup(button: HTMLElement) {
    // Use stored reference instead of querySelector
    if (this.directChatPopup) {
      // Close popup
      this.directChatPopup.remove();
      button.classList.remove('active');
      this.directChatPopup = null;
      return;
    }

    this.closeAllGlobalPopups();

    // Country codes list (Brazil first)
    const countryCodes = [
      { name: 'Brasil', code: '+55', flag: '🇧🇷' },
      { name: 'Estados Unidos', code: '+1', flag: '🇺🇸' },
      { name: 'Argentina', code: '+54', flag: '🇦🇷' },
      { name: 'Chile', code: '+56', flag: '🇨🇱' },
      { name: 'Colômbia', code: '+57', flag: '🇨🇴' },
      { name: 'México', code: '+52', flag: '🇲🇽' },
      { name: 'Portugal', code: '+351', flag: '🇵🇹' },
      { name: 'Espanha', code: '+34', flag: '🇪🇸' },
      { name: 'Alemanha', code: '+49', flag: '🇩🇪' },
      { name: 'França', code: '+33', flag: '🇫🇷' },
      { name: 'Itália', code: '+39', flag: '🇮🇹' },
      { name: 'Reino Unido', code: '+44', flag: '🇬🇧' },
      { name: 'Canadá', code: '+1', flag: '🇨🇦' },
      { name: 'Japão', code: '+81', flag: '🇯🇵' },
      { name: 'China', code: '+86', flag: '🇨🇳' },
      { name: 'Índia', code: '+91', flag: '🇮🇳' },
      { name: 'Austrália', code: '+61', flag: '🇦🇺' }
    ];

    let selectedCountry = countryCodes[0]; // Default to Brazil
    let isDropdownOpen = false;

    // Create popup
    const popup = document.createElement('div');
    popup.className = 'princhat-direct-chat-popup';
    this.directChatPopup = popup;

    // Build popup content
    popup.innerHTML = `
      <div class="princhat-direct-chat-header">
        <h3>Iniciar conversa</h3>
        <button class="princhat-popup-close-btn" title="Fechar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="princhat-direct-chat-form">
        <div class="princhat-direct-chat-field">
          <label class="princhat-direct-chat-label">Código do país</label>
          <div class="princhat-country-selector">
            <button type="button" class="princhat-country-selector-button">
              <span class="princhat-country-selected">
                <span class="princhat-country-flag">${selectedCountry.flag}</span>
                <span class="princhat-country-code">${selectedCountry.code}</span>
                <span class="princhat-country-name">${selectedCountry.name}</span>
              </span>
              <svg class="princhat-country-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <div class="princhat-country-dropdown" style="display: none;">
              ${countryCodes.map(country => `
                <div class="princhat-country-option" data-code="${country.code}" data-name="${country.name}" data-flag="${country.flag}">
                  <span class="princhat-country-flag">${country.flag}</span>
                  <span class="princhat-country-code">${country.code}</span>
                  <span class="princhat-country-name">${country.name}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="princhat-direct-chat-field">
          <label class="princhat-direct-chat-label">Número de celular (WhatsApp)</label>
          <input 
            type="tel" 
            class="princhat-phone-input" 
            placeholder="ex: 21993253978"
            maxlength="15"
          />
        </div>
        <button type="button" class="princhat-start-chat-button" disabled>
          Iniciar conversa
        </button>
      </div>
    `;

    // Position popup below button
    const rect = button.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = `${rect.bottom + 8}px`;
    popup.style.right = `${window.innerWidth - rect.right}px`;

    document.body.appendChild(popup);
    button.classList.add('active');

    // Get elements
    const selectorButton = popup.querySelector('.princhat-country-selector-button') as HTMLElement;
    const dropdown = popup.querySelector('.princhat-country-dropdown') as HTMLElement;
    const phoneInput = popup.querySelector('.princhat-phone-input') as HTMLInputElement;
    const startButton = popup.querySelector('.princhat-start-chat-button') as HTMLButtonElement;
    const arrow = popup.querySelector('.princhat-country-arrow') as HTMLElement;

    // Close button handler
    const closeBtn = popup.querySelector('.princhat-popup-close-btn');
    closeBtn?.addEventListener('click', () => {
      popup.remove();
      button.classList.remove('active');
      this.directChatPopup = null;
    });

    // Toggle dropdown
    const toggleDropdown = (e: Event) => {
      e.stopPropagation();
      isDropdownOpen = !isDropdownOpen;
      dropdown.style.display = isDropdownOpen ? 'block' : 'none';
      arrow.style.transform = isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)';

      // Position dropdown when opening (fixed positioning)
      if (isDropdownOpen) {
        const selectorRect = selectorButton.getBoundingClientRect();
        dropdown.style.top = `${selectorRect.bottom + 4}px`;
        dropdown.style.left = `${selectorRect.left}px`;
        dropdown.style.width = `${selectorRect.width}px`;
      }
    };

    selectorButton.addEventListener('click', toggleDropdown);

    // Select country
    dropdown.querySelectorAll('.princhat-country-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const code = target.dataset.code!;
        const name = target.dataset.name!;
        const flag = target.dataset.flag!;

        selectedCountry = { name, code, flag };

        // Update button text
        const selectedSpan = selectorButton.querySelector('.princhat-country-selected');
        if (selectedSpan) {
          selectedSpan.innerHTML = `
            <span class="princhat-country-flag">${flag}</span>
            <span class="princhat-country-code">${code}</span>
            <span class="princhat-country-name">${name}</span>
          `;
        }

        // Close dropdown
        isDropdownOpen = false;
        dropdown.style.display = 'none';
        arrow.style.transform = 'rotate(0deg)';
      });
    });

    // Validate phone input
    const validateAndEnableButton = () => {
      const phone = phoneInput.value.trim();
      // Remove any non-digit characters for validation
      const digitsOnly = phone.replace(/\D/g, '');

      // Enable button if we have at least 10 digits
      if (digitsOnly.length >= 10) {
        startButton.disabled = false;
      } else {
        startButton.disabled = true;
      }
    };

    phoneInput.addEventListener('input', (e) => {
      // Allow only numbers
      const target = e.target as HTMLInputElement;
      target.value = target.value.replace(/\D/g, '');
      validateAndEnableButton();
    });

    // Start chat
    startButton.addEventListener('click', async () => {
      const phone = phoneInput.value.trim().replace(/\D/g, '');

      if (phone.length >= 10) {
        console.log('[PrinChat UI] Starting chat with:', selectedCountry.code, phone);

        // Remove + from country code and combine with phone number
        const countryCodeDigits = selectedCountry.code.replace(/\D/g, '');
        const fullNumber = `${countryCodeDigits}${phone}`;

        // Close popup
        popup.remove();
        button.classList.remove('active');
        this.directChatPopup = null;

        // Use page script to open chat (has access to WPP.js and Store)
        console.log('[PrinChat UI] Opening chat via page script event');
        const chatId = `${fullNumber}@c.us`;

        // Dispatch event to page script
        const eventId = `open-chat-${Date.now()}`;
        document.dispatchEvent(new CustomEvent('PrinChatOpenChat', {
          detail: { chatId, requestId: eventId }
        }));

        console.log('[PrinChat UI] ✅ Open chat event dispatched for:', chatId);
      }
    });

    // Close popup when clicking outside
    const closePopup = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node) && !button.contains(e.target as Node)) {
        popup.remove();
        button.classList.remove('active');
        this.directChatPopup = null;
        document.removeEventListener('click', closePopup);
      }
    };

    // Add listener after a short delay to prevent immediate closure
    setTimeout(() => {
      document.addEventListener('click', closePopup);
    }, 100);
  }

  /**
   * Toggle profile dropdown menu
   */
  private toggleProfileDropdown(button: HTMLElement) {
    // Close if already open
    if (this.profileDropdown) {
      this.profileDropdown.remove();
      button.classList.remove('active');
      this.profileDropdown = null;
      return;
    }

    this.closeAllGlobalPopups();

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'princhat-profile-dropdown';
    this.profileDropdown = dropdown;

    // Menu items with Lucide icons
    const menuItems = [
      {
        label: 'Configuração',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
        action: () => {
          // Dispatch custom event that will be caught by content script with chrome API access
          const event = new CustomEvent('PRINCHAT_OPEN_OPTIONS', { bubbles: true });
          document.dispatchEvent(event);
          dropdown.remove();
          button.classList.remove('active');
          this.profileDropdown = null;
        }
      },
      {
        label: 'Minha Conta',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
        action: () => {
          console.log('[PrinChat UI] Minha Conta clicked');
          // TODO: Implement account action
        }
      },
      {
        label: 'Ajustar Zoom',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg>`,
        action: () => {
          console.log('[PrinChat UI] Ajustar Zoom clicked');
          // TODO: Implement zoom action
        }
      },
      {
        label: 'Sair',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
        action: () => {
          console.log('[PrinChat UI] Sair clicked - logging out');
          dropdown.remove();
          button.classList.remove('active');
          this.profileDropdown = null;
          // Dispatch logout event to content script
          const event = new CustomEvent('PRINCHAT_LOGOUT', { bubbles: true });
          document.dispatchEvent(event);
          // Reload after a short delay to allow storage clear
          setTimeout(() => {
            location.reload();
          }, 500);
        }
      }
    ];

    // Build menu HTML
    dropdown.innerHTML = menuItems.map(item => `
      <div class="princhat-profile-menu-item" data-action="${item.label}">
        <span class="princhat-profile-menu-icon">${item.icon}</span>
        <span class="princhat-profile-menu-label">${item.label}</span>
      </div>
    `).join('');

    // Position dropdown below button
    const rect = button.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.right = `${window.innerWidth - rect.right}px`;

    document.body.appendChild(dropdown);
    button.classList.add('active');

    // Add click handlers
    menuItems.forEach((item, index) => {
      const menuItem = dropdown.querySelectorAll('.princhat-profile-menu-item')[index];
      menuItem.addEventListener('click', item.action);
    });

    // Close dropdown when clicking outside
    const closeDropdown = (e: MouseEvent) => {
      let target = e.target as HTMLElement;
      if (target.nodeType === Node.TEXT_NODE) {
        target = target.parentElement as HTMLElement;
      }
      if (!target || !target.closest) return;

      // Don't close if clicking inside popup, on button, or on any modal
      const isModal = target.closest('.princhat-modal-overlay') ||
        target.closest('.princhat-note-editor-modal') ||
        target.closest('.princhat-calendar-modal-overlay') ||
        target.closest('.princhat-schedule-modal') ||
        target.closest('.princhat-confirmation-modal');

      if (!dropdown.contains(target) && !button.contains(target) && !isModal) {
        dropdown.remove();
        button.classList.remove('active');
        this.profileDropdown = null;
        document.removeEventListener('click', closeDropdown);
      }
    };

    // Add listener after a short delay to prevent immediate closure
    setTimeout(() => {
      document.addEventListener('click', closeDropdown);
    }, 100);
  }

  /**
   * Toggle help popup with menu options
   */
  private toggleHelpPopup(button: HTMLElement) {
    // If popup already exists, close it
    if (this.helpPopup) {
      this.helpPopup.remove();
      button.classList.remove('active');
      this.helpPopup = null;
      return;
    }

    this.closeAllGlobalPopups();

    // Create popup
    const popup = document.createElement('div');
    popup.className = 'princhat-help-popup';
    this.helpPopup = popup;

    // Define menu items
    const menuItems = [
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>`,
        title: 'Fale com o Suporte',
        description: 'Tire suas dúvidas diretamente pelo WhatsApp.',
        action: () => {
          console.log('[PrinChat] Contact support clicked');
          // TODO: Implement support link
          popup.remove();
          button.classList.remove('active');
          this.helpPopup = null;
        }
      },
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
        title: 'Central de Ajuda',
        description: 'Acesse nossos tutoriais e guias completos.',
        action: () => {
          console.log('[PrinChat] Help center clicked');
          // TODO: Implement help center link
          popup.remove();
          button.classList.remove('active');
          this.helpPopup = null;
        }
      },
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
        title: 'Sugerir uma melhoria',
        description: 'Tem uma ideia? Adoraríamos ouvir você!',
        action: () => {
          console.log('[PrinChat] Suggest improvement clicked');
          // TODO: Implement feedback form
          popup.remove();
          button.classList.remove('active');
          this.helpPopup = null;
        }
      }
    ];

    // Build popup HTML
    popup.innerHTML = `
      <div class="princhat-help-popup-header">
        <h3>Precisa de Ajuda?</h3>
        <button class="princhat-popup-close-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="princhat-help-menu">
        ${menuItems.map(item => `
          <div class="princhat-help-menu-item">
            <div class="princhat-help-menu-icon">
              ${item.icon}
            </div>
            <div class="princhat-help-menu-item-content">
              <div class="princhat-help-menu-item-title">${item.title}</div>
              <div class="princhat-help-menu-item-description">${item.description}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Position popup below button
    const rect = button.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = `${rect.bottom + 8}px`;
    popup.style.right = `${window.innerWidth - rect.right}px`;

    document.body.appendChild(popup);
    button.classList.add('active');

    // Add click handlers for menu items
    const menuItemElements = popup.querySelectorAll('.princhat-help-menu-item');
    menuItems.forEach((item, index) => {
      menuItemElements[index].addEventListener('click', item.action);
    });

    // Add close button handler
    const closeBtn = popup.querySelector('.princhat-popup-close-btn');
    closeBtn?.addEventListener('click', () => {
      popup.remove();
      button.classList.remove('active');
      this.helpPopup = null;
    });

    // Close popup when clicking outside
    const closePopup = (e: MouseEvent) => {
      let target = e.target as HTMLElement;
      // Handle text nodes (clicking on text)
      if (target.nodeType === Node.TEXT_NODE) {
        target = target.parentElement as HTMLElement;
      }

      // Safety check
      if (!target || !target.closest) return;

      // Don't close if clicking inside popup, on button, or on any modal
      const isModal = target.closest('.princhat-modal-overlay') ||
        target.closest('.princhat-note-editor-modal') ||
        target.closest('.princhat-calendar-modal-overlay') ||
        target.closest('.princhat-schedule-modal') ||
        target.closest('.princhat-confirmation-modal');

      if (!popup.contains(target) && !button.contains(target) && !isModal) {
        popup.remove();
        button.classList.remove('active');
        this.helpPopup = null;
        document.removeEventListener('click', closePopup);
      }
    };

    // Add listener after a short delay to prevent immediate closure
    setTimeout(() => {
      document.addEventListener('click', closePopup);
    }, 100);
  }

  /**
   * Helper: Build schedule card HTML (reuses execution card structure)
   */
  private buildScheduleCardHTML(schedule: Schedule, chatPhoto: string, chatName: string): string {
    const date = new Date(schedule.scheduledTime);
    const formattedDate = date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short'
    });
    const formattedTime = date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Calculate relative time based on status
    let relativeTime = '';

    // Calculate relative time and status
    if (schedule.status === 'failed') {
      relativeTime = 'Falhado';
    } else if (schedule.status === 'paused') {
      relativeTime = 'Pausado';
    } else {
      const now = Date.now();
      const diff = schedule.scheduledTime - now;

      if (diff < 0) {
        relativeTime = 'Atrasado';
      } else {
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        // Simplified format - show only the largest unit to prevent wrapping
        if (days > 0) {
          relativeTime = `daqui ${days}d`;
        } else if (hours > 0) {
          relativeTime = `daqui ${hours}h`;
        } else {
          relativeTime = minutes > 0 ? `daqui ${minutes}min` : 'Agora';
        }
      }
    }

    // Get item details
    const item = schedule.type === 'message'
      ? this.messages.find(m => m.id === schedule.itemId)
      : this.scripts.find(s => s.id === schedule.itemId);

    const itemName = schedule.type === 'message'
      ? (item as Message)?.name || (item as Message)?.content.substring(0, 40)
      : (item as Script)?.name;

    // Photo HTML - use actual contact photo or placeholder
    const photoHtml = chatPhoto
      ? `<img src="${chatPhoto}" alt="" class="princhat-script-card-photo">`
      : `<div class="princhat-script-card-photo-placeholder">${itemName ? itemName.charAt(0).toUpperCase() : 'A'}</div>`;

    // Icon for message type (script or message)
    const typeIcon = schedule.type === 'script'
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

    // Timer display and color based on status
    let timerHTML = '';
    let timerClass = 'princhat-script-card-timer';

    if (schedule.status === 'completed') {
      // Green with check icon for completed
      timerHTML = `
        <span class="${timerClass} completed">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Enviado
        </span>
      `;
    } else if (schedule.status === 'paused') {
      // Orange for paused schedules
      timerClass += ' paused';
      timerHTML = `<span class="${timerClass}">${relativeTime}</span>`;
    } else {
      // Blue for all pending schedules
      timerClass += ' pending';
      timerHTML = `<span class="${timerClass}">${relativeTime}</span>`;
    }

    // Build card with proper structure: content container + actions container
    return `
      <div class="princhat-script-card princhat-schedule-card" data-schedule-id="${schedule.id}">
        <div class="princhat-schedule-card-content">
          ${photoHtml}
          <div class="princhat-script-card-info">
            <div class="princhat-script-card-name">${chatName}</div>
            <div class="princhat-schedule-item-preview">
              <span class="princhat-schedule-item-icon">${typeIcon}</span>
              <span class="princhat-schedule-item-text">${itemName || 'Item removido'}</span>
            </div>
            <div class="princhat-schedule-item-datetime">
              <span>${formattedDate}, ${formattedTime}</span>
              ${timerHTML}
            </div>
          </div>
        </div>
        <div class="princhat-schedule-card-actions">
          ${schedule.status === 'pending' || schedule.status === 'paused' ? `
          <button class="princhat-script-btn-icon ${schedule.status === 'pending' ? 'running' : ''}" data-action="${schedule.status === 'paused' ? 'resume' : 'pause'}" data-schedule-id="${schedule.id}" title="${schedule.status === 'paused' ? 'Retomar' : 'Pausar'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              ${schedule.status === 'paused'
          ? '<path d="M8 5v14l11-7z"/>'
          : '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>'}
            </svg>
          </button>
          ` : ''}
          ${schedule.status !== 'completed' ? `
          <button class="princhat-script-btn-icon" data-action="edit" data-schedule-id="${schedule.id}" title="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          </button>
          ` : ''}
          <button class="princhat-script-btn-icon" data-action="delete" data-schedule-id="${schedule.id}" title="Cancelar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Close all header global popups (except messages)
   * @param excludeHeaderPopup If true, does NOT close the main header popup (iframe). Default false.
   */
  private closeHeaderPopups(excludeHeaderPopup: boolean = false) {
    if (this.executionsPopup && document.body.contains(this.executionsPopup)) {
      // Check if pinned - look for active pin button
      const pinBtn = this.executionsPopup.querySelector('.princhat-executions-pin');
      const isPinned = pinBtn?.classList.contains('active');

      if (!isPinned) {
        this.executionsPopup.remove();
        this.executionsPopup = null;
        // Also remove active class from toggle button
        const toggleBtn = this.customHeader?.querySelector('.princhat-header-icon-btn[title="Execuções"]');
        if (toggleBtn) {
          toggleBtn.classList.remove('active');
        }
      }
    }
    if (this.directChatPopup) {
      this.directChatPopup.remove();
      this.directChatPopup = null;
    }
    if (this.profileDropdown) {
      this.profileDropdown.remove();
      this.profileDropdown = null;
    }
    if (this.helpPopup) {
      this.helpPopup.remove();
      this.helpPopup = null;
    }
    if (this.subscriptionPopup) {
      this.subscriptionPopup.remove();
      this.subscriptionPopup = null;
    }
    if (this.globalSchedulesPopup) {
      this.globalSchedulesPopup.remove();
      this.globalSchedulesPopup = null;
    }

    // Aggressively close Global Notes (both reference and DOM query for zombies)
    if (this.globalNotesPopup) {
      this.globalNotesPopup.remove();
      this.globalNotesPopup = null;
    }
    document.querySelectorAll('.princhat-global-notes-popup-unique').forEach(el => el.remove());

    // Also close the main header popup (iframe) unless excluded
    if (!excludeHeaderPopup && this.headerPopup && this.isHeaderPopupOpen) {
      this.toggleHeaderPopup(false);
    }
  }

  /**
   * Asynchronously enriches the popup header with actual chat data (polling background)
   * This allows the popup to open INSTANTLY with scraped data, while resolving the
   * correct name/photo in the background without blocking the UI.
   */
  private async enrichPopupHeader(popup: HTMLElement, titlePrefix: string) {
    if (!popup) return;

    console.log('[PrinChat UI] 🔄 enrichPopupHeader: Starting background polling for', titlePrefix);

    let chatResponse;
    // Get current title to check against
    const currentTitleEl = popup.querySelector('.princhat-popup-title');
    const currentTitle = currentTitleEl?.textContent || '';
    // Extract current name part (e.g. "Agendamentos - Ramon" -> "Ramon")
    const currentName = currentTitle.includes(' - ') ? currentTitle.split(' - ')[1] : '';
    const isScrapedNameNumeric = /^[\d\s\+\-@]+$/.test(currentName);

    console.log('[PrinChat UI] 🔍 enrichPopupHeader: Current title:', currentTitle);
    console.log('[PrinChat UI] 🔍 enrichPopupHeader: Current name:', currentName);
    console.log('[PrinChat UI] 🔍 enrichPopupHeader: isScrapedNameNumeric:', isScrapedNameNumeric);

    // Retry Loop: Poll up to 5 times (2.5s max)
    for (let i = 0; i < 5; i++) {
      try {
        // Check if popup closed meanwhile
        if (!document.contains(popup)) {
          console.log('[PrinChat UI] ⚠️ enrichPopupHeader: Popup closed, stopping polling');
          return;
        }

        console.log(`[PrinChat UI] 🔄 enrichPopupHeader: Polling attempt ${i + 1}/5`);
        chatResponse = await this.requestFromContentScript({ type: 'GET_ACTIVE_CHAT' }, 2000);
        // FIX: GET_ACTIVE_CHAT returns 'name', not 'chatName'!
        const rName = chatResponse?.data?.name;

        console.log('[PrinChat UI] 📡 enrichPopupHeader: FULL API response:', JSON.stringify(chatResponse, null, 2));
        console.log('[PrinChat UI] 📡 enrichPopupHeader: Extracted name value:', rName, 'Type:', typeof rName);

        // CRITICAL FIX: Phone numbers like "+55 71 9327-2603" ARE valid names for unsaved contacts!
        // The old regex validation was WRONG - it rejected them thinking they were "invalid"
        // Accept ANY non-empty name that isn't the generic fallbacks
        if (chatResponse?.success && rName && rName !== 'Chat' && rName !== 'Unknown') {
          console.log('[PrinChat UI] ✅ enrichPopupHeader: Got valid name (including phone numbers), stopping poll:', rName);
          break;
        }

        console.log('[PrinChat UI] ⏳ enrichPopupHeader: No valid name yet, waiting 500ms...');
        if (i < 4) await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.error('[PrinChat UI] ❌ enrichPopupHeader: Poll error:', e);
      }
    }

    // Check if popup still exists
    if (!document.contains(popup)) {
      console.log('[PrinChat UI] ⚠️ enrichPopupHeader: Popup closed after polling');
      return;
    }

    if (!chatResponse?.data) {
      console.log('[PrinChat UI] ⚠️ enrichPopupHeader: No chat data received');
      return;
    }

    // FIX: Use 'name' field, not 'chatName'
    const realName = chatResponse.data.name;
    const realPhoto = chatResponse.data.chatPhoto;

    console.log('[PrinChat UI] 🎯 enrichPopupHeader: Final data:', { realName, realPhoto: !!realPhoto });

    const titleEl = popup.querySelector('.princhat-popup-title');
    const photoEl = popup.querySelector('.princhat-popup-chat-photo');
    const photoPlaceholderEl = popup.querySelector('.princhat-popup-chat-photo-placeholder');

    if (realName && realName !== 'Chat' && realName !== 'Unknown') {
      // CRITICAL FIX: Always use API name (phone numbers ARE valid for unsaved contacts)
      console.log('[PrinChat UI] ✅ enrichPopupHeader: Updating title to:', `${titlePrefix} - ${realName}`);
      if (titleEl) titleEl.textContent = `${titlePrefix} - ${realName}`;

      // Handle photo placeholder text update if photo is still missing
      if (photoPlaceholderEl && !realPhoto) {
        photoPlaceholderEl.textContent = realName.charAt(0).toUpperCase();
      }
    }

    if (realPhoto) {
      console.log('[PrinChat UI] 📷 enrichPopupHeader: Updating photo');
      // If we have a photo element, update src
      if (photoEl) {
        (photoEl as HTMLImageElement).src = realPhoto;
      } else if (photoPlaceholderEl) {
        // If we have a placeholder, replace it with img
        const newImg = document.createElement('img');
        newImg.src = realPhoto;
        newImg.alt = "";
        newImg.className = "princhat-popup-chat-photo";
        photoPlaceholderEl.replaceWith(newImg);
      }
    }

    console.log('[PrinChat UI] ✅ enrichPopupHeader: Complete');
  }

  /**
   * Toggle schedule list popup
   * Updated to be NON-BLOCKING for instant open
   */
  private async toggleScheduleListPopup(button: HTMLElement) {
    if (this.scheduleListPopup) {
      this.scheduleListPopup.remove();
      this.scheduleListPopup = null;
      return;
    }

    // Close notes popup if open
    if (this.notesPopup) {
      this.notesPopup.remove();
      this.notesPopup = null;
    }

    // Close header global popups
    this.closeHeaderPopups();

    const popup = document.createElement('div');
    popup.className = 'princhat-schedule-list-popup';
    this.scheduleListPopup = popup;

    // Get active chat ID
    const chatId = await this.getActiveChatId() || '';

    // Get chat photo/name - Use API to get pushname (same as FAB popup)
    let chatName = 'Chat';
    let chatPhoto = '';

    // 1. Try DOM Scrape for instant baseline
    const scraped = this.scrapeHeaderInfo();
    chatName = scraped.name || 'Chat';
    chatPhoto = scraped.photo || '';

    // 2. Get real name/photo from API (non-blocking)
    const chatInfoResponse = await this.requestFromContentScript({ type: 'GET_ACTIVE_CHAT' });
    if (chatInfoResponse?.success && chatInfoResponse.data) {
      chatName = chatInfoResponse.data.name || chatName;
      chatPhoto = chatInfoResponse.data.chatPhoto || chatPhoto;
    }

    // Load schedules for this chat
    console.log('[PrinChat UI] Loading schedules for chat:', chatId);
    const schedulesResponse = await this.requestFromContentScript({
      type: 'GET_SCHEDULES_BY_CHAT',
      payload: { chatId }
    });

    const schedules: Schedule[] = schedulesResponse?.data || [];
    console.log('[PrinChat UI] Loaded schedules:', schedules);

    // Categorize schedules by status
    const pending = schedules.filter(s => s.status === 'pending');
    const paused = schedules.filter(s => s.status === 'paused');
    const completed = schedules.filter(s => s.status === 'completed');
    const cancelled = schedules.filter(s => s.status === 'cancelled');
    const failed = schedules.filter(s => s.status === 'failed');

    console.log('[PrinChat UI] Schedule statuses:', {
      total: schedules.length,
      pending: pending.length,
      paused: paused.length,
      completed: completed.length,
      cancelled: cancelled.length,
      failed: failed.length
    });

    // Build schedule list HTML with sections
    let scheduleListHTML = '';
    if (schedules.length === 0) {
      scheduleListHTML = `
        <div class="princhat-schedule-list-empty">
          <div class="princhat-schedule-list-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div class="princhat-schedule-list-empty-title">Nenhum agendamento</div>
          <div class="princhat-schedule-list-empty-subtitle">Crie seu primeiro agendamento</div>
        </div>
      `;
    } else {
      // Build sections in order: Pending, Paused, Completed, Cancelled, Failed
      if (pending.length > 0) {
        scheduleListHTML += `
          <div class="princhat-schedule-section">
            <div class="princhat-schedule-section-header">
              <span>Pendentes</span>
              <span class="princhat-schedule-section-count">${pending.length}</span>
            </div>
            ${pending.map(s => this.buildScheduleCardHTML(s, chatPhoto, chatName)).join('')}
          </div>
        `;
      }

      if (paused.length > 0) {
        scheduleListHTML += `
          <div class="princhat-schedule-section">
            <div class="princhat-schedule-section-header">
              <span>Pausados</span>
              <span class="princhat-schedule-section-count">${paused.length}</span>
            </div>
            ${paused.map(s => this.buildScheduleCardHTML(s, chatPhoto, chatName)).join('')}
          </div>
        `;
      }

      if (completed.length > 0) {
        scheduleListHTML += `
          <div class="princhat-schedule-section">
            <div class="princhat-schedule-section-header">
              <span>Enviados</span>
              <span class="princhat-schedule-section-count">${completed.length}</span>
            </div>
            ${completed.map(s => this.buildScheduleCardHTML(s, chatPhoto, chatName)).join('')}
          </div>
        `;
      }

      if (cancelled.length > 0) {
        scheduleListHTML += `
          <div class="princhat-schedule-section">
            <div class="princhat-schedule-section-header">
              <span>Cancelados</span>
              <span class="princhat-schedule-section-count">${cancelled.length}</span>
            </div>
            ${cancelled.map(s => this.buildScheduleCardHTML(s, chatPhoto, chatName)).join('')}
          </div>
        `;
      }

      if (failed.length > 0) {
        scheduleListHTML += `
          <div class="princhat-schedule-section">
            <div class="princhat-schedule-section-header">
              <span>Falhados</span>
              <span class="princhat-schedule-section-count">${failed.length}</span>
            </div>
            ${failed.map(s => this.buildScheduleCardHTML(s, chatPhoto, chatName)).join('')}
          </div>
        `;
      }
    }

    popup.innerHTML = `
      <div class="princhat-popup-header">
        <div class="princhat-popup-header-content">
          ${chatPhoto ? `<img src="${chatPhoto}" alt="" class="princhat-popup-chat-photo">` : '<div class="princhat-popup-chat-photo-placeholder">' + chatName.charAt(0).toUpperCase() + '</div>'}
          <div>
            <div class="princhat-popup-title">Agendamentos - ${chatName}</div>
            <div class="princhat-popup-subtitle">Agendamentos de mensagens e scripts</div>
          </div>
        </div>
        <button class="princhat-popup-close-btn" title="Fechar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="princhat-schedule-list-content">
        ${scheduleListHTML}
      </div>
      <div class="princhat-schedule-list-footer">
        <button class="princhat-schedule-list-create-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Criar novo
        </button>
      </div>
    `;

    const rect = button.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = `${rect.bottom + 8}px`;
    popup.style.right = `${window.innerWidth - rect.right}px`;
    document.body.appendChild(popup);

    const closeBtn = popup.querySelector('.princhat-popup-close-btn');
    closeBtn?.addEventListener('click', () => {
      popup.remove();
      this.scheduleListPopup = null;
      // Clear timer interval when closing popup
      if (this.scheduleTimerInterval) {
        clearInterval(this.scheduleTimerInterval);
        this.scheduleTimerInterval = null;
      }
    });

    const createBtn = popup.querySelector('.princhat-schedule-list-create-btn');
    createBtn?.addEventListener('click', () => {
      this.openScheduleCreationModal();
    });

    // Action button handlers (pause, edit, delete)
    const actionButtons = popup.querySelectorAll('[data-action]');
    actionButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = (btn as HTMLElement).dataset.action;
        const scheduleId = (btn as HTMLElement).dataset.scheduleId;

        if (!scheduleId) return;

        switch (action) {
          case 'pause':
          case 'resume':
            // Determine new status
            const newStatus = action === 'pause' ? 'paused' : 'pending';

            // Update database
            await this.updateScheduleStatus(scheduleId, newStatus);

            // Find the schedule in our local data
            const scheduleIndex = schedules.findIndex(s => s.id === scheduleId);
            if (scheduleIndex >= 0) {
              schedules[scheduleIndex].status = newStatus;

              // Update the card in place without reloading popup
              const card = btn.closest('.princhat-script-card');
              if (card) {
                // Determine section movement
                const oldSection = card.closest('.princhat-schedule-section');
                const targetSectionName = newStatus === 'paused' ? 'Pausados' : 'Pendentes';

                // Find or create target section
                let targetSection = Array.from(popup.querySelectorAll('.princhat-schedule-section')).find(section => {
                  const header = section.querySelector('.princhat-schedule-section-header span');
                  return header?.textContent === targetSectionName;
                });

                // If target section doesn't exist, create it
                if (!targetSection) {
                  const scheduleList = popup.querySelector('.princhat-schedule-list-content');
                  if (scheduleList) {
                    const newSectionHTML = `
                      <div class="princhat-schedule-section">
                        <div class="princhat-schedule-section-header">
                          <span>${targetSectionName}</span>
                          <span class="princhat-schedule-section-count">0</span>
                        </div>
                      </div>
                    `;

                    // Insert section in correct order (Pending, Paused, Completed, Cancelled, Failed)
                    const sectionOrder = ['Pendentes', 'Pausados', 'Enviados', 'Cancelados', 'Falhados'];
                    const targetIndex = sectionOrder.indexOf(targetSectionName);
                    const sections = Array.from(scheduleList.querySelectorAll('.princhat-schedule-section'));

                    let inserted = false;
                    for (const section of sections) {
                      const header = section.querySelector('.princhat-schedule-section-header span');
                      const sectionName = header?.textContent || '';
                      const sectionIndex = sectionOrder.indexOf(sectionName);

                      if (sectionIndex > targetIndex) {
                        section.insertAdjacentHTML('beforebegin', newSectionHTML);
                        inserted = true;
                        break;
                      }
                    }

                    if (!inserted) {
                      scheduleList.insertAdjacentHTML('beforeend', newSectionHTML);
                    }

                    targetSection = Array.from(scheduleList.querySelectorAll('.princhat-schedule-section')).find(section => {
                      const header = section.querySelector('.princhat-schedule-section-header span');
                      return header?.textContent === targetSectionName;
                    });
                  }
                }

                // Move card to target section
                if (targetSection && oldSection !== targetSection) {
                  targetSection.appendChild(card);

                  // Update section counts
                  const updateSectionCount = (section: Element) => {
                    const cards = section.querySelectorAll('.princhat-script-card');
                    const countEl = section.querySelector('.princhat-schedule-section-count');
                    if (countEl) {
                      countEl.textContent = String(cards.length);
                    }

                    // Remove section if empty
                    if (cards.length === 0) {
                      section.remove();
                    }
                  };

                  if (oldSection) updateSectionCount(oldSection);
                  updateSectionCount(targetSection);
                }

                // Update the card UI (button and timer)
                const pauseBtn = card.querySelector('[data-action="pause"], [data-action="resume"]') as HTMLElement;
                const timerEl = card.querySelector('.princhat-script-card-timer');

                if (pauseBtn) {
                  const isPaused = newStatus === 'paused';
                  pauseBtn.dataset.action = isPaused ? 'resume' : 'pause';
                  pauseBtn.title = isPaused ? 'Retomar' : 'Pausar';
                  pauseBtn.innerHTML = isPaused
                    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
                    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>';

                  if (isPaused) {
                    pauseBtn.classList.remove('running');
                  } else {
                    pauseBtn.classList.add('running');
                  }
                }

                if (timerEl) {
                  timerEl.classList.remove('pending', 'paused');
                  if (newStatus === 'paused') {
                    timerEl.classList.add('paused');
                    timerEl.textContent = 'Pausado';
                  } else {
                    timerEl.classList.add('pending');
                    // Recalculate time
                    const schedule = schedules[scheduleIndex];
                    const now = Date.now();
                    const diff = schedule.scheduledTime - now;
                    if (diff < 0) {
                      timerEl.textContent = 'Atrasado';
                    } else {
                      const minutes = Math.floor(diff / 60000);
                      const hours = Math.floor(minutes / 60);
                      const days = Math.floor(hours / 24);
                      if (days > 0) {
                        timerEl.textContent = `daqui ${days}d`;
                      } else if (hours > 0) {
                        timerEl.textContent = `daqui ${hours}h`;
                      } else {
                        timerEl.textContent = minutes > 0 ? `daqui ${minutes}min` : 'Agora';
                      }
                    }
                  }
                }
              }
            }
            break;

          case 'edit':
            // Find schedule from loaded schedules array
            const scheduleToEdit = schedules.find(s => s.id === scheduleId);
            if (scheduleToEdit) {
              this.openScheduleCreationModal(scheduleToEdit);
            } else {
              console.error('[PrinChat UI] Schedule not found for edit:', scheduleId);
              alert('Erro ao carregar agendamento para edição');
            }
            break;

          case 'delete':
            this.showScheduleDeleteConfirmation(scheduleId);
            break;
        }
      });
    });

    const closePopup = (e: MouseEvent) => {
      // Ignore clicks on elements that are no longer part of the DOM (e.g. just closed modals)
      if (!(e.target as HTMLElement).isConnected) return;

      // Don't close if clicking inside modal
      if (this.scheduleCreationModal && this.scheduleCreationModal.contains(e.target as Node)) {
        return;
      }

      // Don't close if clicking inside delete confirmation modal
      if (this.scheduleDeleteConfirmationModal && this.scheduleDeleteConfirmationModal.contains(e.target as Node)) {
        return;
      }

      // Check if ANY modal is currently open (not if clicked element is inside one)
      const hasOpenModal = document.querySelector('.princhat-modal-overlay') !== null ||
        document.querySelector('.princhat-note-editor-modal') !== null ||
        document.querySelector('.princhat-calendar-modal-overlay') !== null;

      if (!popup.contains(e.target as Node) && !button.contains(e.target as Node) && !hasOpenModal) {
        popup.remove();
        this.scheduleListPopup = null;
        document.removeEventListener('click', closePopup);
      }
    };

    setTimeout(() => document.addEventListener('click', closePopup), 100);

    // Update timers in real-time (every second)
    this.scheduleTimerInterval = setInterval(() => {
      if (!this.scheduleListPopup) {
        // Popup was closed, clear interval
        if (this.scheduleTimerInterval) {
          clearInterval(this.scheduleTimerInterval);
          this.scheduleTimerInterval = null;
        }
        return;
      }

      // Update all pending schedule timers
      const timerElements = popup.querySelectorAll('.princhat-script-card-timer.pending');
      timerElements.forEach((timerEl) => {
        const card = timerEl.closest('[data-schedule-id]');
        if (!card) return;

        const scheduleId = (card as HTMLElement).dataset.scheduleId;
        const schedule = schedules.find(s => s.id === scheduleId);
        if (!schedule || schedule.status !== 'pending') return;

        // Recalculate relative time
        const now = Date.now();
        const diff = schedule.scheduledTime - now;

        if (diff < 0) {
          timerEl.textContent = 'Atrasado';
        } else {
          const minutes = Math.floor(diff / 60000);
          const hours = Math.floor(minutes / 60);
          const days = Math.floor(hours / 24);

          if (days > 0) {
            timerEl.textContent = `daqui ${days}d`;
          } else if (hours > 0) {
            timerEl.textContent = `daqui ${hours}h`;
          } else {
            timerEl.textContent = minutes > 0 ? `daqui ${minutes}min` : 'Agora';
          }
        }
      });
    }, 1000); // Update every second
    this.enrichPopupHeader(this.scheduleListPopup, 'Agendamentos');
  }

  /**
   * Toggle notes popup
   */
  private async toggleNotesPopup(button: HTMLElement) {
    if (this.notesPopup) {
      this.notesPopup.remove();
      this.notesPopup = null;
      return;
    }

    // Close schedule popup if open
    if (this.scheduleListPopup) {
      this.scheduleListPopup.remove();
      this.scheduleListPopup = null;
    }

    // Close header global popups (including executions unless pinned)
    this.closeHeaderPopups();

    const popup = document.createElement('div');
    popup.className = 'princhat-notes-popup';
    this.notesPopup = popup;

    // Get active chat ID and info
    const chatId = await this.getActiveChatId() || '';

    // Get chat info - Use API to get pushname (same as Schedules)
    let chatName = 'Chat';
    let chatPhoto = '';

    // 1. Try DOM Scrape for instant baseline
    const scraped = this.scrapeHeaderInfo();
    chatName = scraped.name || 'Chat';
    chatPhoto = scraped.photo || '';

    // 2. Get real name/photo from API
    const chatInfoResponse = await this.requestFromContentScript({ type: 'GET_ACTIVE_CHAT' });
    if (chatInfoResponse?.success && chatInfoResponse.data) {
      chatName = chatInfoResponse.data.name || chatName;
      chatPhoto = chatInfoResponse.data.chatPhoto || chatPhoto;
    }

    // TODO: Load notes from storage
    // Build popup HTML
    popup.innerHTML = `
      <div class="princhat-popup-header">
        <div class="princhat-popup-header-content">
          ${chatPhoto ? `<img src="${chatPhoto}" alt="" class="princhat-popup-chat-photo">` : '<div class="princhat-popup-chat-photo-placeholder">' + chatName.charAt(0).toUpperCase() + '</div>'}
          <div>
            <div class="princhat-popup-title">Notas - ${chatName}</div>
            <div class="princhat-popup-subtitle">Anotações e observações do contato</div>
          </div>
        </div>
        <button class="princhat-popup-close-btn" title="Fechar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="princhat-notes-content">
        <div class="princhat-notes-list"></div>
      </div>
      <div class="princhat-notes-footer">
        <button class="princhat-notes-new-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Nova nota
        </button>
      </div>
    `;

    // Position popup
    const rect = button.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = `${rect.bottom + 8}px`;
    popup.style.right = `${window.innerWidth - rect.right}px`;
    document.body.appendChild(popup);

    // Enrich header in background (non-blocking) - MUST be after HTML is set
    this.enrichPopupHeader(popup, 'Notas');

    // Event listeners
    let handleClickOutside: ((event: MouseEvent) => void) | null = null;

    const closeBtn = popup.querySelector('.princhat-popup-close-btn');
    closeBtn?.addEventListener('click', () => {
      popup.remove();
      this.notesPopup = null;
      if (handleClickOutside) {
        document.removeEventListener('click', handleClickOutside);
      }
    });

    const newNoteBtn = popup.querySelector('.princhat-notes-new-btn');
    newNoteBtn?.addEventListener('click', async () => {
      console.log('[PrinChat UI] Opening note editor modal');
      await this.openNoteEditorModal(chatId, chatName, chatPhoto);
    });

    // Close popup when clicking outside
    handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Ignore clicks on the toggle button itself (handled by button click listener)
      if (button.contains(target)) {
        return;
      }

      // Check if ANY modal is currently open (not if clicked element is inside one)
      const hasOpenModal = document.querySelector('.princhat-modal-overlay') !== null ||
        document.querySelector('.princhat-note-editor-modal') !== null;

      if (this.notesPopup && !this.notesPopup.contains(target) && !hasOpenModal) {
        this.notesPopup.remove();
        this.notesPopup = null;
        document.removeEventListener('click', handleClickOutside!);
      }
    };

    // Add listener after a small delay to avoid immediate closure from the button click
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside!);
    }, 100);

    // Load notes for this chat
    this.refreshNotesList(chatId);
  }



  /**
   * Open modal to create or edit a note
   */
  private openNoteEditorModal(chatId: string, chatName: string, chatPhoto?: string, existingNote?: any, readOnly: boolean = false, options?: { onSave?: () => void }) {
    console.log('[PrinChat UI] Opening note editor modal');



    // Close existing modal if open
    if (this.noteEditorModal) {
      this.noteEditorModal.remove();
      this.noteEditorModal = null;
    }

    const modal = document.createElement('div');
    modal.className = 'princhat-note-editor-modal';
    // Ensure modal is ALWAYS on top of everything (including global popups which might have high z-index)
    modal.style.zIndex = '2147483647'; // Max safe integer for 32-bit systems
    this.noteEditorModal = modal;

    const isEditing = !!existingNote;
    const title = readOnly ? 'Visualizar Nota' : (isEditing ? 'Editar Nota' : 'Nova Nota');

    // Different layout for read-only view
    if (readOnly && existingNote) {
      modal.innerHTML = `
        <div class="princhat-note-modal-backdrop"></div>
        <div class="princhat-note-modal-container">
          <div class="princhat-note-modal-header">
            <div class="princhat-note-modal-chat-info">
              ${chatPhoto ? `<img src="${chatPhoto}" alt="" class="princhat-note-modal-chat-photo">` : `<div class="princhat-note-modal-chat-photo-placeholder">${chatName.charAt(0).toUpperCase()}</div>`}
              <div>
                <div class="princhat-note-modal-title">${title}</div>
                <div class="princhat-note-modal-subtitle">${chatName}</div>
              </div>
            </div>
            <button class="princhat-popup-close-btn princhat-note-modal-close" title="Fechar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="princhat-note-view-content">
            <h2 class="princhat-note-view-title">${existingNote.title}</h2>
            <div class="princhat-note-view-body">${existingNote.content}</div>
          </div>
          <div class="princhat-note-modal-footer">
            <button class="princhat-note-modal-save-btn">Fechar</button>
          </div>
        </div>
      `;
    } else {
      // Original editor layout for create/edit
      modal.innerHTML = `
      <div class="princhat-note-modal-backdrop"></div>
      <div class="princhat-note-modal-container">
        <div class="princhat-note-modal-header">
          <div class="princhat-note-modal-chat-info">
            ${chatPhoto ? `<img src="${chatPhoto}" alt="" class="princhat-note-modal-chat-photo">` : `<div class="princhat-note-modal-chat-photo-placeholder">${chatName.charAt(0).toUpperCase()}</div>`}
            <div>
              <div class="princhat-note-modal-title">${title}</div>
              <div class="princhat-note-modal-subtitle">${chatName}</div>
            </div>
          </div>
          <button class="princhat-popup-close-btn princhat-note-modal-close" title="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="princhat-note-modal-title-input">
          <input 
            type="text" 
            class="princhat-note-title-field" 
            placeholder="Título da nota"
            value="${existingNote?.title || ''}"
            ${readOnly ? 'readonly' : 'autofocus'}
          />
        </div>
        <div class="princhat-note-modal-editor">
          <div class="princhat-note-editor-toolbar" ${readOnly ? 'style="display:none"' : ''}>
            <button type="button" class="toolbar-btn" data-action="bold" title="Negrito (Ctrl+B)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6zM6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
              </svg>
            </button>
            <button type="button" class="toolbar-btn" data-action="italic" title="Itálico (Ctrl+I)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>
              </svg>
            </button>
            <button type="button" class="toolbar-btn" data-action="underline" title="Sublinhado (Ctrl+U)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/>
              </svg>
            </button>
            <button type="button" class="toolbar-btn" data-action="strike" title="Tachado">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/>
              </svg>
            </button>
            <div class="toolbar-separator"></div>
            <button type="button" class="toolbar-btn" data-action="heading1" title="Título 1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 12h8M4 18V6M12 18V6M17 12h3M19 18V6"/>
              </svg>
            </button>
            <button type="button" class="toolbar-btn" data-action="heading2" title="Título 2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 12h8M4 18V6M12 18V6M15 13h6M18 18c.7-1.5 2-3 3-3s2 1.5 3 3"/>
              </svg>
            </button>
            <div class="toolbar-separator"></div>
            <button type="button" class="toolbar-btn" data-action="bulletList" title="Lista com marcadores">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <circle cx="3" cy="6" r="1.5" fill="currentColor"/><circle cx="3" cy="12" r="1.5" fill="currentColor"/><circle cx="3" cy="18" r="1.5" fill="currentColor"/>
              </svg>
            </button>
            <button type="button" class="toolbar-btn" data-action="orderedList" title="Lista numerada">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
                <path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>
              </svg>
            </button>
            <button type="button" class="toolbar-btn" data-action="taskList" title="Lista de tarefas">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 11l3 3L22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
            </button>
            <div class="toolbar-separator"></div>
            <button type="button" class="toolbar-btn" data-action="textColor" title="Cor do texto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 19.5v-15M5.5 19.5h13"/>
                <path d="M7 5h10l-3 8h-4z"/>
              </svg>
            </button>
            <div class="toolbar-separator"></div>
            <button type="button" class="toolbar-btn" data-action="link" title="Inserir link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </button>
            <button type="button" class="toolbar-btn" data-action="code" title="Código">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
            </button>
          </div>
          <div class="princhat-note-editor-content" contenteditable="true"></div>
        </div>
        <div class="princhat-note-modal-footer">
          ${readOnly ? '' : '<button class="princhat-note-modal-cancel-btn">Cancelar</button>'}
          <button class="princhat-note-modal-save-btn">${readOnly ? 'Fechar' : 'Salvar'}</button>
        </div>
      </div>
    `;
    }

    document.body.appendChild(modal);

    // Close handlers
    const closeBtn = modal.querySelector('.princhat-note-modal-close');
    const saveBtn = modal.querySelector('.princhat-note-modal-save-btn');
    const cancelBtn = modal.querySelector('.princhat-note-modal-cancel-btn');
    const backdrop = modal.querySelector('.princhat-note-modal-backdrop');

    // Simple close for read-only mode
    if (readOnly) {
      const closeModal = () => {
        modal.remove();
        this.noteEditorModal = null;
      };

      closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeModal();
      });
      saveBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeModal();
      });
      backdrop?.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          e.stopPropagation();
          closeModal();
        }
      });
      return; // Exit early for read-only
    }

    // Editor mode logic continues here
    const titleInput = modal.querySelector('.princhat-note-title-field') as HTMLInputElement;
    // Get editor content
    const editorContent = modal.querySelector('.princhat-note-editor-content') as HTMLDivElement;
    if (!editorContent) return;

    // Set readonly mode
    if (readOnly) {
      editorContent.setAttribute('contenteditable', 'false');
      editorContent.style.cursor = 'default';
      if (titleInput) {
        titleInput.style.cursor = 'default';
      }
    }

    // Set placeholder and load existing content
    editorContent.setAttribute('data-placeholder', 'Digite sua nota aqui...');
    if (existingNote?.content) {
      editorContent.innerHTML = existingNote.content;
    }

    // Toolbar buttons event listeners
    const toolbarButtons = modal.querySelectorAll('.toolbar-btn');

    toolbarButtons.forEach(btn => {
      // Use mousedown instead of click to prevent losing selection
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent losing focus from contenteditable

        const action = (btn as HTMLElement).dataset.action;
        if (!action || !editorContent) return;

        try {
          switch (action) {
            case 'bold': {
              const sel = window.getSelection();
              if (sel && !sel.isCollapsed) {
                const range = sel.getRangeAt(0);

                // Check if selection is already inside a <strong> tag
                let parentElement = range.commonAncestorContainer as Node;
                if (parentElement.nodeType === Node.TEXT_NODE) {
                  parentElement = parentElement.parentElement as Node;
                }

                const strongParent = (parentElement as Element).closest('strong');

                if (strongParent) {
                  // Remove bold - unwrap the strong tag
                  const text = document.createTextNode(strongParent.textContent || '');
                  strongParent.parentNode?.replaceChild(text, strongParent);
                  // Keep selection on the text
                  range.selectNodeContents(text);
                  sel.removeAllRanges();
                  sel.addRange(range);
                } else {
                  // Add bold - wrap selection in strong tag
                  const selectedText = sel.toString();
                  const bold = document.createElement('strong');
                  bold.textContent = selectedText;
                  range.deleteContents();
                  range.insertNode(bold);
                  // Keep selection on the bold element
                  range.selectNodeContents(bold);
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
              }
              break;
            }
            case 'italic': {
              const sel = window.getSelection();
              if (sel && !sel.isCollapsed) {
                const range = sel.getRangeAt(0);

                // Check if selection is already inside an <em> tag
                let parentElement = range.commonAncestorContainer as Node;
                if (parentElement.nodeType === Node.TEXT_NODE) {
                  parentElement = parentElement.parentElement as Node;
                }

                const emParent = (parentElement as Element).closest('em');

                if (emParent) {
                  // Remove italic - unwrap the em tag
                  const text = document.createTextNode(emParent.textContent || '');
                  emParent.parentNode?.replaceChild(text, emParent);
                  // Keep selection on the text
                  range.selectNodeContents(text);
                  sel.removeAllRanges();
                  sel.addRange(range);
                } else {
                  // Add italic - wrap selection in em tag
                  const selectedText = sel.toString();
                  const italic = document.createElement('em');
                  italic.textContent = selectedText;
                  range.deleteContents();
                  range.insertNode(italic);
                  // Keep selection on the italic element
                  range.selectNodeContents(italic);
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
              }
              break;
            }
            case 'underline':
              document.execCommand('underline', false, undefined);
              break;
            case 'strike':
              document.execCommand('strikeThrough', false, undefined);
              break;
            case 'heading1':
              document.execCommand('formatBlock', false, '<h1>');
              break;
            case 'heading2':
              document.execCommand('formatBlock', false, '<h2>');
              break;
            case 'bulletList':
              document.execCommand('insertUnorderedList', false, undefined);
              break;
            case 'orderedList':
              document.execCommand('insertOrderedList', false, undefined);
              break;
            case 'taskList': {
              // Create task list with checkboxes
              const sel = window.getSelection();
              if (sel && !sel.isCollapsed) {
                const range = sel.getRangeAt(0);
                const selectedText = sel.toString();
                const lines = selectedText.split('\n');

                const ul = document.createElement('ul');
                ul.style.listStyle = 'none';
                ul.style.paddingLeft = '0';

                lines.forEach(line => {
                  if (line.trim()) {
                    const li = document.createElement('li');
                    li.style.display = 'flex';
                    li.style.alignItems = 'center';
                    li.style.gap = '8px';
                    li.style.marginBottom = '4px';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.style.cursor = 'pointer';
                    checkbox.style.flexShrink = '0';

                    const span = document.createElement('span');
                    span.textContent = line.trim();

                    li.appendChild(checkbox);
                    li.appendChild(span);
                    ul.appendChild(li);
                  }
                });

                range.deleteContents();
                range.insertNode(ul);
                range.setStartAfter(ul);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              }
              break;
            }
            case 'blockquote':
              // Replaced by textColor - this case should be textColor now
              const colorInput = document.createElement('input');
              colorInput.type = 'color';
              colorInput.value = '#e91e63';
              colorInput.style.position = 'absolute';
              colorInput.style.opacity = '0';
              document.body.appendChild(colorInput);

              colorInput.addEventListener('change', () => {
                const sel = window.getSelection();
                if (sel && !sel.isCollapsed) {
                  const range = sel.getRangeAt(0);
                  const selectedText = sel.toString();

                  const span = document.createElement('span');
                  span.style.color = colorInput.value;
                  span.textContent = selectedText;

                  range.deleteContents();
                  range.insertNode(span);
                  range.selectNodeContents(span);
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
                colorInput.remove();
              });

              colorInput.click();
              break;
            case 'textColor': {
              // Create custom color palette dropdown
              const sel = window.getSelection();
              if (!sel || sel.isCollapsed) {
                alert('Selecione o texto para aplicar cor');
                break;
              }

              const savedRange = sel.getRangeAt(0);
              const buttonRect = (btn as HTMLElement).getBoundingClientRect();

              // Create color palette container
              const colorPalette = document.createElement('div');
              colorPalette.className = 'princhat-color-palette';
              colorPalette.style.position = 'absolute';
              colorPalette.style.top = `${buttonRect.bottom + 5}px`;
              colorPalette.style.left = `${buttonRect.left}px`;

              // Predefined colors
              const colors = [
                { name: 'Branco', value: '#ffffff' },
                { name: 'Cinza Claro', value: '#cccccc' },
                { name: 'Cinza', value: '#888888' },
                { name: 'Preto', value: '#000000' },
                { name: 'Vermelho', value: '#ff4444' },
                { name: 'Rosa', value: '#e91e63' },
                { name: 'Roxo', value: '#9c27b0' },
                { name: 'Azul', value: '#2196f3' },
                { name: 'Verde', value: '#4caf50' },
                { name: 'Amarelo', value: '#ffeb3b' },
                { name: 'Laranja', value: '#ff9800' },
                { name: 'Marrom', value: '#795548' },
              ];

              let paletteHTML = '<div class="princhat-color-palette-grid">';
              colors.forEach(color => {
                paletteHTML += `<button class="princhat-color-swatch" data-color="${color.value}" title="${color.name}" style="background: ${color.value};"></button>`;
              });
              paletteHTML += '</div>';
              paletteHTML += '<button class="princhat-color-custom">+ Cor Personalizada</button>';

              colorPalette.innerHTML = paletteHTML;
              document.body.appendChild(colorPalette);

              // Click outside to close
              const closeOnClickOutside = (e: MouseEvent) => {
                if (!colorPalette.contains(e.target as Node)) {
                  colorPalette.remove();
                  document.removeEventListener('mousedown', closeOnClickOutside);
                }
              };
              setTimeout(() => {
                document.addEventListener('mousedown', closeOnClickOutside);
              }, 100);

              // Apply color when swatch is clicked
              colorPalette.querySelectorAll('.princhat-color-swatch').forEach(swatch => {
                swatch.addEventListener('click', () => {
                  const selectedColor = (swatch as HTMLElement).dataset.color!;
                  applyTextColor(savedRange, selectedColor, editorContent);
                  colorPalette.remove();
                  document.removeEventListener('mousedown', closeOnClickOutside);
                });
              });

              // Custom color picker
              colorPalette.querySelector('.princhat-color-custom')?.addEventListener('click', () => {
                const customInput = document.createElement('input');
                customInput.type = 'color';
                customInput.style.position = 'absolute';
                customInput.style.opacity = '0';
                document.body.appendChild(customInput);

                customInput.addEventListener('change', () => {
                  applyTextColor(savedRange, customInput.value, editorContent);
                  colorPalette.remove();
                  customInput.remove();
                  document.removeEventListener('mousedown', closeOnClickOutside);
                });

                customInput.click();
              });

              break;
            }
            case 'link':
              // Open custom link modal
              this.openLinkModal(editorContent);
              break;
            case 'code':
              const selection = window.getSelection();
              if (selection && !selection.isCollapsed) {
                const selectedText = selection.toString();
                const code = document.createElement('code');
                code.textContent = selectedText;
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(code);
                // Move cursor after code element
                range.setStartAfter(code);
                range.setEndAfter(code);
                selection.removeAllRanges();
                selection.addRange(range);
              }
              break;
          }
        } catch (error) {
          console.error('[PrinChat UI] Error executing formatting command:', error);
        }

        // Update toolbar state
        setTimeout(updateToolbarState, 10);
      });
    });

    // Update toolbar active states
    const updateToolbarState = () => {
      if (!editorContent) return;

      toolbarButtons.forEach(btn => {
        const action = (btn as HTMLElement).dataset.action;
        btn.classList.remove('is-active');

        try {
          switch (action) {
            case 'bold':
              if (document.queryCommandState('bold')) btn.classList.add('is-active');
              break;
            case 'italic':
              if (document.queryCommandState('italic')) btn.classList.add('is-active');
              break;
            case 'underline':
              if (document.queryCommandState('underline')) btn.classList.add('is-active');
              break;
            case 'strike':
              if (document.queryCommandState('strikeThrough')) btn.classList.add('is-active');
              break;
            case 'bulletList':
              if (document.queryCommandState('insertUnorderedList')) btn.classList.add('is-active');
              break;
            case 'orderedList':
              if (document.queryCommandState('insertOrderedList')) btn.classList.add('is-active');
              break;
          }
        } catch (error) {
          // Silently ignore
        }
      });
    };

    // Update toolbar on selection change
    editorContent?.addEventListener('mouseup', updateToolbarState);
    editorContent?.addEventListener('keyup', updateToolbarState);
    editorContent?.addEventListener('focus', () => {
      setTimeout(updateToolbarState, 10);
    });

    // Helper function to apply text color
    const applyTextColor = (range: Range, color: string, editor: HTMLDivElement) => {
      editor.focus();
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      const selectedText = sel?.toString() || '';
      const colorSpan = document.createElement('span');
      colorSpan.style.color = color;
      colorSpan.textContent = selectedText;

      range.deleteContents();
      range.insertNode(colorSpan);
      range.selectNodeContents(colorSpan);
      sel?.removeAllRanges();
      sel?.addRange(range);
    };

    // Handle Shift+Enter for line break without creating list item
    editorContent?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const br = document.createElement('br');
          range.deleteContents();
          range.insertNode(br);
          range.setStartAfter(br);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    });

    const closeModal = () => {
      modal.remove();
      this.noteEditorModal = null;
    };

    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal();
    });
    cancelBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal();
    });
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        e.stopPropagation();
        closeModal();
      }
    });

    saveBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      // If read-only, just close
      if (readOnly) {
        modal.remove();
        this.noteEditorModal = null;
        return;
      }

      const title = titleInput?.value.trim();

      // Sync checkbox states before getting HTML
      const checkboxes = editorContent?.querySelectorAll('input[type=\"checkbox\"]');
      checkboxes?.forEach((checkbox: Element) => {
        const cb = checkbox as HTMLInputElement;
        if (cb.checked) {
          cb.setAttribute('checked', 'checked');
        } else {
          cb.removeAttribute('checked');
        }
      });

      const content = editorContent?.innerHTML.trim();

      if (!title) {
        alert('O título da nota não pode estar vazio');
        titleInput?.focus();
        return;
      }

      if (!content || content === '<br>' || content === '') {
        alert('O conteúdo da nota não pode estar vazio');
        editorContent?.focus();
        return;
      }

      try {
        if (isEditing) {
          // Update existing note
          await this.requestFromContentScript({
            type: 'UPDATE_NOTE',
            payload: { id: existingNote.id, title, content }
          });
          console.log('[PrinChat UI] Note updated successfully');
        } else {
          // Create new note
          await this.requestFromContentScript({
            type: 'CREATE_NOTE',
            payload: {
              chatId,
              chatName,
              chatPhoto,
              title,
              content,
            }
          });
          console.log('[PrinChat UI] Note created successfully');
        }

        // Close modal
        modal.remove();
        this.noteEditorModal = null;

        // Refresh notes list
        if (options?.onSave) {
          options.onSave();
        } else {
          await this.refreshNotesList(chatId);
        }

        // Update badge
        this.updateNotesBadge();
        this.updateGlobalNotesBadge();
      } catch (error) {
        console.error('[PrinChat UI] Error saving note:', error);
        alert('Erro ao salvar nota');
      }
    });
  }

  /**
   * Refresh notes list in the notes popup
   */
  private openLinkModal(editorContent: HTMLDivElement) {
    // Save current selection
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      alert('Selecione o texto que deseja transformar em link');
      return;
    }

    const selectedText = selection.toString();
    const savedRange = selection.getRangeAt(0);

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'princhat-link-modal';
    modal.innerHTML = `
      <div class="princhat-link-modal-backdrop"></div>
      <div class="princhat-link-modal-container">
        <div class="princhat-link-modal-header">
          <h3>Inserir Link</h3>
          <button class="princhat-link-modal-close" title="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="princhat-link-modal-body">
          <div class="princhat-link-field-group">
            <label>Texto do link:</label>
            <input type="text" class="princhat-link-text-input" value="${selectedText}" />
          </div>
          <div class="princhat-link-field-group">
            <label>URL:</label>
            <input type="url" class="princhat-link-url-input" placeholder="https://exemplo.com" autofocus />
          </div>
          <div class="princhat-link-checkbox-group">
            <label class="princhat-toggle-switch">
              <input type="checkbox" class="princhat-link-checkbox" />
              <span class="princhat-toggle-slider"></span>
            </label>
            <label class="princhat-toggle-label">Abrir em nova aba</label>
          </div>
        </div>
        <div class="princhat-link-modal-footer">
          <button class="princhat-link-modal-cancel">Cancelar</button>
          <button class="princhat-link-modal-insert">Inserir</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const urlInput = modal.querySelector('.princhat-link-url-input') as HTMLInputElement;
    const textInput = modal.querySelector('.princhat-link-text-input') as HTMLInputElement;
    const newTabCheckbox = modal.querySelector('.princhat-link-checkbox') as HTMLInputElement;
    const closeBtn = modal.querySelector('.princhat-link-modal-close');
    const cancelBtn = modal.querySelector('.princhat-link-modal-cancel');
    const insertBtn = modal.querySelector('.princhat-link-modal-insert');
    const backdrop = modal.querySelector('.princhat-link-modal-backdrop');

    const closeModal = () => {
      modal.remove();
    };

    const insertLink = () => {
      const url = urlInput?.value.trim();
      const text = textInput?.value.trim();
      const newTab = newTabCheckbox?.checked;

      if (!url) {
        alert('Digite uma URL válida');
        urlInput?.focus();
        return;
      }

      // Restore selection and insert link
      editorContent.focus();
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRange);

      // Create link element
      const link = document.createElement('a');
      link.href = url;
      link.textContent = text || selectedText;
      if (newTab) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }

      savedRange.deleteContents();
      savedRange.insertNode(link);

      // Move cursor after link
      savedRange.setStartAfter(link);
      savedRange.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(savedRange);

      closeModal();
    };

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    backdrop?.addEventListener('click', closeModal);
    insertBtn?.addEventListener('click', insertLink);

    // Insert on Enter
    urlInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        insertLink();
      }
    });
  }

  /**
   * Update schedule status (for pause/resume)
   */
  private async refreshNotesList(chatId: string) {
    try {
      console.log('[PrinChat UI] Refreshing notes list for chatId:', chatId);

      // Get chat photo using GET_ACTIVE_CHAT (same as schedule popups)
      let chatPhoto = '';
      let chatName = 'Chat';
      try {
        const chatResponse = await this.requestFromContentScript({ type: 'GET_ACTIVE_CHAT' });
        console.log('[PrinChat UI] 📸 FULL chatResponse for notes:', JSON.stringify(chatResponse, null, 2));
        chatPhoto = chatResponse?.data?.chatPhoto || '';
        chatName = chatResponse?.data?.name || 'Chat';
        console.log('[PrinChat UI] Chat info for notes:', { chatPhoto: !!chatPhoto, chatPhotoValue: chatPhoto, chatName });
      } catch (e) {
        console.log('[PrinChat UI] Could not get chat info:', e);
      }

      const response = await this.requestFromContentScript({
        type: 'GET_NOTES_BY_CHAT',
        payload: { chatId }
      }) as any;

      console.log('[PrinChat UI] GET_NOTES_BY_CHAT response:', response);

      const notes = response?.data || [];
      console.log('[PrinChat UI] Extracted notes:', notes, 'Count:', notes.length);

      if (!this.notesPopup) {
        console.log('[PrinChat UI] Notes popup not found');
        return;
      }

      const notesListContainer = this.notesPopup.querySelector('.princhat-notes-list');
      if (!notesListContainer) {
        console.log('[PrinChat UI] Notes list container not found');
        return;
      }

      if (!notes || notes.length === 0) {
        console.log('[PrinChat UI] No notes found, showing empty state');
        notesListContainer.innerHTML = `
          <div class="princhat-notes-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/>
              <path d="M2 6h4"/>
              <path d="M2 10h4"/>
              <path d="M2 14h4"/>
              <path d="M2 18h4"/>
              <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>
            </svg>
            <p>Nenhuma nota criada</p>
            <span>Clique em "Nova Nota" para adicionar</span>
          </div>
        `;
        return;
      }

      console.log('[PrinChat UI] Rendering', notes.length, 'note cards');

      // Sort notes by most recent first
      notes.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Render note cards
      notesListContainer.innerHTML = notes.map((note: any) => {
        const preview = this.getTextPreview(note.content, 80);
        const date = new Date(note.createdAt).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });

        // Use pre-loaded chat photo if available, otherwise use placeholder with initial
        const photoHtml = chatPhoto
          ? `<img src="${chatPhoto}" alt="" class="princhat-note-card-photo">`
          : `<div class="princhat-note-card-photo-placeholder">${note.chatName ? note.chatName.charAt(0).toUpperCase() : 'U'}</div>`;

        return `
          <div class="princhat-note-card" data-note-id="${note.id}">
            <div class="princhat-note-card-photo-wrapper">
              ${photoHtml}
              <div class="princhat-note-card-icon-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/>
                  <path d="M2 6h4"/>
                  <path d="M2 10h4"/>
                  <path d="M2 14h4"/>
                  <path d="M2 18h4"/>
                  <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>
                </svg>
              </div>
            </div>
            <div class="princhat-note-card-content">
              <div class="princhat-note-card-header">
                <h4 class="princhat-note-card-title">${note.title}</h4>
                <div class="princhat-note-card-actions">
                  <button class="princhat-script-btn-icon" data-action="view" data-note-id="${note.id}" title="Visualizar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  </button>
                  <button class="princhat-script-btn-icon" data-action="edit" data-note-id="${note.id}" title="Editar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                    </svg>
                  </button>
                  <button class="princhat-script-btn-icon" data-action="delete" data-note-id="${note.id}" title="Excluir">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="princhat-note-card-preview">${preview}</div>
              <div class="princhat-note-card-footer">
                <span class="princhat-note-card-date">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  ${date}
                </span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Add event listeners to edit and delete buttons
      this.attachNoteCardListeners(chatId);
    } catch (error) {
      console.error('[PrinChat UI] Error refreshing notes list:', error);
    }
  }

  /**
   * Get text preview from HTML content
   */
  private getTextPreview(htmlContent: string, maxLength: number): string {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const text = tempDiv.textContent || tempDiv.innerText || '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  /**
   * Attach event listeners to note card buttons
   */
  private attachNoteCardListeners(chatId: string) {
    if (!this.notesPopup) return;

    // View buttons (read-only mode)
    const viewButtons = this.notesPopup.querySelectorAll('[data-action="view"][data-note-id]');
    viewButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        e.stopPropagation();
        const noteId = (button as HTMLElement).dataset.noteId;
        if (!noteId) return;

        try {
          const response = await this.requestFromContentScript({
            type: 'GET_NOTE',
            payload: { id: noteId }
          }) as any;

          const note = response?.data;
          if (note) {
            this.openNoteEditorModal(chatId, note.chatName, note.chatPhoto, note, true); // true = read-only
          }
        } catch (error) {
          console.error('[PrinChat UI] Error loading note for viewing:', error);
        }
      });
    });

    // Edit buttons
    const editButtons = this.notesPopup.querySelectorAll('[data-action="edit"][data-note-id]');
    editButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        e.stopPropagation();
        const noteId = (button as HTMLElement).dataset.noteId;
        if (!noteId) return;

        try {
          const response = await this.requestFromContentScript({
            type: 'GET_NOTE',
            payload: { id: noteId }
          }) as any;

          const note = response?.data;
          if (note) {
            this.openNoteEditorModal(chatId, note.chatName, note.chatPhoto, note);
          }
        } catch (error) {
          console.error('[PrinChat UI] Error loading note:', error);
        }
      });
    });

    // Delete buttons
    const deleteButtons = this.notesPopup.querySelectorAll('[data-action="delete"][data-note-id]');
    deleteButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const noteId = (button as HTMLElement).dataset.noteId;
        if (!noteId) return;

        // Show custom confirmation modal
        this.showNoteDeleteConfirmation(noteId, chatId);
      });
    });
  }

  /**
   * Show delete confirmation modal for notes
   */
  private showNoteDeleteConfirmation(noteId: string, chatId: string, options?: { onSuccess?: () => void }) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'princhat-modal-overlay'; // Add class for click-outside detection
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
    `;

    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      border-radius: 8px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    `;

    modal.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #ffffff;">
          Excluir nota
        </h3>
        <p style="margin: 0; font-size: 14px; color: #9e9e9e;">
          Tem certeza que deseja excluir esta nota? Esta ação não pode ser desfeita.
        </p>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button class="cancel-btn" style="
          padding: 8px 20px;
          border: 1px solid #3a3a3a;
          background: transparent;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: all 0.2s;
        ">CANCELAR</button>
        <button class="confirm-btn" style="
          padding: 8px 20px;
          border: none;
          background: #f44336;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: all 0.2s;
        ">EXCLUIR</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Add event listeners
    const cancelBtn = modal.querySelector('.cancel-btn') as HTMLElement;
    const confirmBtn = modal.querySelector('.confirm-btn') as HTMLElement;

    const closeModal = () => overlay.remove();

    // Add hover effects
    if (cancelBtn) {
      cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = '#3a3a3a';
        cancelBtn.style.borderColor = '#e91e63';
      });
      cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = 'transparent';
        cancelBtn.style.borderColor = '#3a3a3a';
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('mouseenter', () => {
        confirmBtn.style.background = '#c62828';
      });
      confirmBtn.addEventListener('mouseleave', () => {
        confirmBtn.style.background = '#f44336';
      });
    }

    cancelBtn?.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent click from reaching popup handlers
      closeModal();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        e.stopPropagation();
        closeModal();
      }
    });

    confirmBtn?.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent click from reaching popup handlers
      e.preventDefault();
      closeModal();
      try {
        await this.requestFromContentScript({
          type: 'DELETE_NOTE',
          payload: { id: noteId }
        });

        if (options?.onSuccess) {
          options.onSuccess();
        } else {
          await this.refreshNotesList(chatId);
          this.updateNotesBadge();
        }
        this.updateGlobalNotesBadge();
      } catch (error) {
        console.error('[PrinChat UI] Error deleting note:', error);
        alert('Erro ao excluir nota');
      }
    });
  }



  /**
   * Update schedule status (for pause/resume)
   */
  private async updateScheduleStatus(scheduleId: string, status: string) {
    try {
      await this.requestFromContentScript({
        type: 'UPDATE_SCHEDULE_STATUS',
        payload: { id: scheduleId, status }
      });
      console.log('[PrinChat UI] Schedule status updated:', scheduleId, status);
      await this.updateScheduleButton();
    } catch (error) {
      console.error('[PrinChat UI] Error updating schedule status:', error);
      alert('Erro ao atualizar status do agendamento');
    }
  }

  /**
   * Show custom delete confirmation modal for schedules
   */
  private showScheduleDeleteConfirmation(scheduleId: string) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'princhat-modal-overlay'; // Add class for click-outside detection
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647; // Max safe integer
    `;

    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      border-radius: 8px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    `;

    modal.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #ffffff;">
          Cancelar agendamento
        </h3>
        <p style="margin: 0; font-size: 14px; color: #9e9e9e;">
          Tem certeza que deseja cancelar este agendamento? Esta ação não pode ser desfeita.
        </p>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button class="cancel-btn" style="
          padding: 8px 20px;
          border: 1px solid #3a3a3a;
          background: transparent;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: all 0.2s;
        ">CANCELAR</button>
        <button class="confirm-btn" style="
          padding: 8px 20px;
          border: none;
          background: #f44336;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: all 0.2s;
        ">EXCLUIR</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Track modal reference
    this.scheduleDeleteConfirmationModal = overlay;

    // Add event listeners
    const cancelBtn = modal.querySelector('.cancel-btn') as HTMLElement;
    const confirmBtn = modal.querySelector('.confirm-btn') as HTMLElement;

    const closeModal = () => {
      overlay.remove();
      this.scheduleDeleteConfirmationModal = null;
    };

    // Add hover effects
    if (cancelBtn) {
      cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = 'var(--bg-hover)';
        cancelBtn.style.borderColor = '#e91e63';
      });
      cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = 'transparent';
        cancelBtn.style.borderColor = 'var(--border-color)';
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('mouseenter', () => {
        confirmBtn.style.background = '#c62828';
      });
      confirmBtn.addEventListener('mouseleave', () => {
        confirmBtn.style.background = '#f44336';
      });
    }

    cancelBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    confirmBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      closeModal();
      await this.deleteSchedule(scheduleId);
      await this.refreshScheduleListPopup();
    });
  }

  /**
   * Delete a schedule
   */
  private async deleteSchedule(scheduleId: string) {
    try {
      await this.requestFromContentScript({
        type: 'DELETE_SCHEDULE',
        payload: { id: scheduleId }
      });
      console.log('[PrinChat UI] Schedule deleted:', scheduleId);

      // If global popup is open, update its data and re-render
      if (this.globalSchedulesPopup) {
        this.globalSchedulesData = this.globalSchedulesData.filter(s => s.id !== scheduleId);
        const searchInput = this.globalSchedulesPopup.querySelector('.princhat-schedules-search-input') as HTMLInputElement;
        this.renderGlobalSchedulesContent(this.globalSchedulesActiveTab, searchInput?.value || '');
        console.log('[PrinChat UI] Global popup updated after deletion');
      }
      this.updateGlobalSchedulesBadge();
    } catch (error) {
      console.error('[PrinChat UI] Error deleting schedule:', error);
      alert('Erro ao cancelar agendamento');
    }
  }

  /**
   * Refresh schedule list popup content in-place (without closing)
   */
  private async refreshScheduleListPopup() {
    if (!this.scheduleListPopup) {
      console.log('[PrinChat UI] No schedule popup to refresh');
      return;
    }

    console.log('[PrinChat UI] Refreshing schedule list popup...');

    // Get active chat ID
    const chatId = await this.getActiveChatId() || '';

    // Get chat photo and name
    let chatPhoto = '';
    let chatName = 'Chat';
    try {
      const chatResponse = await this.requestFromContentScript({ type: 'GET_ACTIVE_CHAT' });
      chatPhoto = chatResponse?.data?.chatPhoto || '';
      chatName = chatResponse?.data?.chatName || chatResponse?.data?.name || 'Chat';
    } catch (e) {
      console.log('[PrinChat UI] Could not get chat info:', e);
    }

    // Load schedules for this chat
    const response = await this.requestFromContentScript({
      type: 'GET_SCHEDULES_BY_CHAT',
      payload: { chatId }
    });

    const schedules: Schedule[] = response?.data || [];

    // Categorize schedules by status
    const pending = schedules.filter(s => s.status === 'pending');
    const paused = schedules.filter(s => s.status === 'paused');
    const completed = schedules.filter(s => s.status === 'completed');
    const cancelled = schedules.filter(s => s.status === 'cancelled');
    const failed = schedules.filter(s => s.status === 'failed');

    // Build schedule list HTML with sections
    let scheduleListHTML = '';
    if (schedules.length === 0) {
      scheduleListHTML = `
        <div class="princhat-schedule-list-empty">
          <div class="princhat-schedule-list-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div class="princhat-schedule-list-empty-title">Nenhum agendamento</div>
          <div class="princhat-schedule-list-empty-subtitle">Crie seu primeiro agendamento</div>
        </div>
      `;
    } else {
      // Build sections in order: Pending, Paused, Completed, Cancelled, Failed
      if (pending.length > 0) {
        scheduleListHTML += `
          <div class="princhat-schedule-section">
            <div class="princhat-schedule-section-header">
              <span>Pendentes</span>
              <span class="princhat-schedule-section-count">${pending.length}</span>
            </div>
            ${pending.map(s => this.buildScheduleCardHTML(s, chatPhoto, chatName)).join('')}
          </div>
        `;
      }

      if (paused.length > 0) {
        scheduleListHTML += `
          <div class="princhat-schedule-section">
            <div class="princhat-schedule-section-header">
              <span>Pausados</span>
              <span class="princhat-schedule-section-count">${paused.length}</span>
            </div>
            ${paused.map(s => this.buildScheduleCardHTML(s, chatPhoto, chatName)).join('')}
          </div>
        `;
      }

      if (completed.length > 0) {
        scheduleListHTML += `
          <div class="princhat-schedule-section">
            <div class="princhat-schedule-section-header">
              <span>Enviados</span>
              <span class="princhat-schedule-section-count">${completed.length}</span>
            </div>
            ${completed.map(s => this.buildScheduleCardHTML(s, chatPhoto, chatName)).join('')}
          </div>
        `;
      }

      if (cancelled.length > 0) {
        scheduleListHTML += `
          <div class="princhat-schedule-section">
            <div class="princhat-schedule-section-header">
              <span>Cancelados</span>
              <span class="princhat-schedule-section-count">${cancelled.length}</span>
            </div>
            ${cancelled.map(s => this.buildScheduleCardHTML(s, chatPhoto, chatName)).join('')}
          </div>
        `;
      }

      if (failed.length > 0) {
        scheduleListHTML += `
          <div class="princhat-schedule-section">
            <div class="princhat-schedule-section-header">
              <span>Falhados</span>
              <span class="princhat-schedule-section-count">${failed.length}</span>
            </div>
            ${failed.map(s => this.buildScheduleCardHTML(s, chatPhoto, chatName)).join('')}
          </div>
        `;
      }
    }

    // Update content area
    const contentArea = this.scheduleListPopup.querySelector('.princhat-schedule-list-content');
    if (contentArea) {
      contentArea.innerHTML = scheduleListHTML;

      // Re-attach event listeners for action buttons with SAME logic as main popup
      const actionButtons = contentArea.querySelectorAll('[data-action]');
      actionButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const action = (btn as HTMLElement).dataset.action;
          const scheduleId = (btn as HTMLElement).dataset.scheduleId;

          if (!scheduleId) return;

          const popup = this.scheduleListPopup;
          if (!popup) return;

          switch (action) {
            case 'pause':
            case 'resume':
              // Use same incremental update logic as main popup
              const newStatus = action === 'pause' ? 'paused' : 'pending';
              await this.updateScheduleStatus(scheduleId, newStatus);

              // Refresh entire popup since we just edited
              await this.refreshScheduleListPopup();
              break;

            case 'edit':
              const scheduleToEdit = schedules.find(s => s.id === scheduleId);
              if (scheduleToEdit) {
                this.openScheduleCreationModal(scheduleToEdit);
              } else {
                alert('Erro ao carregar agendamento para edição');
              }
              break;

            case 'delete':
              this.showScheduleDeleteConfirmation(scheduleId);
              break;
          }
        });
      });
    }

    console.log('[PrinChat UI] Schedule list popup refreshed');
  }

  /**
   * Toggle global schedules popup (accessed from header)
   * Shows ALL schedules from ALL chats with tabs, search, and calendar button
   */

  private globalSchedulesActiveTab: 'pending' | 'paused' | 'completed' = 'pending';

  private async toggleGlobalSchedulesPopup(button: HTMLElement) {
    // Close if already open
    if (this.globalSchedulesPopup) {
      this.globalSchedulesPopup.remove();
      this.globalSchedulesPopup = null;
      return;
    }

    // Close other popups
    this.closeAllGlobalPopups();

    console.log('[PrinChat UI] Opening global schedules popup...');

    // Load ALL schedules (from all chats)
    const response = await this.requestFromContentScript({
      type: 'GET_ALL_SCHEDULES'
    });

    const allSchedules: Schedule[] = response?.data || [];
    console.log('[PrinChat UI] Loaded', allSchedules.length, 'schedules from all chats');
    console.log('[PrinChat UI] Response:', response);
    console.log('[PrinChat UI] Schedules:', allSchedules);

    // Store schedules in class property for updates
    this.globalSchedulesData = allSchedules;

    // Create popup
    const popup = document.createElement('div');
    popup.className = 'princhat-global-schedules-popup';

    // Create header
    popup.innerHTML = `
      <div class="princhat-global-schedules-header">
        <h3>Agendamentos</h3>
        <button class="princhat-popup-close-btn" title="Fechar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="princhat-global-schedules-tabs">
        <button class="princhat-schedule-tab active" data-tab="pending">Pendentes</button>
        <button class="princhat-schedule-tab" data-tab="paused">Pausados</button>
        <button class="princhat-schedule-tab" data-tab="completed">Enviados</button>
      </div>

      <div class="princhat-global-schedules-search">
        <svg class="princhat-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input type="text" placeholder="Buscar agendamentos..." class="princhat-schedules-search-input" />
      </div>

      <div class="princhat-global-schedules-content"></div>

      <div class="princhat-global-schedules-footer">
        <button class="princhat-view-calendar-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
            <line x1="16" x2="16" y1="2" y2="6"/>
            <line x1="8" x2="8" y1="2" y2="6"/>
            <line x1="3" x2="21" y1="10" y2="10"/>
          </svg>
          Ver agendamentos
        </button>
      </div>
    `;

    document.body.appendChild(popup);
    this.globalSchedulesPopup = popup;

    // Position popup below button (same as other header popups)
    const rect = button.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = `${rect.bottom + 8}px`;
    popup.style.right = `${window.innerWidth - rect.right}px`;
    popup.style.width = '500px'; // Fixed width like chat schedule popup

    // Render initial content
    this.renderGlobalSchedulesContent('pending', '');

    // Tab click handlers
    const tabs = popup.querySelectorAll('.princhat-schedule-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = (tab as HTMLElement).dataset.tab as 'pending' | 'paused' | 'completed';

        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.globalSchedulesActiveTab = tabName;

        // Re-render content using stored schedules
        const searchInput = popup.querySelector('.princhat-schedules-search-input') as HTMLInputElement;
        this.renderGlobalSchedulesContent(tabName, searchInput?.value || '');
      });
    });

    // Search input handler
    const searchInput = popup.querySelector('.princhat-schedules-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      this.renderGlobalSchedulesContent(this.globalSchedulesActiveTab, searchInput.value);
    });

    // Close button handler
    const closeBtn = popup.querySelector('.princhat-popup-close-btn');
    closeBtn?.addEventListener('click', () => {
      popup.remove();
      this.globalSchedulesPopup = null;
      // Clear timer interval when closing
      if (this.globalSchedulesTimerInterval) {
        clearInterval(this.globalSchedulesTimerInterval);
        this.globalSchedulesTimerInterval = null;
      }
    });

    // Calendar button handler
    const calendarBtn = popup.querySelector('.princhat-view-calendar-btn');
    calendarBtn?.addEventListener('click', () => {
      this.openScheduleCalendarModal();
    });

    // Close on outside click
    const closeOnOutsideClick = (e: MouseEvent) => {
      let target = e.target as HTMLElement;

      // Ignore clicks on elements that are no longer part of the DOM (e.g. closed modals)
      if (!target.isConnected) return;

      // Handle text nodes (clicking on text)
      if (target.nodeType === Node.TEXT_NODE) {
        target = target.parentElement as HTMLElement;
      }

      // Safety check
      if (!target || !target.closest) return;

      // Don't close if clicking inside popup, on button, or on any modal
      const isModal = target.closest('.princhat-modal-overlay') ||
        target.closest('.princhat-schedule-modal') ||
        target.closest('.princhat-confirmation-modal');

      if (!popup.contains(target) && !button.contains(target) && !isModal) {
        popup.remove();
        this.globalSchedulesPopup = null;
        // Clear timer interval when closing
        if (this.globalSchedulesTimerInterval) {
          clearInterval(this.globalSchedulesTimerInterval);
          this.globalSchedulesTimerInterval = null;
        }
        document.removeEventListener('click', closeOnOutsideClick);
      }
    };
    // Delay to avoid immediate closing
    setTimeout(() => {
      document.addEventListener('click', closeOnOutsideClick);
    }, 100);

    // Update timers in real-time (every second)
    this.globalSchedulesTimerInterval = setInterval(() => {
      if (!this.globalSchedulesPopup) {
        // Popup was closed, clear interval
        if (this.globalSchedulesTimerInterval) {
          clearInterval(this.globalSchedulesTimerInterval);
          this.globalSchedulesTimerInterval = null;
        }
        return;
      }

      // Update all pending schedule timers
      const timerElements = popup.querySelectorAll('.princhat-script-card-timer.pending');
      timerElements.forEach((timerEl) => {
        const card = timerEl.closest('[data-schedule-id]');
        if (!card) return;

        const scheduleId = (card as HTMLElement).dataset.scheduleId;
        const schedule = this.globalSchedulesData.find(s => s.id === scheduleId);
        if (!schedule || schedule.status !== 'pending') return;

        // Recalculate relative time
        const now = Date.now();
        const diff = schedule.scheduledTime - now;

        if (diff < 0) {
          timerEl.textContent = 'Atrasado';
        } else {
          const minutes = Math.floor(diff / 60000);
          const hours = Math.floor(minutes / 60);
          const days = Math.floor(hours / 24);

          if (days > 0) {
            timerEl.textContent = `daqui ${days}d`;
          } else if (hours > 0) {
            timerEl.textContent = `daqui ${hours}h`;
          } else {
            timerEl.textContent = minutes > 0 ? `daqui ${minutes}min` : 'Agora';
          }
        }
      });
    }, 1000); // Update every second
  }


  /**
   * Close all global popups to ensure only one is open at a time
   * @param except Optional popup to keep open (not used currently as we close before opening)
   */
  private closeAllGlobalPopups() {
    this.closeHeaderPopups();
  }

  private async toggleGlobalNotesPopup(button: HTMLElement) {
    // Close if already open
    if (this.globalNotesPopup) {
      this.globalNotesPopup.remove();
      this.globalNotesPopup = null;
      return;
    }

    // Close other popups
    this.closeAllGlobalPopups();

    console.log('[PrinChat UI] Opening global notes popup...');

    // Create popup
    const popup = document.createElement('div');
    popup.className = 'princhat-global-schedules-popup princhat-global-notes-popup-unique'; // Reuse schedules popup class + unique ID

    // Create header with standard h3 (same as schedules)
    popup.innerHTML = `
      <div class="princhat-global-schedules-header">
        <h3>Notas</h3>
        <button class="princhat-popup-close-btn princhat-global-popup-close" title="Fechar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="princhat-global-schedules-search">
        <svg class="princhat-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input type="text" placeholder="Buscar notas..." class="princhat-schedules-search-input" />
      </div>

      <div class="princhat-global-popup-content"></div>
    `;

    document.body.appendChild(popup);
    this.globalNotesPopup = popup;

    // Position popup below button (same as schedules)
    const rect = button.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = `${rect.bottom + 8}px`;
    popup.style.right = `${window.innerWidth - rect.right}px`;
    popup.style.width = '500px';

    // Close button handler
    const closeBtn = popup.querySelector('.princhat-global-popup-close');
    closeBtn?.addEventListener('click', () => {
      popup.remove();
      this.globalNotesPopup = null;
    });

    // Close on outside click
    const closeOnOutsideClick = (e: MouseEvent) => {
      let target = e.target as HTMLElement;

      // Ignore clicks on elements that are no longer part of the DOM (e.g. closed modals)
      if (!target.isConnected) return;

      // Handle text nodes (clicking on text)
      if (target.nodeType === Node.TEXT_NODE) {
        target = target.parentElement as HTMLElement;
      }

      // Safety check
      if (!target || !target.closest) return;

      // Don't close if clicking inside popup, on button, or on any modal
      const isModal = target.closest('.princhat-modal-overlay') ||
        target.closest('.princhat-note-editor-modal') ||
        target.closest('.princhat-calendar-modal-overlay') ||
        target.closest('.princhat-schedule-modal') ||
        target.closest('.princhat-confirmation-modal');

      if (!popup.contains(target) && !button.contains(target) && !isModal) {
        popup.remove();
        this.globalNotesPopup = null;
        document.removeEventListener('click', closeOnOutsideClick, true);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', closeOnOutsideClick, true);
    }, 100);

    // Initial load
    await this.refreshGlobalNotesPopup();

    // Search handler
    const searchInput = popup.querySelector('.princhat-schedules-search-input');
    searchInput?.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value;
      this.refreshGlobalNotesPopup(query);
    });
  }

  /**
   * Refresh global notes popup content
   */
  private async refreshGlobalNotesPopup(searchQuery: string = '') {
    if (!this.globalNotesPopup) return;

    const contentContainer = this.globalNotesPopup.querySelector('.princhat-global-popup-content');
    if (!contentContainer) return;

    // Show loading state if needed, or just refresh transparently
    // contentContainer.innerHTML = '<div class="princhat-loading">Carregando...</div>';

    try {
      // Load ALL notes
      const response = await this.requestFromContentScript({
        type: 'GET_ALL_NOTES'
      });

      const allNotes: Note[] = response?.data || [];

      // Filter by search query
      let filteredNotes = allNotes;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filteredNotes = allNotes.filter(n =>
          n.title.toLowerCase().includes(query) ||
          n.content.toLowerCase().includes(query) ||
          (n.chatName && n.chatName.toLowerCase().includes(query))
        );
      }

      // Update badge count based on total notes (not filtered)
      this.updateNotesBadge();

      if (filteredNotes.length === 0) {
        // Empty state
        contentContainer.innerHTML = `
          <div class="princhat-global-empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/>
              <path d="M2 6h4"/>
              <path d="M2 10h4"/>
              <path d="M2 14h4"/>
              <path d="M2 18h4"/>
              <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>
            </svg>
            <p>${searchQuery ? 'Nenhuma nota encontrada' : 'Nenhuma nota criada'}</p>
            <span>${searchQuery ? 'Tente buscar por outro termo' : 'Notas criadas nos chats aparecerão aqui'}</span>
          </div>
        `;
        return;
      }

      // Create grid of note cards
      const grid = document.createElement('div');
      grid.className = 'princhat-global-notes-grid';

      filteredNotes.forEach(note => {
        const card = document.createElement('div');
        card.className = 'princhat-note-card';
        card.dataset.noteId = note.id;

        // Get text preview
        const preview = this.getTextPreview(note.content, 80);
        const date = new Date(note.createdAt).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
        // Avatar: use first letter of contact name
        const initial = (note.chatName || 'U').charAt(0).toUpperCase();

        card.innerHTML = `
          <div class="princhat-note-card-photo-wrapper">
            <div class="princhat-note-card-photo-placeholder">${initial}</div>
            <div class="princhat-note-card-icon-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/>
                <path d="M2 6h4"/>
                <path d="M2 10h4"/>
                <path d="M2 14h4"/>
                <path d="M2 18h4"/>
                <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>
              </svg>
            </div>
          </div>
          <div class="princhat-note-card-content">
            <div class="princhat-note-card-header">
              <h4 class="princhat-note-card-title">${note.title}</h4>
              <div class="princhat-note-card-actions">
                <button class="princhat-script-btn-icon" data-action="view" data-note-id="${note.id}" title="Visualizar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
                <button class="princhat-script-btn-icon" data-action="edit" data-note-id="${note.id}" title="Editar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
                <button class="princhat-script-btn-icon" data-action="delete" data-note-id="${note.id}" title="Excluir">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="princhat-note-card-preview">${preview}</div>
            <div class="princhat-note-card-footer">
              <span class="princhat-note-card-contact">${note.chatName || 'Sem nome'}</span>
              <span class="princhat-note-card-date">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                ${date}
              </span>
            </div>
          </div>
        `;

        grid.appendChild(card);

        // Asynchronously fetch and update info on this SPECIFIC element reference
        // Updates immediately when data arrives, no setTimeout needed
        this.requestFromContentScript({ type: 'GET_CHAT_INFO', payload: { chatId: note.chatId } })
          .then((response) => {
            if (response?.success && response.data) {
              // Update name
              if (response.data.chatName) {
                const nameEl = card.querySelector('.princhat-note-card-contact');
                if (nameEl) nameEl.textContent = response.data.chatName;
              }
              // Update photo
              if (response.data.chatPhoto) {
                const photoPlaceholder = card.querySelector('.princhat-note-card-photo-placeholder');
                if (photoPlaceholder) {
                  const img = document.createElement('img');
                  img.src = response.data.chatPhoto;
                  img.alt = '';
                  img.className = 'princhat-note-card-photo';
                  photoPlaceholder.replaceWith(img);
                }
              }
            }
          })
          .catch(() => { });
      });

      contentContainer.innerHTML = '';
      contentContainer.appendChild(grid);




      // Add event listeners for card actions
      contentContainer.querySelectorAll('.princhat-script-btn-icon').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const noteId = (btn as HTMLElement).dataset.noteId!;
          const action = (btn as HTMLElement).dataset.action!;

          const note = filteredNotes.find(n => n.id === noteId);
          if (!note) return;

          // Fetch chat photo before opening modal
          let chatPhoto = '';
          try {
            const photoResponse = await this.requestFromContentScript({
              type: 'GET_CHAT_INFO',
              payload: { chatId: note.chatId }
            });
            if (photoResponse?.success && photoResponse.data) {
              chatPhoto = photoResponse.data.chatPhoto || '';
            }
          } catch (error) {
            console.log('[PrinChat UI] Could not fetch chat photo for modal:', error);
          }

          if (action === 'view') {
            await this.openNoteEditorModal(note.chatId, note.chatName || 'Contato', chatPhoto, note, true);
          } else if (action === 'edit') {
            // Pass callback to refresh THIS popup instead of chat specific one
            await this.openNoteEditorModal(note.chatId, note.chatName || 'Contato', chatPhoto, note, false, {
              onSave: () => this.refreshGlobalNotesPopup(searchQuery)
            });
          } else if (action === 'delete') {
            // Pass callback to refresh THIS popup
            this.showNoteDeleteConfirmation(note.id, note.chatId, {
              onSuccess: () => {
                this.refreshGlobalNotesPopup(searchQuery);
                this.updateNotesBadge();
                this.updateGlobalNotesBadge();
              }
            });
          }
        });
      });

    } catch (error) {
      console.error('[PrinChat UI] Error refreshing global notes:', error);
      if (contentContainer) {
        contentContainer.innerHTML = '<div class="princhat-error">Erro ao carregar notas</div>';
      }
    }
  }

  // Helper method to format note dates (currently unused, keeping for potential future use)
  // private formatNoteDate(timestamp: number): string {
  //   const date = new Date(timestamp);
  //   const now = new Date();
  //   const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  //
  //   if (diffDays === 0) {
  //     return `Hoje às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  //   } else if (diffDays === 1) {
  //     return 'Ontem';
  //   } else if (diffDays < 7) {
  //     return `${diffDays} dias atrás`;
  //   } else {
  //     return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  //   }
  // }


  /**
   * Render global schedules content based on active tab and search query
   */
  private renderGlobalSchedulesContent(tab: 'pending' | 'paused' | 'completed', searchQuery: string) {
    if (!this.globalSchedulesPopup) return;

    console.log('[PrinChat UI] renderGlobalSchedulesContent called with:', {
      totalSchedules: this.globalSchedulesData.length,
      tab,
      searchQuery
    });

    // Filter by status (tab)
    let filtered = this.globalSchedulesData.filter(s => {
      if (tab === 'pending') return s.status === 'pending';
      if (tab === 'paused') return s.status === 'paused';
      if (tab === 'completed') return s.status === 'completed';
      return false;
    });

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s => {
        // Search in chat name, message content, etc
        const chatName = s.chatId.toLowerCase(); // We'll get proper chat name when building card
        return chatName.includes(query);
      });
    }

    console.log('[PrinChat UI] Filtered schedules:', filtered.length, 'cards to render');

    // Build HTML
    const content = this.globalSchedulesPopup.querySelector('.princhat-global-schedules-content');
    if (!content) return;

    if (filtered.length === 0) {
      const emptyMessage = searchQuery.trim()
        ? 'Nenhum agendamento encontrado'
        : `Nenhum agendamento ${tab === 'pending' ? 'pendente' : tab === 'paused' ? 'pausado' : 'enviado'}`;

      content.innerHTML = `
        <div class="princhat-global-schedules-empty">
          <div class="princhat-empty-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
              <line x1="16" x2="16" y1="2" y2="6"/>
              <line x1="8" x2="8" y1="2" y2="6"/>
              <line x1="3" x2="21" y1="10" y2="10"/>
            </svg>
          </div>
          <p>${emptyMessage}</p>
        </div>
      `;
      return;
    }

    // Build cards HTML
    content.innerHTML = '';

    filtered.forEach(schedule => {
      const html = this.buildGlobalScheduleCardHTML(schedule);
      const temp = document.createElement('div');
      temp.innerHTML = html.trim();
      const cardElement = temp.firstElementChild as HTMLElement;

      if (cardElement) {
        content.appendChild(cardElement);

        // Asynchronously fetch and update info on this SPECIFIC element reference
        this.requestFromContentScript({ type: 'GET_CHAT_INFO', payload: { chatId: schedule.chatId } })
          .then((response) => {
            if (response?.success && response.data) {
              if (response.data.chatName) {
                const nameCard = cardElement.querySelector('.princhat-script-card-name');
                if (nameCard) nameCard.textContent = response.data.chatName;
              }
              if (response.data.chatPhoto) {
                const photoPlaceholder = cardElement.querySelector('.princhat-script-card-photo-placeholder');
                if (photoPlaceholder) {
                  const img = document.createElement('img');
                  img.src = response.data.chatPhoto;
                  img.alt = '';
                  img.className = 'princhat-script-card-photo';
                  photoPlaceholder.replaceWith(img);
                }
              }
            }
          })
          .catch(() => { });
      }
    });

    // Attach event listeners to cards
    this.attachGlobalScheduleCardListeners(filtered);
  }

  /**
   * Build HTML for a global schedule card (shows chat info)
   */
  private buildGlobalScheduleCardHTML(schedule: Schedule, chatName?: string, chatPhoto?: string): string {
    // Use provided values or defaults
    const displayName = chatName || schedule.chatName || schedule.chatId.split('@')[0];




    // Calculate date and time
    const date = new Date(schedule.scheduledTime);
    const formattedDate = date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short'
    });
    const formattedTime = date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Calculate relative time based on status
    let relativeTime = '';

    if (schedule.status === 'failed') {
      relativeTime = 'Falhado';
    } else if (schedule.status === 'paused') {
      relativeTime = 'Pausado';
    } else if (schedule.status === 'completed') {
      relativeTime = 'Enviado';
    } else {
      const now = Date.now();
      const diff = schedule.scheduledTime - now;

      if (diff < 0) {
        relativeTime = 'Atrasado';
      } else {
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
          relativeTime = `daqui ${days}d`;
        } else if (hours > 0) {
          relativeTime = `daqui ${hours}h`;
        } else {
          relativeTime = minutes > 0 ? `daqui ${minutes}min` : 'Agora';
        }
      }
    }

    // Get item details (message or script)
    const item = schedule.type === 'message'
      ? this.messages.find(m => m.id === schedule.itemId)
      : this.scripts.find(s => s.id === schedule.itemId);

    const itemName = schedule.type === 'message'
      ? (item as Message)?.name || (item as Message)?.content.substring(0, 40)
      : (item as Script)?.name;

    // Photo HTML - use actual contact photo or placeholder
    let photoHtml = `<div class="princhat-script-card-photo-placeholder">${displayName ? displayName.charAt(0).toUpperCase() : 'A'}</div>`;

    if (chatPhoto) {
      photoHtml = `<img src="${chatPhoto}" alt="" class="princhat-script-card-photo">`;
    }

    // Icon for message type (script or message)
    const typeIcon = schedule.type === 'script'
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

    // Timer display and color based on status
    let timerHTML = '';
    let timerClass = 'princhat-script-card-timer';

    if (schedule.status === 'completed') {
      // Green with check icon for completed
      timerHTML = `
        <span class="${timerClass} completed">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Enviado
        </span>
      `;
    } else if (schedule.status === 'paused') {
      // Orange for paused schedules
      timerClass += ' paused';
      timerHTML = `<span class="${timerClass}">${relativeTime}</span>`;
    } else {
      // Blue for all pending schedules
      timerClass += ' pending';
      timerHTML = `<span class="${timerClass}">${relativeTime}</span>`;
    }



    // Build card with proper structure: content container + actions container
    // Using same structure as buildScheduleCardHTML
    return `
      <div class="princhat-script-card princhat-schedule-card" data-schedule-id="${schedule.id}">
        <div class="princhat-schedule-card-content">
          ${photoHtml}
          <div class="princhat-script-card-info">
            <div class="princhat-script-card-name">${displayName}</div>
            <div class="princhat-schedule-item-preview">
              <span class="princhat-schedule-item-icon">${typeIcon}</span>
              <span class="princhat-schedule-item-text">${itemName || 'Item removido'}</span>
            </div>
            <div class="princhat-schedule-item-datetime">
              <span>${formattedDate}, ${formattedTime}</span>
              ${timerHTML}
            </div>
          </div>
        </div>
        <div class="princhat-schedule-card-actions">
          ${schedule.status === 'pending' || schedule.status === 'paused' ? `
          <button class="princhat-script-btn-icon ${schedule.status === 'pending' ? 'running' : ''}" data-action="${schedule.status === 'paused' ? 'resume' : 'pause'}" data-schedule-id="${schedule.id}" title="${schedule.status === 'paused' ? 'Retomar' : 'Pausar'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              ${schedule.status === 'paused'
          ? '<path d="M8 5v14l11-7z"/>'
          : '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>'}
            </svg>
          </button>
          ` : ''}
          ${schedule.status !== 'completed' ? `
          <button class="princhat-script-btn-icon" data-action="edit" data-schedule-id="${schedule.id}" title="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          </button>
          ` : ''}
          <button class="princhat-script-btn-icon" data-action="delete" data-schedule-id="${schedule.id}" title="Cancelar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }


  /**
   * Attach event listeners to global schedule cards
   */
  private attachGlobalScheduleCardListeners(schedules: Schedule[]) {
    if (!this.globalSchedulesPopup) return;

    // Action button handlers (pause/resume, edit, delete)
    const actionButtons = this.globalSchedulesPopup.querySelectorAll('[data-action]');
    actionButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = (btn as HTMLElement).dataset.action;
        const scheduleId = (btn as HTMLElement).dataset.scheduleId;

        if (!scheduleId) return;

        const scheduleIndex = schedules.findIndex(s => s.id === scheduleId);
        if (scheduleIndex === -1) return;

        const popup = this.globalSchedulesPopup;
        if (!popup) return;

        switch (action) {
          case 'pause':
          case 'resume':
            // Update status via content script
            const newStatus = action === 'pause' ? 'paused' : 'pending';
            await this.updateScheduleStatus(scheduleId, newStatus);

            // Update in globalSchedulesData
            const globalIndex = this.globalSchedulesData.findIndex(s => s.id === scheduleId);
            if (globalIndex !== -1) {
              this.globalSchedulesData[globalIndex].status = newStatus as 'pending' | 'paused';
            }

            // Re-render current tab to move card to correct category
            const searchInput = popup.querySelector('.princhat-schedules-search-input') as HTMLInputElement;
            this.renderGlobalSchedulesContent(this.globalSchedulesActiveTab, searchInput?.value || '');
            break;

          case 'edit':
            const scheduleToEdit = schedules.find(s => s.id === scheduleId);
            if (scheduleToEdit) {
              // Prevent popup from closing when opening edit modal
              e.preventDefault();
              e.stopImmediatePropagation();
              this.openScheduleCreationModal(scheduleToEdit);
            } else {
              console.error('[PrinChat UI] Schedule not found for edit:', scheduleId);
              alert('Erro ao carregar agendamento para edição');
            }
            break;

          case 'delete':
            this.showScheduleDeleteConfirmation(scheduleId);
            // After deletion confirmed refresh the global schedules data and re-render
            // This happens via the SCHEDULE_DELETED event listener
            break;
        }
      });
    });

    // Card click handlers (could navigate to chat in future)
    const cards = this.globalSchedulesPopup.querySelectorAll('.princhat-schedule-card');
    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't trigger if clicking on action buttons
        if ((e.target as HTMLElement).closest('[data-action]')) {
          return;
        }
        const scheduleId = (card as HTMLElement).dataset.scheduleId;
        console.log('[PrinChat UI] Schedule card clicked:', scheduleId);
        // Could navigate to chat here in future enhancement
      });
    });
  }

  /**
   * Helper to show a custom confirmation modal within the calendar context
   */
  private showCalendarConfirmationModal(title: string, message: string, onConfirm: () => Promise<void>) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'princhat-calendar-modal-overlay';
    overlay.style.zIndex = '100002'; // Higher than calendar modal (100000)

    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      border-radius: 8px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    modal.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #ffffff;">${title}</h3>
        <p style="margin: 0; font-size: 14px; color: #9e9e9e;">${message}</p>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button class="cancel-btn" style="
          padding: 8px 20px;
          border: 1px solid #3a3a3a;
          background: transparent;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: all 0.2s;
        ">CANCELAR</button>
        <button class="confirm-btn" style="
          padding: 8px 20px;
          border: none;
          background: #f44336;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: all 0.2s;
        ">EXCLUIR</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Event listeners
    const cancelBtn = modal.querySelector('.cancel-btn') as HTMLElement;
    const confirmBtn = modal.querySelector('.confirm-btn') as HTMLElement;

    const closeModal = () => {
      overlay.remove();
    };

    // Hover effects
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = 'rgba(233, 30, 99, 0.1)';
      cancelBtn.style.borderColor = '#e91e63';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = 'transparent';
      cancelBtn.style.borderColor = '#3a3a3a';
    });

    confirmBtn.addEventListener('mouseenter', () => {
      confirmBtn.style.background = '#c62828';
    });
    confirmBtn.addEventListener('mouseleave', () => {
      confirmBtn.style.background = '#f44336';
    });

    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    confirmBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      // Disable button to prevent double clicks
      confirmBtn.style.opacity = '0.7';
      confirmBtn.style.pointerEvents = 'none';
      confirmBtn.textContent = 'EXCLUINDO...';

      await onConfirm();
      closeModal();
    });
  }

  /**
   * Open custom schedule calendar modal
   */
  private async openScheduleCalendarModal() {
    console.log('[PrinChat Calendar] Opening calendar modal');

    const response = await this.requestFromContentScript({ type: 'GET_ALL_SCHEDULES' });
    let allSchedules: Schedule[] = response?.success ? (response.data || []) : [];
    let selectedDate = new Date();
    let viewMonth = selectedDate.getMonth();
    let viewYear = selectedDate.getFullYear();

    const overlay = document.createElement('div');
    overlay.className = 'princhat-calendar-modal-overlay';
    overlay.style.zIndex = '2147483647'; // Max safe integer

    const modal = document.createElement('div');
    modal.className = 'princhat-calendar-modal';

    const renderCalendar = async () => {
      const freshResponse = await this.requestFromContentScript({ type: 'GET_ALL_SCHEDULES' });
      allSchedules = freshResponse?.success ? (freshResponse.data || []) : [];

      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth();
      const currentDay = currentDate.getDate();

      const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

      modal.innerHTML = `
        <div class="princhat-calendar-header">
          <div class="princhat-calendar-header-main">
            <div class="princhat-calendar-title-section">
              <h2 class="princhat-calendar-title">Central de Agendamentos - ${monthNames[viewMonth]}</h2>
              <p class="princhat-calendar-subtitle">Visualize e gerencie seus envios programados</p>
            </div>
            <button class="princhat-calendar-close-btn"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
          </div>
          <div class="princhat-calendar-search-bar">
            <input type="text" class="princhat-calendar-search-input" placeholder="Pesquisar por contato ou conteúdo...">
            <button class="princhat-calendar-cancel-day-btn">Cancelar agendamentos do dia</button>
          </div>
        </div>
        
        <div class="princhat-calendar-body">
          <div class="princhat-calendar-left">
            <div class="princhat-calendar-nav">
              <button class="princhat-calendar-prev-month">&lt;</button>
              <span class="princhat-calendar-month-year">${monthNames[viewMonth]} ${viewYear}</span>
              <button class="princhat-calendar-next-month">&gt;</button>
            </div>
            <div class="princhat-calendar-weekdays">
              <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
            </div>
            <div class="princhat-calendar-grid">
              <div class="princhat-calendar-days">
                ${this.buildCalendarGrid(viewYear, viewMonth, selectedDate, currentYear, currentMonth, currentDay, allSchedules)}
              </div>
            </div>
          </div>
          
          <div class="princhat-calendar-right">
            <div class="princhat-calendar-day-header">
              <h3 class="princhat-calendar-day-title">${selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</h3>
            </div>
            <div class="princhat-calendar-schedules-list">
              ${await this.buildDaySchedulesHTML(selectedDate, allSchedules)}
            </div>
          </div>
        </div>
      `;

      const closeBtn = modal.querySelector('.princhat-calendar-close-btn');
      closeBtn?.addEventListener('click', () => {
        overlay.remove();
      });

      const prevBtn = modal.querySelector('.princhat-calendar-prev-month');
      prevBtn?.addEventListener('click', () => {
        viewMonth--;
        if (viewMonth < 0) {
          viewMonth = 11;
          viewYear--;
        }
        renderCalendar();
      });

      const nextBtn = modal.querySelector('.princhat-calendar-next-month');
      nextBtn?.addEventListener('click', () => {
        viewMonth++;
        if (viewMonth > 11) {
          viewMonth = 0;
          viewYear++;
        }
        renderCalendar();
      });

      const dayCells = modal.querySelectorAll('.princhat-calendar-day:not(.other-month)');
      dayCells.forEach(cell => {
        cell.addEventListener('click', async () => {
          const day = parseInt((cell as HTMLElement).dataset.day || '0');
          selectedDate = new Date(viewYear, viewMonth, day);
          renderCalendar();
        });
      });

      const cancelDayBtn = modal.querySelector('.princhat-calendar-cancel-day-btn');
      cancelDayBtn?.addEventListener('click', async () => {
        await this.cancelDaySchedules(selectedDate, allSchedules, renderCalendar);
      });
    };

    await renderCalendar();

    modal.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const button = target.closest('[data-action]') as HTMLElement;

      if (!button) return;

      const action = button.dataset.action;
      const scheduleId = button.dataset.scheduleId;

      if (!scheduleId || !action) return;

      const schedule = allSchedules.find(s => s.id === scheduleId);
      if (!schedule) return;

      if (action === 'pause' || action === 'resume') {
        const newStatus = schedule.status === 'paused' ? 'pending' : 'paused';
        await this.requestFromContentScript({
          type: 'UPDATE_SCHEDULE_STATUS',
          payload: { id: scheduleId, status: newStatus }
        });
        await renderCalendar();

      } else if (action === 'edit') {
        this.openScheduleCreationModal(schedule);
        const checkModalClosed = setInterval(() => {
          if (!this.scheduleCreationModal) {
            clearInterval(checkModalClosed);
            renderCalendar();
          }
        }, 300);

      } else if (action === 'delete') {
        this.showCalendarConfirmationModal(
          'Cancelar agendamento',
          'Tem certeza que deseja cancelar este agendamento? Esta ação não pode ser desfeita.',
          async () => {
            await this.requestFromContentScript({
              type: 'DELETE_SCHEDULE',
              payload: { id: scheduleId }
            });
            await renderCalendar();
          }
        );
      }
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      // Close on overlay click OR close button click
      const target = e.target as HTMLElement;
      if (target === overlay || target.closest('[data-action="close"]')) {
        clearInterval(updateInterval);
        overlay.remove();
      }
    });

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearInterval(updateInterval);
        overlay.remove();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);

    // --- SMART POLLING FOR REAL-TIME UPDATES ---
    // Check for updates every 2 seconds
    const updateInterval = setInterval(async () => {
      // If modal is closed (removed from DOM), stop polling
      if (!overlay || !document.body.contains(overlay)) {
        clearInterval(updateInterval);
        return;
      }

      try {
        const freshResponse = await this.requestFromContentScript({ type: 'GET_ALL_SCHEDULES' });
        const freshSchedules: Schedule[] = freshResponse?.success ? (freshResponse.data || []) : [];

        // Check difference by signature (id + status)
        const currentSignature = allSchedules.map(s => s.id + s.status).sort().join('|');
        const freshSignature = freshSchedules.map(s => s.id + s.status).sort().join('|');

        if (currentSignature !== freshSignature) {
          // Update data source
          allSchedules = freshSchedules;
          // Re-render
          await renderCalendar();
        }
      } catch (err) {
        // Silent error
      }
    }, 2000);
  }

  private buildCalendarGrid(year: number, month: number, selectedDate: Date, currentYear: number, currentMonth: number, currentDay: number, schedules: Schedule[]): string {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    let daysHTML = '';

    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      daysHTML += `<div class="princhat-calendar-day other-month"><span class="princhat-calendar-day-number">${day}</span></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = year === currentYear && month === currentMonth && day === currentDay;
      const isSelected = year === selectedDate.getFullYear() && month === selectedDate.getMonth() && day === selectedDate.getDate();

      const daySchedules = schedules.filter(s => {
        const scheduleDate = new Date(s.scheduledTime);
        return scheduleDate.getFullYear() === year &&
          scheduleDate.getMonth() === month &&
          scheduleDate.getDate() === day;
      });

      const hasSchedules = daySchedules.length > 0;
      const classes = ['princhat-calendar-day'];
      if (isToday) classes.push('today');
      if (isSelected) classes.push('selected');
      if (hasSchedules) classes.push('has-schedules');

      daysHTML += `
        <div class="${classes.join(' ')}" data-day="${day}">
          <span class="princhat-calendar-day-number">${day}</span>
          ${hasSchedules ? `<div class="princhat-calendar-badge">${daySchedules.length}</div>` : ''}
        </div>
      `;
    }

    const totalCells = firstDay + daysInMonth;
    const remainingCells = totalCells <= 35 ? 35 - totalCells : 42 - totalCells;
    for (let day = 1; day <= remainingCells; day++) {
      daysHTML += `<div class="princhat-calendar-day other-month"><span class="princhat-calendar-day-number">${day}</span></div>`;
    }

    return daysHTML;
  }

  private async buildDaySchedulesHTML(date: Date, schedules: Schedule[]): Promise<string> {
    const daySchedules = schedules.filter(s => {
      const scheduleDate = new Date(s.scheduledTime);
      return scheduleDate.getFullYear() === date.getFullYear() &&
        scheduleDate.getMonth() === date.getMonth() &&
        scheduleDate.getDate() === date.getDate();
    });

    if (daySchedules.length === 0) {
      return '<div class="princhat-calendar-empty">Nenhum agendamento neste dia</div>';
    }

    daySchedules.sort((a, b) => a.scheduledTime - b.scheduledTime);

    const buildCardsWithChatInfo = async (schedulesList: Schedule[]): Promise<string> => {
      const cards = await Promise.all(schedulesList.map(async (s) => {
        const chatInfo = await this.requestFromContentScript({
          type: 'GET_CHAT_INFO',
          payload: { chatId: s.chatId }
        });

        const chatName = chatInfo?.data?.chatName || chatInfo?.name || s.chatId;
        const chatPhoto = chatInfo?.data?.chatPhoto || chatInfo?.photo || '';

        return this.buildGlobalScheduleCardHTML(s, chatName, chatPhoto);
      }));

      return cards.join('');
    };

    const pending = daySchedules.filter(s => s.status === 'pending');
    const paused = daySchedules.filter(s => s.status === 'paused');
    const completed = daySchedules.filter(s => s.status === 'completed');
    const failed = daySchedules.filter(s => s.status === 'failed');
    const cancelled = daySchedules.filter(s => s.status === 'cancelled');

    let html = '';

    if (pending.length > 0) {
      html += `
        <div class="princhat-calendar-section">
          <div class="princhat-calendar-section-header">
            <span class="princhat-calendar-section-title">PENDENTES</span>
            <span class="princhat-calendar-section-count">${pending.length}</span>
          </div>
          ${await buildCardsWithChatInfo(pending)}
        </div>
      `;
    }

    if (paused.length > 0) {
      html += `
        <div class="princhat-calendar-section">
          <div class="princhat-calendar-section-header">
            <span class="princhat-calendar-section-title">PAUSADOS</span>
            <span class="princhat-calendar-section-count">${paused.length}</span>
          </div>
          ${await buildCardsWithChatInfo(paused)}
        </div>
      `;
    }

    if (completed.length > 0) {
      html += `
        <div class="princhat-calendar-section">
          <div class="princhat-calendar-section-header">
            <span class="princhat-calendar-section-title">ENVIADOS</span>
            <span class="princhat-calendar-section-count">${completed.length}</span>
          </div>
          ${await buildCardsWithChatInfo(completed)}
        </div>
      `;
    }

    if (failed.length > 0) {
      html += `
        <div class="princhat-calendar-section">
          <div class="princhat-calendar-section-header">
            <span class="princhat-calendar-section-title">FALHADOS</span>
            <span class="princhat-calendar-section-count">${failed.length}</span>
          </div>
          ${await buildCardsWithChatInfo(failed)}
        </div>
      `;
    }

    if (cancelled.length > 0) {
      html += `
        <div class="princhat-calendar-section">
          <div class="princhat-calendar-section-header">
            <span class="princhat-calendar-section-title">CANCELADOS</span>
            <span class="princhat-calendar-section-count">${cancelled.length}</span>
          </div>
          ${await buildCardsWithChatInfo(cancelled)}
        </div>
      `;
    }

    return html;
  }

  private async cancelDaySchedules(date: Date, allSchedules: Schedule[], reRenderCallback: () => void) {
    const formattedDate = date.toLocaleDateString('pt-BR');

    const daySchedules = allSchedules.filter(s => {
      const scheduleDate = new Date(s.scheduledTime);
      return scheduleDate.getFullYear() === date.getFullYear() &&
        scheduleDate.getMonth() === date.getMonth() &&
        scheduleDate.getDate() === date.getDate() &&
        (s.status === 'pending' || s.status === 'paused');
    });

    if (daySchedules.length === 0) {
      alert('Não há agendamentos pendentes ou pausados neste dia.');
      return;
    }

    const confirmMsg = `Tem certeza que deseja cancelar ${daySchedules.length} agendamento(s) do dia ${formattedDate}?`;

    this.showCalendarConfirmationModal(
      'Cancelar agendamentos do dia',
      confirmMsg,
      async () => {
        for (const schedule of daySchedules) {
          await this.requestFromContentScript({
            type: 'DELETE_SCHEDULE',
            payload: { id: schedule.id }
          });
        }

        // Force update of global schedule badge in header
        await this.updateGlobalSchedulesBadge();

        reRenderCallback();
      }
    );
  }


  /**
   * Open schedule creation modal
   * @param scheduleToEdit Optional schedule to edit (opens in edit mode if provided)
   */
  private openScheduleCreationModal(scheduleToEdit?: Schedule) {
    if (this.scheduleCreationModal) {
      this.scheduleCreationModal.remove();
      this.scheduleCreationModal = null;
      return;
    }

    const isEditMode = !!scheduleToEdit;
    console.log('[PrinChat UI] Opening schedule modal in', isEditMode ? 'EDIT' : 'CREATE', 'mode');

    const state = {
      contentType: (scheduleToEdit?.type || 'message') as 'message' | 'script',
      filterType: 'all' as 'all' | 'text' | 'audio' | 'image' | 'file' | 'script',
      searchText: '',
      selectedId: scheduleToEdit?.itemId || '',
      date: '',
      time: ''
    };

    // Initialize date/time from schedule or default to +1 hour
    if (isEditMode && scheduleToEdit) {
      const scheduleDate = new Date(scheduleToEdit.scheduledTime);
      const year = scheduleDate.getFullYear();
      const month = String(scheduleDate.getMonth() + 1).padStart(2, '0');
      const day = String(scheduleDate.getDate()).padStart(2, '0');
      state.date = `${year}-${month}-${day}`;
      state.time = `${String(scheduleDate.getHours()).padStart(2, '0')}:${String(scheduleDate.getMinutes()).padStart(2, '0')}`;
    } else {
      const now = new Date();
      now.setHours(now.getHours() + 1, 0, 0, 0);
      state.date = now.toISOString().split('T')[0];
      state.time = `${String(now.getHours()).padStart(2, '0')}:00`;
    }

    const overlay = document.createElement('div');
    overlay.className = 'princhat-modal-overlay';
    // Ensure modal is ALWAYS on top of everything (including global popups which might have high z-index)
    overlay.style.zIndex = '2147483647'; // Max safe integer for 32-bit systems
    this.scheduleCreationModal = overlay;

    const modal = document.createElement('div');
    modal.className = 'princhat-schedule-modal';

    const getIcon = (type: string) => {
      const icons: Record<string, string> = {
        text: '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>',
        audio: '<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>',
        image: '<path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>',
        video: '<path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>',
        file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
        script: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'
      };
      return icons[type] || icons.text;
    };

    const buildList = (): string => {
      let items: any[] = state.contentType === 'message' ? this.messages : this.scripts;

      if (state.contentType === 'message' && state.filterType !== 'all') {
        items = items.filter((m: Message) => m.type === state.filterType);
      }

      if (state.searchText) {
        const search = state.searchText.toLowerCase();
        items = items.filter((item: Message | Script) => {
          const text = state.contentType === 'message' ? (item as Message).content : (item as Script).name;
          return text.toLowerCase().includes(search);
        });
      }

      if (items.length === 0) {
        return '<div class="princhat-item-empty">Nenhum item encontrado</div>';
      }

      return items.map((item: Message | Script) => {
        const icon = state.contentType === 'message' ? getIcon((item as Message).type) : getIcon('script');
        const text = state.contentType === 'message'
          ? (item as Message).content.substring(0, 60) + ((item as Message).content.length > 60 ? '...' : '')
          : (item as Script).name;

        return `
          <div class="princhat-item-row" data-id="${item.id}">
            <svg class="princhat-item-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">${icon}</svg>
            <span class="princhat-item-text">${text}</span>
          </div>
        `;
      }).join('');
    };

    const updateList = () => {
      const list = modal.querySelector('[data-list]') as HTMLElement;
      if (list) {
        list.innerHTML = buildList();
        attachItemListeners();
      }
    };

    const attachItemListeners = () => {
      const items = modal.querySelectorAll('.princhat-item-row');
      items.forEach(item => {
        item.addEventListener('click', () => {
          items.forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          state.selectedId = (item as HTMLElement).dataset.id || '';
          updatePreview();
        });
      });
    };

    const updatePreview = () => {
      const preview = modal.querySelector('[data-preview]') as HTMLElement;
      const btn = modal.querySelector('[data-action="schedule"]') as HTMLButtonElement;

      if (!state.selectedId || !state.date || !state.time) {
        if (preview) preview.style.display = 'none';
        if (btn) btn.disabled = true;
        return;
      }

      const item = state.contentType === 'message'
        ? this.messages.find(m => m.id === state.selectedId)
        : this.scripts.find(s => s.id === state.selectedId);

      if (!item) return;

      const scheduleDate = new Date(`${state.date}T${state.time}`);
      const formatted = scheduleDate.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const text = state.contentType === 'message'
        ? (item as Message).content.substring(0, 80)
        : `${(item as Script).name} (${(item as Script).steps.length} passos)`;

      if (preview) {
        preview.innerHTML = `<strong>${text}</strong> • ${formatted}`;
        preview.style.display = 'block';
      }

      const nowCheck = new Date();
      const isValid = scheduleDate > nowCheck;
      if (btn) btn.disabled = !isValid;
    };

    modal.innerHTML = `
      <div class="princhat-modal-header">
        <h3>${isEditMode ? 'Editar agendamento' : 'Agendar nova mensagem'}</h3>
        <button class="princhat-popup-close-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="princhat-modal-body">
        <div class="princhat-section-label">Escolha o que será enviado</div>
        
        <div class="princhat-icon-filters">
          <button class="princhat-icon-filter active" data-filter="all">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>
            </svg>
          </button>
          <button class="princhat-icon-filter" data-filter="text">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          <button class="princhat-icon-filter" data-filter="audio">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
          </button>
          <button class="princhat-icon-filter" data-filter="image">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>
            </svg>
          </button>
          <button class="princhat-icon-filter" data-filter="file">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><line x1="10" x2="14" y1="12" y2="12"/><line x1="10" x2="14" y1="16" y2="16"/>
            </svg>
          </button>
          <button class="princhat-icon-filter" data-filter="script">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>
            </svg>
          </button>
        </div>

        <div class="princhat-custom-dropdown" data-dropdown>
          <button class="princhat-dropdown-trigger" data-dropdown-trigger>
            <span data-dropdown-label>Selecione</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div class="princhat-dropdown-panel" data-dropdown-panel style="display:none">
            <div class="princhat-dropdown-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input type="text" placeholder="Pesquisar..." data-dropdown-search />
            </div>
            <div class="princhat-dropdown-list" data-dropdown-list></div>
          </div>
        </div>

        <div class="princhat-time-shortcuts">
          <button class="princhat-time-tag princhat-time-reset" data-reset>Redefinir</button>
          <button class="princhat-time-tag" data-add-min="30">+30min</button>
          <button class="princhat-time-tag" data-add-min="60">+1h</button>
          <button class="princhat-time-tag" data-add-min="720">+12h</button>
          <button class="princhat-time-tag" data-add-days="1">+1 dia</button>
          <button class="princhat-time-tag" data-add-days="7">+1 semana</button>
        </div>

        <div class="princhat-datetime-row">
          <input type="date" class="princhat-datetime-input" value="${state.date}" data-field="date" />
          <input type="time" class="princhat-datetime-input" value="${state.time}" data-field="time" />
        </div>

        <div class="princhat-preview-inline" style="display:none" data-preview></div>
      </div>
      <div class="princhat-modal-footer-right">
        <button class="princhat-schedule-btn" disabled data-action="schedule">${isEditMode ? 'Salvar alterações' : 'Agendar'}</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    attachItemListeners();

    const filterBtns = modal.querySelectorAll('[data-filter]');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filterType = (btn as HTMLElement).dataset.filter as any;
        state.selectedId = '';
        updateList();
        updatePreview();
      });
    });

    // Dropdown functionality
    const dropdownTrigger = modal.querySelector('[data-dropdown-trigger]') as HTMLElement;
    const dropdownPanel = modal.querySelector('[data-dropdown-panel]') as HTMLElement;
    const dropdownLabel = modal.querySelector('[data-dropdown-label]') as HTMLElement;
    const dropdownList = modal.querySelector('[data-dropdown-list]') as HTMLElement;
    const dropdownSearchInput = modal.querySelector('[data-dropdown-search]') as HTMLInputElement;

    const buildDropdownList = (searchText = '') => {
      // Get messages and scripts separately
      let messages = this.messages;
      let scripts = this.scripts;

      // Apply type filter to messages
      if (state.filterType !== 'all') {
        messages = messages.filter((m: Message) => m.type === state.filterType);
      }

      // Apply search to both
      if (searchText) {
        const search = searchText.toLowerCase();
        messages = messages.filter((m: Message) => (m.name || m.content).toLowerCase().includes(search));
        scripts = scripts.filter((s: Script) => s.name.toLowerCase().includes(search));
      }

      // Build HTML: messages first, then scripts
      let html = '';

      // Add messages
      if (messages.length > 0) {
        html += messages.map((msg: Message) => {
          const icon = getIcon(msg.type);
          const text = msg.name || msg.content.substring(0, 60) + (msg.content.length > 60 ? '...' : '');
          return `
            <div class="princhat-dropdown-item" data-id="${msg.id}" data-type="message">
              <svg class="princhat-item-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">${icon}</svg>
              <span>${text}</span>
            </div>
          `;
        }).join('');
      }

      // Add scripts at the end (only if filter is 'all' or 'script')
      if (scripts.length > 0 && (state.filterType === 'all' || state.filterType === 'script')) {
        if (messages.length > 0) {
          html += '<div class="princhat-dropdown-divider"></div>';
        }
        html += scripts.map((script: Script) => {
          const icon = getIcon('script');
          return `
            <div class="princhat-dropdown-item" data-id="${script.id}" data-type="script">
              <svg class="princhat-item-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">${icon}</svg>
              <span>${script.name}</span>
            </div>
          `;
        }).join('');
      }

      if (!html) {
        return '<div class="princhat-dropdown-empty">Nenhum item encontrado</div>';
      }

      return html;
    };

    const updateDropdownList = (searchText = '') => {
      dropdownList.innerHTML = buildDropdownList(searchText);

      const items = dropdownList.querySelectorAll('.princhat-dropdown-item');
      items.forEach(item => {
        item.addEventListener('click', () => {
          const id = (item as HTMLElement).dataset.id || '';
          const itemType = (item as HTMLElement).dataset.type as 'message' | 'script';

          state.selectedId = id;
          state.contentType = itemType;

          const selectedItem = itemType === 'message'
            ? this.messages.find(m => m.id === id)
            : this.scripts.find(s => s.id === id);

          if (selectedItem) {
            const text = itemType === 'message'
              ? (selectedItem as Message).content.substring(0, 40) + ((selectedItem as Message).content.length > 40 ? '...' : '')
              : (selectedItem as Script).name;
            dropdownLabel.textContent = text;
          }

          dropdownPanel.style.display = 'none';
          updatePreview();
        });
      });
    };

    dropdownTrigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdownPanel.style.display !== 'none';

      if (isOpen) {
        dropdownPanel.style.display = 'none';
      } else {
        // Position dropdown fixed relative to trigger button
        const triggerRect = dropdownTrigger.getBoundingClientRect();
        dropdownPanel.style.top = `${triggerRect.bottom + 4}px`;
        dropdownPanel.style.left = `${triggerRect.left}px`;
        dropdownPanel.style.width = `${triggerRect.width}px`;
        dropdownPanel.style.display = 'block';

        updateDropdownList();
        dropdownSearchInput.value = '';
      }
    });

    dropdownSearchInput?.addEventListener('input', () => {
      updateDropdownList(dropdownSearchInput.value);
    });

    // Pre-select item in dropdown if in edit mode
    if (isEditMode && scheduleToEdit && state.selectedId) {
      const selectedItem = state.contentType === 'message'
        ? this.messages.find(m => m.id === state.selectedId)
        : this.scripts.find(s => s.id === state.selectedId);

      if (selectedItem && dropdownLabel) {
        const text = state.contentType === 'message'
          ? (selectedItem as Message).content.substring(0, 40) + ((selectedItem as Message).content.length > 40 ? '...' : '')
          : (selectedItem as Script).name;
        dropdownLabel.textContent = text;
      }

      // Trigger initial preview update
      updatePreview();
    }

    const closeDropdownOnOutsideClick = (e: MouseEvent) => {
      if (!dropdownPanel.contains(e.target as Node) && !dropdownTrigger.contains(e.target as Node)) {
        dropdownPanel.style.display = 'none';
      }
    };
    document.addEventListener('click', closeDropdownOnOutsideClick);

    const searchInput = modal.querySelector('[data-search]') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      state.searchText = searchInput.value;
      updateList();
    });

    const dateInput = modal.querySelector('[data-field="date"]') as HTMLInputElement;
    const timeInput = modal.querySelector('[data-field="time"]') as HTMLInputElement;
    dateInput?.addEventListener('change', () => {
      state.date = dateInput.value;
      updatePreview();
    });
    timeInput?.addEventListener('change', () => {
      state.time = timeInput.value;
      updatePreview();
    });

    const timeTags = modal.querySelectorAll('[data-add-min], [data-add-days], [data-reset]');
    timeTags.forEach(tag => {
      tag.addEventListener('click', () => {
        if ((tag as HTMLElement).dataset.reset !== undefined) {
          const defaultTime = new Date();
          defaultTime.setHours(defaultTime.getHours() + 1, 0, 0, 0);
          state.date = `${defaultTime.getFullYear()}-${String(defaultTime.getMonth() + 1).padStart(2, '0')}-${String(defaultTime.getDate()).padStart(2, '0')}`;
          state.time = `${String(defaultTime.getHours()).padStart(2, '0')}:00`;
        } else {
          const current = new Date(`${state.date}T${state.time}`);
          const addMin = (tag as HTMLElement).dataset.addMin;
          const addDays = (tag as HTMLElement).dataset.addDays;

          if (addMin) current.setMinutes(current.getMinutes() + parseInt(addMin));
          if (addDays) current.setDate(current.getDate() + parseInt(addDays));

          state.date = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
          state.time = `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`;
        }

        if (dateInput) dateInput.value = state.date;
        if (timeInput) timeInput.value = state.time;
        updatePreview();
      });
    });

    const scheduleBtn = modal.querySelector('[data-action="schedule"]') as HTMLButtonElement;
    scheduleBtn?.addEventListener('click', async () => {
      try {
        console.log('[PrinChat UI] Creating schedule:', state);

        // Get active chat info
        const activeChatElement = document.querySelector('._ak8l');
        const activeChatName = activeChatElement?.querySelector('span[title]')?.getAttribute('title') || 'Unknown Contact';

        // Get chat ID - use schedule's chatId if editing, otherwise get active chat
        let chatId: string;
        if (isEditMode && scheduleToEdit) {
          // IMPORTANT: When editing, preserve the original chatId
          chatId = scheduleToEdit.chatId;
          console.log('[PrinChat UI] Editing schedule - preserving original chatId:', chatId);
        } else {
          // Creating new schedule - use active chat
          chatId = await this.getActiveChatId() || '';
        }

        if (!chatId) {
          throw new Error('Nenhum chat ativo selecionado');
        }

        console.log('[PrinChat UI] Chat info:', { chatId, chatName: activeChatName });

        // Create schedule object
        const scheduleTime = new Date(`${state.date}T${state.time}`).getTime();

        let schedule: Schedule;

        if (isEditMode && scheduleToEdit) {
          // UPDATE mode: preserve ID and original createdAt, but reset status to pending
          schedule = {
            ...scheduleToEdit,
            chatId: chatId,
            chatName: activeChatName,
            type: state.contentType,
            itemId: state.selectedId,
            scheduledTime: scheduleTime,
            status: 'pending', // Reset to pending when editing (even if it was paused)
            updatedAt: Date.now()
          };
          console.log('[PrinChat UI] Updating schedule:', schedule);
        } else {
          // CREATE mode: generate new ID
          schedule = {
            id: `schedule-${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            chatId: chatId,
            chatName: activeChatName,
            type: state.contentType,
            itemId: state.selectedId,
            scheduledTime: scheduleTime,
            status: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          console.log('[PrinChat UI] Creating new schedule:', schedule);
        }

        // Save to database (db.put handles both create and update)
        const response = await this.requestFromContentScript({
          type: 'SAVE_SCHEDULE',
          payload: schedule
        });

        console.log('[PrinChat UI] Service worker response:', response);

        if (!response || !response.success) {
          throw new Error(response?.error || 'Failed to save schedule');
        }

        console.log(`[PrinChat UI] Schedule ${isEditMode ? 'updated' : 'created'} successfully!`);

        // Close modal
        overlay.remove();
        this.scheduleCreationModal = null;

        // Update schedule button (check if should transform to icon)
        await this.updateScheduleButton();

        // Update global schedules badge
        this.updateGlobalSchedulesBadge();

        // Intelligent popup refresh/reopen logic
        // IMPORTANT: Don't reopen chat popup if global popup is open (editing from global view)
        if (this.globalSchedulesPopup) {
          console.log('[PrinChat UI] Global popup is open, not interfering with chat popup');
          // Just refresh global popup data
          const response = await this.requestFromContentScript({ type: 'GET_ALL_SCHEDULES' });
          this.globalSchedulesData = response?.data || [];
          this.renderGlobalSchedulesContent(this.globalSchedulesActiveTab, '');
        } else if (this.scheduleListPopup) {
          // Popup is open, rebuild it with fresh data (same pattern as global popup)
          console.log('[PrinChat UI] Chat popup is open, rebuilding with fresh data...');

          // Close current popup
          this.scheduleListPopup.remove();
          this.scheduleListPopup = null;

          // Reopen with fresh data
          const scheduleButton = document.querySelector('.princhat-schedule-button') as HTMLElement;
          if (scheduleButton) {
            await this.toggleScheduleListPopup(scheduleButton);
          }
        } else {
          // Popup was closed, check if button exists and reopen
          const scheduleButton = document.querySelector('.princhat-schedule-button') as HTMLElement;
          if (scheduleButton) {
            console.log('[PrinChat UI] Popup was closed, reopening with fresh data...');
            await this.toggleScheduleListPopup(scheduleButton);
          }
        }
      } catch (error) {
        console.error('[PrinChat UI] Error saving schedule:', error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        alert(`Erro ao criar agendamento: ${errorMsg}`);
      }
    });

    const closeBtn = modal.querySelector('.princhat-popup-close-btn');
    closeBtn?.addEventListener('click', () => {
      overlay.remove();
      this.scheduleCreationModal = null;
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        this.scheduleCreationModal = null;
      }
    });

    updatePreview();
  }

  /**
   * Toggle subscription popup for managing message signatures
   */
  private async toggleSubscriptionPopup(button: HTMLElement) {
    // If popup already exists, close it
    if (this.subscriptionPopup) {
      this.subscriptionPopup.remove();
      button.classList.remove('active');
      this.subscriptionPopup = null;
      return;
    }

    this.closeAllGlobalPopups();

    // Load signatures from database
    console.log('[PrinChat] toggleSubscriptionPopup: Loading signatures...');
    await this.loadSignatures();
    console.log(`[PrinChat] toggleSubscriptionPopup: Building popup with ${this.signatures.length} signatures`);

    // Create popup
    const popup = document.createElement('div');
    popup.className = 'princhat-subscription-popup';
    this.subscriptionPopup = popup;

    // Build popup HTML based on signatures availability
    if (this.signatures.length === 0) {
      // Empty state
      popup.innerHTML = `
        <div class="princhat-subscription-popup-header">
          <h3>Mensagem com assinatura</h3>
          <button class="princhat-popup-close-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="princhat-subscription-empty">
          <div class="princhat-subscription-icon-wrapper">
            <div class="princhat-subscription-icon-circle-outer"></div>
            <div class="princhat-subscription-icon-circle-middle"></div>
            <div class="princhat-subscription-icon-circle-inner">
              <div class="princhat-subscription-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                </svg>
              </div>
            </div>
          </div>
          <div class="princhat-subscription-empty-title">Nenhuma assinatura adicionada!</div>
          <div class="princhat-subscription-empty-description">
            Comece a enviar mensagens para seus contatos com uma assinatura personalizada, basta criar uma nova assinatura.
          </div>
          <button class="princhat-subscription-new-btn">Nova assinatura</button>
        </div>
      `;
    } else {
      // Signature list state
      const signatureCards = this.signatures.map(sig => `
        <div class="princhat-signature-card" data-sig-id="${sig.id}">
          <div class="princhat-signature-info">
            <span class="princhat-signature-text">${this.escapeHtml(sig.text)}</span>
          </div>
          <div class="princhat-signature-actions">
            <label class="princhat-signature-toggle">
              <input type="checkbox" ${sig.isActive ? 'checked' : ''} data-sig-id="${sig.id}">
              <span class="princhat-toggle-slider"></span>
            </label>
            <button class="princhat-signature-edit-btn" data-sig-id="${sig.id}">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
            </button>
            <button class="princhat-signature-delete-btn" data-sig-id="${sig.id}">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18"/>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      `).join('');

      popup.innerHTML = `
        <div class="princhat-subscription-popup-header">
          <h3>Mensagem com assinatura</h3>
          <button class="princhat-popup-close-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="princhat-signature-list">
          ${signatureCards}
        </div>
        <div class="princhat-subscription-footer">
          <button class="princhat-subscription-new-btn">Nova assinatura</button>
        </div>
      `;
    }

    // Position popup below button
    const rect = button.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = `${rect.bottom + 8}px`;
    popup.style.right = `${window.innerWidth - rect.right}px`;

    document.body.appendChild(popup);
    button.classList.add('active');

    // Add close button handler
    const closeBtn = popup.querySelector('.princhat-popup-close-btn');
    closeBtn?.addEventListener('click', () => {
      popup.remove();
      button.classList.remove('active');
      this.subscriptionPopup = null;
    });

    // Add "Nova assinatura" button handler
    const newBtn = popup.querySelector('.princhat-subscription-new-btn');
    newBtn?.addEventListener('click', () => {
      console.log('[PrinChat] Nova assinatura clicked');
      this.openSubscriptionFormModal();
    });

    // Add toggle handlers
    const toggleInputs = popup.querySelectorAll('.princhat-signature-toggle input');
    toggleInputs.forEach(input => {
      input.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        const sigId = target.getAttribute('data-sig-id');
        if (sigId) {
          if (target.checked) {
            // IMMEDIATELY uncheck all other checkboxes for instant visual feedback
            toggleInputs.forEach(otherInput => {
              if (otherInput !== target) {
                (otherInput as HTMLInputElement).checked = false;
              }
            });

            // Activating: use SET_ACTIVE_SIGNATURE to ensure only one is active in DB
            console.log(`[PrinChat] Activating signature ${sigId}, will deactivate all others`);
            const response = await this.requestFromContentScript({
              type: 'SET_ACTIVE_SIGNATURE',
              payload: { id: sigId }
            });
            if (response && response.success) {
              await this.loadSignatures();
              console.log('[PrinChat] Signature activated successfully');
            } else {
              console.error('[PrinChat] Failed to activate signature');
              // Revert checkbox on failure
              target.checked = false;
            }
          } else {
            // Deactivating: just toggle it off
            console.log(`[PrinChat] Deactivating signature ${sigId}`);
            await this.toggleSignatureActive(sigId, false);
          }
        }
      });
    });

    // Add delete button handlers
    const deleteButtons = popup.querySelectorAll('[data-action="delete"][data-sig-id]');
    deleteButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event bubbling
        const sigId = button.getAttribute('data-sig-id');
        if (sigId) {
          // Show custom confirmation modal instead of browser confirm
          this.showDeleteConfirmation(sigId);
        }
      });
    });

    // Add edit button handlers
    const editButtons = popup.querySelectorAll('.princhat-signature-edit-btn');
    editButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const sigId = btn.getAttribute('data-sig-id');
        if (sigId) {
          this.editSignature(sigId);
        }
      });
    });

    // Close popup when clicking outside
    const closePopup = (e: MouseEvent) => {
      let target = e.target as HTMLElement;
      // Handle text nodes (clicking on text)
      if (target.nodeType === Node.TEXT_NODE) {
        target = target.parentElement as HTMLElement;
      }

      // Safety check
      if (!target || !target.closest) return;

      // Don't close if clicking inside popup, on button, or on any modal
      const isModal = target.closest('.princhat-modal-overlay') ||
        target.closest('.princhat-note-editor-modal') ||
        target.closest('.princhat-calendar-modal-overlay') ||
        target.closest('.princhat-schedule-modal') ||
        target.closest('.princhat-confirmation-modal');

      if (!popup.contains(target) && !button.contains(target) && !isModal) {
        popup.remove();
        button.classList.remove('active');
        this.subscriptionPopup = null;
        document.removeEventListener('click', closePopup);
      }
    };

    // Add listener after a short delay to prevent immediate closure
    setTimeout(() => {
      document.addEventListener('click', closePopup);
    }, 100);
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }


  /**
   * Open subscription form modal for creating new signature
   */
  private openSubscriptionFormModal() {
    // Close if already open
    if (this.subscribeFormModal) {
      this.closeSubscriptionFormModal();
      return;
    }

    // Create modal state
    const formState = {
      signatureText: '',
      spacing: 1,
      formatting: {
        bold: false,
        italic: false,
        strikethrough: false,
        monospace: false
      }
    };

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'princhat-modal-overlay';
    // Ensure modal is ALWAYS on top of everything
    overlay.style.zIndex = '2147483647';
    this.subscribeFormModal = overlay;

    // Store formState on modal for access during edit (AFTER modal is created)
    (overlay as any).__formState = formState;

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'princhat-subscription-form-modal';

    // Build modal HTML
    modal.innerHTML = `
      <div class="princhat-modal-header">
        <h3>Adicionar nova</h3>
        <button class="princhat-popup-close-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="princhat-modal-body">
        <!-- Signature Input -->
        <div class="princhat-form-field">
          <label class="princhat-form-label">Assinatura</label>
          <input 
            type="text" 
            class="princhat-form-input" 
            placeholder="Adicione uma assinatura"
            data-field="signature"
          />
        </div>

        <!-- Formatting -->
        <div class="princhat-form-field">
          <label class="princhat-form-label">Formatação</label>
          <div class="princhat-formatting-buttons">
            <button class="princhat-format-btn" data-format="bold">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
                <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
              </svg>
              Negrito
            </button>
            <button class="princhat-format-btn" data-format="italic">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="19" y1="4" x2="10" y2="4"></line>
                <line x1="14" y1="20" x2="5" y2="20"></line>
                <line x1="15" y1="4" x2="9" y2="20"></line>
              </svg>
              Itálico
            </button>
            <button class="princhat-format-btn" data-format="strikethrough">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 4H9a3 3 0 0 0-2.83 4"></path>
                <path d="M14 12a4 4 0 0 1 0 8H6"></path>
                <line x1="4" y1="12" x2="20" y2="12"></line>
              </svg>
              Tachado
            </button>
            <button class="princhat-format-btn" data-format="monospace">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="4 7 4 4 20 4 20 7"></polyline>
                <line x1="9" y1="20" x2="15" y2="20"></line>
                <line x1="12" y1="4" x2="12" y2="20"></line>
              </svg>
              Monoespaçado
            </button>
          </div>
        </div>

        <!-- Spacing -->
        <div class="princhat-form-field">
          <label class="princhat-form-label">Espaçamento</label>
          <input 
            type="number" 
            class="princhat-spacing-input" 
            min="1" 
            max="10" 
            value="1"
            data-field="spacing"
          />
        </div>

        <!-- Preview -->
        <div class="princhat-preview-section">
          <span class="princhat-preview-label">Pré-visualização</span>
          <div class="princhat-preview-content" data-preview></div>
        </div>
      </div>
      <div class="princhat-modal-footer">
        <button class="princhat-modal-add-btn" disabled data-action="add">
          Adicionar
        </button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Get elements
    const signatureInput = modal.querySelector('[data-field="signature"]') as HTMLInputElement;
    const spacingInput = modal.querySelector('[data-field="spacing"]') as HTMLInputElement;
    const formatButtons = modal.querySelectorAll('.princhat-format-btn');
    const previewSection = modal.querySelector('.princhat-preview-section') as HTMLElement;
    const previewContent = modal.querySelector('[data-preview]') as HTMLElement;
    const addButton = modal.querySelector('[data-action="add"]') as HTMLButtonElement;
    const closeBtn = modal.querySelector('.princhat-popup-close-btn');

    // Update preview function
    const updatePreview = () => {
      const text = formState.signatureText;

      // Show/hide preview section based on text
      if (text.trim()) {
        previewSection.style.display = 'block';

        // Build formatting classes and formatted HTML
        let formattedText = text;
        const classes = [];

        if (formState.formatting.bold) {
          formattedText = `<strong>${formattedText}</strong>`;
          classes.push('bold');
        }
        if (formState.formatting.italic) {
          formattedText = `<em>${formattedText}</em>`;
          classes.push('italic');
        }
        if (formState.formatting.strikethrough) {
          formattedText = `<s>${formattedText}</s>`;
          classes.push('strikethrough');
        }
        if (formState.formatting.monospace) {
          formattedText = `<code>${formattedText}</code>`;
          classes.push('monospace');
        }

        // Apply spacing (line breaks) - spacing value = number of <br> tags
        const spacing = '<br>'.repeat(formState.spacing);

        // Build HTML: formatted signature at beginning + spacing + example message
        previewContent.innerHTML = `<span class="princhat-signature-formatted ${classes.join(' ')}">${formattedText}</span>:${spacing}Olá, tudo bem? Esta é uma mensagem de exemplo para que você veja como sua assinatura será exibida quando enviada junto com uma mensagem.`;
      } else {
        // Hide preview when empty
        previewSection.style.display = 'none';
      }

      // Enable/disable add button
      addButton.disabled = !text.trim();
    };

    // Store updatePreview on overlay (subscriptionFormModal) for access during edit
    (overlay as any).__updatePreview = updatePreview;

    // Signature input handler
    signatureInput.addEventListener('input', (e) => {
      formState.signatureText = (e.target as HTMLInputElement).value;
      updatePreview();
    });

    // Spacing input handler
    spacingInput.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value) || 1;
      formState.spacing = Math.max(1, Math.min(10, value));
      updatePreview();
    });

    // Format button handlers
    formatButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const format = btn.getAttribute('data-format') as keyof typeof formState.formatting;
        formState.formatting[format] = !formState.formatting[format];
        btn.classList.toggle('active', formState.formatting[format]);
        updatePreview();
      });
    });

    // Close button handler
    closeBtn?.addEventListener('click', () => {
      this.closeSubscriptionFormModal();
    });

    // Add button handler
    addButton.addEventListener('click', async () => {
      try {
        const now = Date.now();

        // When editing, preserve original createdAt and isActive
        let signatureData: any;

        if (this.editingSignatureId) {
          // Editing existing signature - get original first
          const existingResponse = await this.requestFromContentScript({
            type: 'GET_SIGNATURE',
            payload: { id: this.editingSignatureId }
          });

          if (existingResponse && existingResponse.success && existingResponse.data) {
            // Preserve original values, only update what changed
            signatureData = {
              ...existingResponse.data,
              text: formState.signatureText,
              formatting: formState.formatting,
              spacing: formState.spacing,
              updatedAt: now
              // Keep original: id, isActive, createdAt
            };
          } else {
            throw new Error('Failed to get original signature');
          }

          this.editingSignatureId = null;
        } else {
          // Creating new signature
          signatureData = {
            id: `sig_${now}_${Math.random().toString(36).substr(2, 9)}`,
            text: formState.signatureText,
            formatting: formState.formatting,
            spacing: formState.spacing,
            isActive: false,
            createdAt: now,
            updatedAt: now
          };
        }

        const response = await this.requestFromContentScript({
          type: 'SAVE_SIGNATURE',
          payload: signatureData
        });

        if (response && response.success) {
          // Close modal
          this.closeSubscriptionFormModal();

          // Refresh subscription popup if open
          const subButton = document.querySelector('[data-action="subscription"]') as HTMLElement;
          if (subButton && this.subscriptionPopup) {
            this.subscriptionPopup.remove();
            this.subscriptionPopup = null;
            await this.toggleSubscriptionPopup(subButton);
          }
        } else {
          throw new Error(response?.error || 'Failed to save');
        }
      } catch (error) {
        console.error('[PrinChat] Error saving signature:', error);
        alert('Erro ao salvar assinatura');
      }
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeSubscriptionFormModal();
      }
    });

    // Close on Esc key
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeSubscriptionFormModal();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);

    // Initial preview update
    updatePreview();
  }

  /**
   * Close subscription form modal
   */
  private closeSubscriptionFormModal() {
    if (this.subscribeFormModal) {
      this.subscribeFormModal.remove();
      this.subscribeFormModal = null;
    }
  }

  /**
   * Load signatures from database via message passing
   */
  private async loadSignatures() {
    try {
      console.log('[PrinChat] Loading signatures from database...');
      const response = await this.requestFromContentScript({
        type: 'GET_SIGNATURES'
      });
      if (response && response.success) {
        this.signatures = response.data || [];
        console.log(`[PrinChat] Loaded ${this.signatures.length} signatures`);
      } else {
        console.log('[PrinChat] Failed to load signatures, initializing empty array.');
        this.signatures = [];
      }
    } catch (error) {
      console.error('[PrinChat] Error loading signatures:', error);
      this.signatures = [];
    }
  }

  /**
   * Show delete confirmation modal (custom, not browser confirm)
   */
  private showDeleteConfirmation(id: string) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
    `;

    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      border-radius: 8px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    `;

    modal.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #ffffff;">
          Excluir assinatura
        </h3>
        <p style="margin: 0; font-size: 14px; color: #9e9e9e;">
          Tem certeza que deseja excluir esta assinatura? Esta ação não pode ser desfeita.
        </p>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button class="cancel-btn" style="
          padding: 8px 20px;
          border: 1px solid #3a3a3a;
          background: transparent;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: all 0.2s;
        ">CANCELAR</button>
        <button class="confirm-btn" style="
          padding: 8px 20px;
          border: none;
          background: #f44336;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: all 0.2s;
        ">EXCLUIR</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Add event listeners
    const cancelBtn = modal.querySelector('.cancel-btn') as HTMLElement;
    const confirmBtn = modal.querySelector('.confirm-btn') as HTMLElement;

    const closeModal = () => overlay.remove();

    // Add hover effects
    if (cancelBtn) {
      cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = 'var(--bg-hover)';
        cancelBtn.style.borderColor = '#e91e63';
      });
      cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = 'transparent';
        cancelBtn.style.borderColor = 'var(--border-color)';
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('mouseenter', () => {
        confirmBtn.style.background = '#c62828';
      });
      confirmBtn.addEventListener('mouseleave', () => {
        confirmBtn.style.background = '#f44336';
      });
    }

    cancelBtn?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    confirmBtn?.addEventListener('click', () => {
      closeModal();
      this.deleteSignature(id);
    });
  }

  /**
   * Delete signature via message passing
   */
  private async deleteSignature(id: string) {
    try {
      const response = await this.requestFromContentScript({
        type: 'DELETE_SIGNATURE',
        payload: { id }
      });

      if (response && response.success) {
        console.log('[PrinChat] Signature deleted successfully, reloading...');
        await this.loadSignatures();

        // Refresh subscription popup if open
        if (this.subscriptionPopup) {
          // Find and remove the deleted signature card directly
          const cardToRemove = this.subscriptionPopup.querySelector(`.princhat-signature-card[data-sig-id="${id}"]`);
          if (cardToRemove) {
            console.log('[PrinChat] Removing deleted signature card from popup');
            cardToRemove.remove();
          } else {
            console.log('[PrinChat] Card not found, might need to rebuild');
          }

          // If no signatures left, rebuild to show empty state
          if (this.signatures.length === 0) {
            const button = document.querySelector('[data-action="subscription"]') as HTMLElement;
            if (button) {
              this.subscriptionPopup.remove();
              this.subscriptionPopup = null;
              button.classList.remove('active');
              await this.toggleSubscriptionPopup(button);
            }
          }
        }
      } else {
        throw new Error(response?.error || 'Failed to delete');
      }
    } catch (error) {
      console.error('[PrinChat] Error deleting signature:', error);
      alert('Erro ao deletar assinatura');
    }
  }

  /**
   * Toggle signature active state via message passing
   */
  private async toggleSignatureActive(id: string, isActive: boolean) {
    try {
      const response = await this.requestFromContentScript({
        type: 'TOGGLE_SIGNATURE_ACTIVE',
        payload: { id, isActive }
      });

      if (response && response.success) {
        await this.loadSignatures();

        // Refresh subscription popup if open
        if (this.subscriptionPopup) {
          const button = document.querySelector('[data-action="subscription"]') as HTMLElement;
          if (button) {
            this.subscriptionPopup.remove();
            this.subscriptionPopup = null;
            await this.toggleSubscriptionPopup(button);
          }
        }
      } else {
        throw new Error(response?.error || 'Failed to toggle');
      }
    } catch (error) {
      console.error('[PrinChat] Error toggling signature:', error);
      alert('Erro ao ativar/desativar assinatura');
    }
  }

  /**
   * Edit existing signature
   */
  private async editSignature(id: string) {
    try {
      this.editingSignatureId = id;
      const response = await this.requestFromContentScript({
        type: 'GET_SIGNATURE',
        payload: { id }
      });

      if (response && response.success && response.data) {
        // Close subscription popup
        if (this.subscriptionPopup) {
          this.subscriptionPopup.remove();
          this.subscriptionPopup = null;
        }

        // Open form modal with signature data
        this.openSubscriptionFormModalWithData(response.data);
      }
    } catch (error) {
      console.error('[PrinChat] Error editing signature:', error);
      alert('Erro ao editar assinatura');
    }
  }

  /**
   * Open subscription form modal with existing signature data
   */
  private openSubscriptionFormModalWithData(signature: Signature) {
    // Open the modal first
    this.openSubscriptionFormModal();

    // Wait a tick for DOM to be ready, then populate fields
    setTimeout(() => {
      const modal = this.subscribeFormModal;
      if (!modal) return;

      // Get form elements
      const signatureInput = modal.querySelector('[data-field="signature"]') as HTMLInputElement;
      const spacingInput = modal.querySelector('[data-field="spacing"]') as HTMLInputElement;
      const formatButtons = modal.querySelectorAll('.princhat-format-btn');
      const addButton = modal.querySelector('[data-action="add"]') as HTMLButtonElement;

      // CRITICAL: Update formState first so event listeners work correctly
      const formState = (modal as any).__formState;
      if (formState) {
        formState.signatureText = signature.text;
        formState.spacing = signature.spacing || 1;
        formState.formatting = { ...signature.formatting };
      }

      // Populate signature text
      if (signatureInput) {
        signatureInput.value = signature.text;
      }

      // Populate spacing
      if (spacingInput) {
        spacingInput.value = String(signature.spacing || 1);
      }

      // Populate formatting buttons
      formatButtons.forEach((btn: Element) => {
        const format = btn.getAttribute('data-format');
        if (format && signature.formatting && signature.formatting[format as keyof typeof signature.formatting]) {
          btn.classList.add('active');
        }
      });

      // Update button text to "Salvar"
      if (addButton) {
        addButton.textContent = 'Salvar';
        addButton.disabled = false;
      }

      // Update modal title
      const modalTitle = modal.querySelector('.princhat-modal-header h3');
      if (modalTitle) {
        modalTitle.textContent = 'Editar assinatura';
      }

      // Trigger preview update using the overlay's updatePreview function
      // This makes the preview dynamic and connected to formState changes
      const updatePreviewFunc = (this.subscribeFormModal as any).__updatePreview;
      if (updatePreviewFunc) {
        updatePreviewFunc();
      }
    }, 50);
  }

  /**
   * Toggle executions popup (contains script + message execution popups)
   */
  private toggleExecutionsPopup(button: HTMLElement) {
    const existingPopup = document.querySelector('.princhat-executions-popup');

    if (existingPopup) {
      // Close popup
      existingPopup.remove();
      button.classList.remove('active'); // Ensure button state is reset
      this.executionsPopup = null;
      return;
    }

    this.closeAllGlobalPopups();


    // Create popup container
    const popup = document.createElement('div');
    popup.className = 'princhat-executions-popup';

    // Header with title and action icons
    const header = document.createElement('div');
    header.className = 'princhat-executions-header';
    header.innerHTML = `
      <h3>Execuções</h3>
      <div class="princhat-executions-actions">
        <button class="princhat-executions-pin" title="Fixar popup">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" x2="12" y1="17" y2="22"/>
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
          </svg>
        </button>
        <button class="princhat-executions-detach" title="Desprender para tela">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
        </button>
        <button class="princhat-popup-close-btn princhat-executions-close" title="Fechar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `;
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
      // ALWAYS render both sections (even if empty) to support real-time updates
      // This ensures that when first message/script starts after popup opens,
      // the section exists and can be updated by updateMessageStatusPopup/updateStatusPopup

      const scriptsContainer = this.renderScriptExecutions();
      if (scriptsContainer) {
        content.appendChild(scriptsContainer);
      }

      const messagesContainer = this.renderMessageExecutions();
      if (messagesContainer) {
        content.appendChild(messagesContainer);
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

    // Action buttons event listeners
    const pinBtn = header.querySelector('.princhat-executions-pin');
    const detachBtn = header.querySelector('.princhat-executions-detach');
    const closeBtn = header.querySelector('.princhat-executions-close');

    let isPinned = false;

    pinBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      isPinned = !isPinned;
      pinBtn.classList.toggle('active', isPinned);
      console.log('[PrinChat UI] Executions popup pinned:', isPinned);
    });

    detachBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('[PrinChat UI] Detaching executions popup to floating mode');
      // TODO: Implement detach functionality
      alert('Funcionalidade "desprender" será implementada em breve!');
    });

    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      popup.remove();
      button.classList.remove('active');
      this.executionsPopup = null;
      document.removeEventListener('click', closePopup);
    });

    // Close popup when clicking outside (unless pinned)
    const closePopup = (e: MouseEvent) => {
      // Don't close if pinned
      if (isPinned) {
        return;
      }

      // Check if ANY modal is currently open
      const hasOpenModal = document.querySelector('.princhat-modal-overlay') !== null ||
        document.querySelector('.princhat-note-editor-modal') !== null ||
        document.querySelector('.princhat-calendar-modal-overlay') !== null;

      if (!popup.contains(e.target as Node) && !button.contains(e.target as Node) && !hasOpenModal) {
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
    cancelAllBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelAllScripts();
    });

    const clearAllBtn = container.querySelector('[data-action="clear-all"]');
    clearAllBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearAllCompleted();
    });

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
    cancelAllBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelAllMessages();
    });

    const clearAllBtn = container.querySelector('[data-action="clear-all-messages"]');
    clearAllBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearAllCompletedMessages();
    });

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

    // Show/hide based on count and apply animation class
    if (totalExecutions > 0) {
      (badge as HTMLElement).style.display = 'flex';
      button.classList.add('has-executions');
    } else {
      (badge as HTMLElement).style.display = 'none';
      button.classList.remove('has-executions');
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

      // Handle pin toggle from popup iframe
      if (event.data?.type === 'PRINCHAT_POPUP_PIN_TOGGLE') {
        console.log('[PrinChat UI] Received pin toggle:', event.data.pinned);
        this.setPopupPinned(event.data.pinned);
      }

      // Handle close popup from iframe
      if (event.data?.type === 'PRINCHAT_CLOSE_POPUP') {
        console.log('[PrinChat UI] Received close popup request from iframe');
        this.toggleHeaderPopup(false);
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

  /**
   * Helper to ensure header is injected into DOM immediately
   */
  private ensureHeaderInjected() {
    if (!this.customHeader) return;

    // Inject if missing
    if (!document.body.contains(this.customHeader)) {
      console.log('[PrinChat UI] Injecting header securely into body');
      document.body.insertBefore(this.customHeader, document.body.firstChild);
      document.body.classList.add('princhat-header-active');
    }

    // Force CSS styles inline to prevent override
    this.customHeader.style.position = 'fixed';
    this.customHeader.style.top = '0';
    this.customHeader.style.left = '0';
    this.customHeader.style.width = '100%';
    // Set Z-index to be high but allow popups to be higher (2147483601+)
    this.customHeader.style.zIndex = '2147483600';
    this.customHeader.style.boxSizing = 'border-box';
  }

  /**
   * Check authentication via content script
   */
  private async checkAuthViaContentScript(): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = `auth-check-${Date.now()}`;
      let timeoutId: any;

      const responseHandler = (event: Event) => {
        const customEvent = event as CustomEvent;
        if (customEvent.detail?.requestId === requestId) {
          clearTimeout(timeoutId);
          document.removeEventListener('PrinChatAuthCheckResponse', responseHandler);
          resolve(customEvent.detail?.isAuthenticated === true);
        }
      };

      document.addEventListener('PrinChatAuthCheckResponse', responseHandler);

      // Timeout safety - resolve false if no response after 3s
      timeoutId = setTimeout(() => {
        console.warn('[PrinChat UI] Auth check timed out - assuming not authenticated');
        document.removeEventListener('PrinChatAuthCheckResponse', responseHandler);
        // Default to TRUE if timeout occurs but we are stuck, 
        // to verify if this unblocks the UI. 
        // If it was false, the login header would show anyway. 
        // But let's stick to 'false' to be safe, or 'true' to force UI?
        // Let's go with FALSE as safer default, BUT if user is actually logged in
        // and just the check failed, they see login button.
        // Better than nothing showing up.
        resolve(false);
      }, 3000);

      const evt = new CustomEvent('PrinChatAuthCheckRequest', {
        bubbles: true,
        detail: { requestId }
      });
      document.dispatchEvent(evt);

      setTimeout(() => {
        document.removeEventListener('PrinChatAuthCheckResponse', responseHandler);
        resolve(false);
      }, 2000);
    });
  }

  /**
   * Create login-only header
   */
  private createLoginHeader() {
    console.log('[PrinChat UI] Creating login-only header...');

    if (!this.customHeader) {
      this.customHeader = document.createElement('div');
    } else {
      this.customHeader.innerHTML = '';
    }
    this.customHeader.className = 'princhat-custom-header princhat-login-header';

    const leftSection = document.createElement('div');
    leftSection.className = 'princhat-header-left';

    const marker = document.getElementById('PrinChatInjected');
    const logoUrl = marker?.getAttribute('data-logo-url');

    if (logoUrl) {
      const logo = document.createElement('img');
      logo.className = 'princhat-header-logo';
      logo.src = logoUrl;
      logo.alt = 'PrinChat';
      leftSection.appendChild(logo);
    }

    const rightSection = document.createElement('div');
    rightSection.className = 'princhat-header-right';

    const loginBtn = document.createElement('button');
    loginBtn.className = 'princhat-header-login-btn';
    loginBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
        <polyline points="10 17 15 12 10 7"/>
        <line x1="15" x2="3" y1="12" y2="12"/>
      </svg>
      <span>Entrar</span>
    `;
    loginBtn.addEventListener('click', () => {
      const event = new CustomEvent('PRINCHAT_OPEN_OPTIONS', { bubbles: true });
      document.dispatchEvent(event);
    });

    rightSection.appendChild(loginBtn);
    this.customHeader.appendChild(leftSection);
    this.customHeader.appendChild(rightSection);

    this.ensureHeaderInjected();
  }

  private async createCustomHeader() {
    console.log('[PrinChat UI] 🟢 createCustomHeader called');
    console.log('[PrinChat UI] Creating custom header...');

    // 1. Create and inject header skeleton immediately
    if (!this.customHeader) {
      console.log('[PrinChat UI] 🟢 Creating header skeleton');
      this.customHeader = document.createElement('div');
      this.customHeader.className = 'princhat-custom-header';
      // Simple skeleton loader
      this.customHeader.innerHTML = '<div style="display:flex;align-items:center;height:100%;padding:0 20px;"><div style="width:120px;height:30px;background:rgba(255,255,255,0.1);border-radius:4px;"></div></div>';
      this.ensureHeaderInjected();
    } else {
      console.log('[PrinChat UI] 🟢 Header skeleton already exists');
    }

    // Check authentication via content script
    const isAuthenticated = await this.checkAuthViaContentScript();
    console.log('[PrinChat UI] Auth status:', isAuthenticated);

    // Prepare container for content
    if (this.customHeader) {
      this.customHeader.innerHTML = '';
    } else {
      this.customHeader = document.createElement('div');
    }
    this.customHeader.className = 'princhat-custom-header';

    // If not authenticated, show login-only header
    if (!isAuthenticated) {
      this.createLoginHeader();
      return;
    }

    // Otherwise, create full header

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
        name: 'schedules',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
        tooltip: 'Agendamentos'
      },
      {
        name: 'notes',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>',
        tooltip: 'Notas Globais'
      },
      {
        name: 'new-message',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" x2="15" y1="10" y2="10"/><line x1="12" x2="12" y1="7" y2="13"/></svg>',
        tooltip: 'Nova Mensagem'
      },
      {
        name: 'subscription',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
        tooltip: 'Assinaturas'
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

      // Add notification badge for notifications button with 9+ logic
      if (icon.name === 'notifications') {
        const badge = document.createElement('span');
        badge.className = 'princhat-notification-badge';
        const count = 10; // Initial count (matches fake notifications)
        badge.textContent = count > 9 ? '9+' : count.toString();
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

      // Add notes badge for notes button (dynamic count)
      if (icon.name === 'notes') {
        const badge = document.createElement('span');
        badge.className = 'princhat-notes-badge';
        badge.textContent = '0';
        badge.style.display = 'none'; // Hidden when 0
        button.appendChild(badge);
        // Store reference for updates
        button.dataset.notesBadge = 'true';
      }

      // Add schedules badge for schedules button (dynamic count)
      if (icon.name === 'schedules') {
        const badge = document.createElement('span');
        badge.className = 'princhat-schedules-badge';
        badge.textContent = '0';
        badge.style.display = 'none'; // Hidden when 0
        button.appendChild(badge);
        // Store reference for updates
        button.dataset.schedulesBadge = 'true';
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
        } else if (icon.name === 'schedules') {
          console.log(`[PrinChat UI] Schedules clicked`);
          this.toggleGlobalSchedulesPopup(button);
        } else if (icon.name === 'notes') {
          console.log(`[PrinChat UI] Notes clicked`);
          this.toggleGlobalNotesPopup(button);
        } else if (icon.name === 'new-message') {
          console.log(`[PrinChat UI] New message clicked`);
          this.toggleDirectChatPopup(button);
        } else if (icon.name === 'help') {
          console.log(`[PrinChat UI] Help clicked`);
          this.toggleHelpPopup(button);
        } else if (icon.name === 'subscription') {
          console.log(`[PrinChat UI] Subscription clicked`);
          this.toggleSubscriptionPopup(button);
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
      console.log('[PrinChat UI] Profile clicked - opening dropdown');
      this.toggleProfileDropdown(profileBtn);
    });

    rightSection.appendChild(profileBtn);

    // Assemble header
    this.customHeader.appendChild(leftSection);
    this.customHeader.appendChild(rightSection);

    // Final injection enforcement
    this.ensureHeaderInjected();

    // Observe body for changes to ensure header stays (WhatsApp might clear body)
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.princhat-custom-header') && this.customHeader) {
        // console.log('[PrinChat UI] Header removed by external script, reinjecting...');
        this.ensureHeaderInjected();
      }
    });

    observer.observe(document.body, { childList: true });

    // Backup: Periodic check ensures header persists even if MutationObserver misses something
    setInterval(() => {
      this.ensureHeaderInjected();
    }, 500);

    // Also try to inject into #app if available for better layout integration, 
    // but keep the body observer as backup
    const tryAppInject = () => {
      const app = document.querySelector('#app');
      if (app && app.firstChild && this.customHeader) {
        // app.insertBefore(this.customHeader, app.firstChild);
        // actually body injection seems more stable for global header
      }
    };

    setTimeout(tryAppInject, 1000);
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

      // Re-inject schedule button when chat changes
      setTimeout(() => {
        console.log('[PrinChat UI] Attempting to inject schedule button after chat change...');
        this.injectScheduleButton();
        this.injectNotesButton();
      }, 500); // Wait for DOM to stabilize
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
        let chatResponse;
        // Retry Loop: Poll up to 5 times to ensure we get the resolved contact Name for the Notes header
        for (let i = 0; i < 5; i++) {
          try {
            chatResponse = await this.requestFromContentScript({ type: 'GET_ACTIVE_CHAT' }, 2000);
            const rName = chatResponse?.data?.chatName || chatResponse?.data?.name;
            if (chatResponse?.success && rName && !/^[\d\s\+\-@]+$/.test(rName) && rName !== 'Chat' && rName !== 'Unknown') {
              break;
            }
            if (i < 4) await new Promise(r => setTimeout(r, 500));
          } catch (e) {
            console.log('[PrinChat UI] Notes fetch retry failed:', e);
          }
        }
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

      // Update badge and executions popup
      this.updateStatusPopup(); // Already updates executions popup
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

      // Update badge and executions popup
      this.updateExecutionsBadge();
      this.updateMessageStatusPopup(); // Updates executions popup
    });

    // Listen for lead updates (like tag changes) from injector
    document.addEventListener('PrinChatKanbanLeadUpdated', (event: any) => {
      console.log('[PrinChat DEBUG] 9. UI received PrinChatKanbanLeadUpdated!', event.detail);

      // If Kanban is open, we should re-render or update specific card
      if (this.isKanbanOpen) {
        console.log('[PrinChat DEBUG] 10. Kanban is OPEN. Queuing render...');
        this.queueKanbanRender();
      } else {
        console.log('[PrinChat DEBUG] 10. Kanban is CLOSED. Cache will naturally refresh on next open.');
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
      const { messageId, chatId } = event.detail;
      console.log('[PrinChat UI] Send single message event received:', { messageId, chatId });

      if (!messageId) {
        console.error('[PrinChat UI] No messageId provided in event');
        return;
      }

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
      await this.sendSingleMessage(message, chatId);
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

  /**
   * Inject schedule button into WhatsApp chat header
   */
  private injectScheduleButton() {
    try {
      // Find chat header
      const chatHeader = document.querySelector('#main > header');
      if (!chatHeader) {
        return;
      }

      // Check if button already exists
      if (chatHeader.querySelector('.princhat-schedule-button')) {
        return;
      }

      // EMERGENCY FIX: Structural Traversal
      // 1. Find the Menu ID button (Mais opções) - extremely stable anchor
      const menuBtn = chatHeader.querySelector('[data-icon="menu"]') ||
        chatHeader.querySelector('[aria-label="Mais opções"]') ||
        chatHeader.querySelector('[aria-label="More options"]');

      let actionsContainer: Element | null = null;

      if (menuBtn) {
        // Traverse parents until we find the main flex container that holds everything
        // We assume the container is within the header and has display:flex (usually)
        let parent = menuBtn.parentElement;
        while (parent && parent !== chatHeader) {
          // Check if this parent also contains the SEARCH button or VIDEO call button
          // This confirms it's the group container
          const hasSearch = parent.querySelector('[data-icon="search-alt"]') ||
            parent.querySelector('[aria-label="Pesquisar"]') ||
            parent.querySelector('[data-icon="search"]');

          if (hasSearch && parent.tagName === 'DIV') {
            actionsContainer = parent;
            break;
          }
          parent = parent.parentElement;
        }
      }

      // Fallback: Try classic selector if structural failed
      if (!actionsContainer) {
        actionsContainer = chatHeader.querySelector('div.x78zum5.x6s0dn4.x1afcbsf.x14ug900');
      }

      // Last resort: Just find the last div in header that looks like a container
      if (!actionsContainer) {
        const headerChildren = Array.from(chatHeader.children);
        // Usually the actions are in the last or second to last div
        actionsContainer = headerChildren[headerChildren.length - 1];
      }

      if (!actionsContainer) {
        console.error('[PrinChat UI] CRITICAL: Actions container not found for Schedule button');
        return;
      }

      // Create schedule button
      const scheduleButton = document.createElement('button');
      scheduleButton.className = 'princhat-schedule-button';
      scheduleButton.title = 'Agendar mensagem para este contato';
      scheduleButton.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <span>Agendar</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="princhat-schedule-plus-icon">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      `;

      // Add click event
      scheduleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('[PrinChat UI] Schedule button clicked');
        this.toggleScheduleListPopup(scheduleButton);
      });

      // Insert button at the beginning of actions container
      if (actionsContainer.firstChild) {
        actionsContainer.insertBefore(scheduleButton, actionsContainer.firstChild);
      } else {
        actionsContainer.appendChild(scheduleButton);
      }

      console.log('[PrinChat UI] ✅ Schedule button injected successfully via structural traversal');

      // Update button state based on existing schedules
      this.updateScheduleButton();
    } catch (error: any) {
      console.error('[PrinChat UI] Error injecting schedule button:', error?.message || error);
    }
  }

  /**
   * Inject notes button into WhatsApp chat header
   */
  private injectNotesButton() {
    try {
      // Find chat header
      const chatHeader = document.querySelector('#main > header');
      if (!chatHeader) {
        return;
      }

      // Check if button already exists
      if (chatHeader.querySelector('.princhat-notes-button')) {
        return;
      }

      let actionsContainer: Element | null = null;
      let insertRef: Node | null = null;

      // 1. Try to find relative to Schedule button if it exists
      const scheduleButton = chatHeader.querySelector('.princhat-schedule-button');

      if (scheduleButton && scheduleButton.parentElement) {
        actionsContainer = scheduleButton.parentElement;
        insertRef = scheduleButton.nextSibling;
      } else {
        // 2. Independent Discovery (same as Schedule)
        const menuBtn = chatHeader.querySelector('[data-icon="menu"]') ||
          chatHeader.querySelector('[aria-label="Mais opções"]') ||
          chatHeader.querySelector('[aria-label="More options"]');

        if (menuBtn) {
          let parent = menuBtn.parentElement;
          while (parent && parent !== chatHeader) {
            const hasSearch = parent.querySelector('[aria-label="Pesquisar"]') ||
              parent.querySelector('[data-icon="search"]');
            if (hasSearch && parent.tagName === 'DIV') {
              actionsContainer = parent;
              break;
            }
            parent = parent.parentElement;
          }
        }

        if (!actionsContainer) {
          // Fallback
          actionsContainer = chatHeader.querySelector('div.x78zum5.x6s0dn4.x1afcbsf.x14ug900');
        }
      }

      if (!actionsContainer) {
        console.error('[PrinChat UI] CRITICAL: Actions container not found for Notes button');
        return;
      }

      // Create notes button
      const notesButton = document.createElement('button');
      notesButton.className = 'princhat-notes-button';
      notesButton.title = 'Notas';
      notesButton.style.position = 'relative'; // For badge positioning
      notesButton.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/>
          <path d="M2 6h4"/>
          <path d="M2 10h4"/>
          <path d="M2 14h4"/>
          <path d="M2 18h4"/>
          <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>
        </svg>
        <span class="notes-badge" style="display: none;">0</span>
      `;

      // Add click event
      notesButton.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('[PrinChat UI] Notes button clicked');
        this.toggleNotesPopup(notesButton);
      });

      // Insert button
      if (insertRef) {
        actionsContainer.insertBefore(notesButton, insertRef);
      } else if (actionsContainer.firstChild) {
        actionsContainer.insertBefore(notesButton, actionsContainer.firstChild);
      } else {
        actionsContainer.appendChild(notesButton);
      }

      // Update badge initially
      this.updateNotesBadge();

      console.log('[PrinChat UI] ✅ Notes button injected successfully');
    } catch (error: any) {
      console.error('[PrinChat UI] Error injecting notes button:', error?.message || error);
    }
  }

  /**
   * Update notes badge count
   * @param forceRefresh If true, ignores active chat cache and forces fetch
   */
  private async updateNotesBadge(forceRefresh: boolean = false) {
    try {
      const notesButton = document.querySelector('.princhat-notes-button');
      if (!notesButton) return;

      const badge = notesButton.querySelector('.notes-badge') as HTMLElement;
      if (!badge) return;

      // If forcing refresh, invalidate cache first
      if (forceRefresh) {
        this.invalidateChatCache();
      }

      const chatId = await this.getActiveChatId();
      if (!chatId) {
        badge.style.display = 'none';
        return;
      }

      const response = await this.requestFromContentScript({
        type: 'GET_NOTES_BY_CHAT',
        payload: { chatId }
      }) as any;

      const notes = response?.data || [];
      const count = notes.length;

      const badgeElement = document.querySelector('.notes-badge') as HTMLElement;
      if (badgeElement) {
        badgeElement.textContent = count.toString();
        badgeElement.style.display = count > 0 ? 'flex' : 'none';
      }
    } catch (error) {
      console.error('[PrinChat UI] Error updating notes badge:', error);
    }
  }

  /**
   * Update global notes badge count (header icon)
   */
  private async updateGlobalNotesBadge() {
    try {
      const response = await this.requestFromContentScript({
        type: 'GET_ALL_NOTES'
      }) as any;

      const notes = response?.data || [];
      const count = notes.length;

      const badge = document.querySelector('[data-notes-badge="true"] .princhat-notes-badge') as HTMLElement;
      if (badge) {
        badge.textContent = count.toString();
        badge.style.display = count > 0 ? 'flex' : 'none';
      }
    } catch (error) {
      console.error('[PrinChat UI] Error updating global notes badge:', error);
    }
  }

  /**
   * Update global schedules badge count (header icon)
   * Only shows count for pending and paused schedules (not completed/cancelled/failed)
   */
  private async updateGlobalSchedulesBadge() {
    try {
      const response = await this.requestFromContentScript({
        type: 'GET_ALL_SCHEDULES'
      }) as any;

      const schedules = response?.data || [];
      // Count only pending and paused schedules (not completed, cancelled, or failed)
      const activeSchedules = schedules.filter((s: Schedule) => s.status === 'pending' || s.status === 'paused');
      const count = activeSchedules.length;

      const badge = document.querySelector('[data-schedules-badge="true"] .princhat-schedules-badge') as HTMLElement;
      if (badge) {
        badge.textContent = count.toString();
        badge.style.display = count > 0 ? 'flex' : 'none';
      }
    } catch (error) {
      console.error('[PrinChat UI] Error updating global schedules badge:', error);
    }
  }

  /**
   * Update schedule button based on schedule count
   * - Shows button with text if no schedules
   * - Shows icon with badge if schedules exist
   * @param forceRefresh If true, ignores active chat cache and forces fetch
   */
  private async updateScheduleButton(forceRefresh: boolean = false) {
    try {
      const chatHeader = document.querySelector('#main > header');
      if (!chatHeader) {
        console.log('[PrinChat UI] Chat header not found');
        return;
      }

      // If forcing refresh, invalidate cache first
      if (forceRefresh) {
        this.invalidateChatCache();
      }

      // Get active chat ID
      const chatId = await this.getActiveChatId() || '';
      if (!chatId) {
        console.log('[PrinChat UI] No active chat ID');
        return;
      }

      // Load schedules for this chat
      const response = await this.requestFromContentScript({
        type: 'GET_SCHEDULES_BY_CHAT',
        payload: { chatId }
      });

      const schedules: Schedule[] = response?.data || [];

      // Count only pending and paused schedules (not completed or failed)
      const activeSchedules = schedules.filter(s => s.status === 'pending' || s.status === 'paused');
      const scheduleCount = activeSchedules.length;

      // Log only on significant change or error, not every poll
      // console.log('[PrinChat UI] Active schedule count for this chat:', scheduleCount);

      // Find existing button
      const existingButton = chatHeader.querySelector('.princhat-schedule-button') as HTMLElement;
      if (!existingButton) {
        console.log('[PrinChat UI] Schedule button not found, reinjecting...');
        this.injectScheduleButton();
        return;
      }

      // Update button based on schedule count
      if (scheduleCount > 0) {
        // Transform to icon with badge - using calendar icon
        existingButton.classList.add('has-schedules');
        existingButton.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span class="princhat-schedule-badge">${scheduleCount}</span>
        `;
        existingButton.title = `${scheduleCount} agendamento${scheduleCount > 1 ? 's' : ''}`;
      } else {
        // Show as button with text
        existingButton.classList.remove('has-schedules');
        existingButton.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span>Agendar</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="princhat-schedule-plus-icon">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        `;
        existingButton.title = 'Agendar mensagem para este contato';
      }
    } catch (error: any) {
      console.error('[PrinChat UI] Error updating schedule button:', error);
    }
  }

  /**
   * Monitor chat header changes and re-inject button when chat changes
   */
  private monitorChatHeaderChanges() {
    try {
      // PRIMARY: MutationObserver to catch changes immediately
      let debounceTimer: NodeJS.Timeout | null = null;

      const observer = new MutationObserver((mutations) => {
        // Ignore PrinChat internal updates to prevent infinite loops
        const isInternalUpdate = mutations.every(m => {
          const target = m.target as HTMLElement;
          // Check if mutation is related to our buttons or badges
          return target.classList?.contains('princhat-schedule-button') ||
            target.classList?.contains('princhat-notes-button') ||
            target.closest?.('.princhat-schedule-button') ||
            target.closest?.('.princhat-notes-button') ||
            target.classList?.contains('princhat-schedule-badge') ||
            // Check added nodes
            (m.type === 'childList' && Array.from(m.addedNodes).some((n: any) =>
              n.classList?.contains('princhat-schedule-button') || n.classList?.contains('princhat-notes-button')
            ));
        });

        if (isInternalUpdate) return;

        // OPTIMIZATION: In Business, ignore irrelevant changes to avoid loops
        if (this.isWhatsAppBusiness()) {
          const hasRelevantChanges = mutations.some(mutation => {
            // Ignore style/class changes if they don't affect structure
            if (mutation.type === 'attributes' &&
              ['style', 'class', 'role', 'tabindex'].includes(mutation.attributeName || '')) {
              return false;
            }
            return true;
          });

          if (!hasRelevantChanges) return;
        }

        // Chat header changed
        const oldChatId = this.currentChatId; // Capture current known ID
        this.invalidateChatCache();

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          // 1. Inject buttons blindly (visuals)
          this.checkAndInjectButtons(false);

          // 2. Wait for data sync (Logic)
          // We wait until the Chat ID actually changes from the old one
          const newChatId = await this.waitForChatIdChange(oldChatId);
          this.currentChatId = newChatId;

          // 3. Now update data (force refresh)
          if (newChatId) {
            this.updateScheduleButton(true);
            this.updateNotesBadge(true);
          }
        }, this.isWhatsAppBusiness() ? 300 : 50); // Slower debounce for Business
      });

      const mainContainer = document.querySelector('#main');
      if (mainContainer) {
        // Business optimization: Don't observe subtree if possible to reduce noise, 
        // but chat changes usually require subtree. We rely on the filter above.
        observer.observe(mainContainer, {
          childList: true,
          subtree: true,
          attributes: this.isWhatsAppBusiness(), // Only watch attributes in Business to filter them
          attributeFilter: this.isWhatsAppBusiness() ? ['data-testid', 'data-id'] : undefined
        });
        console.log('[PrinChat UI] ✓ Chat header monitor active (Observer)');
      } else {
        // Fallback for initial load
        const bodyObserver = new MutationObserver(() => {
          const main = document.querySelector('#main');
          if (main) {
            console.log('[PrinChat UI] Found #main via body observer, attaching main observer');
            observer.observe(main, { childList: true, subtree: true });
            bodyObserver.disconnect();
          }
        });
        bodyObserver.observe(document.body, { childList: true, subtree: true });
      }

      // SECONDARY: Polling Interval (Fail-safe for chat switches)
      // This guarantees persistence even if observer detaches
      // Relaxed interval for Business to prevent CPU spikes
      const pollInterval = this.isWhatsAppBusiness() ? 5000 : 3000;
      console.log(`[PrinChat UI] Starting persistence polling (${pollInterval}ms interval)...`);

      setInterval(() => {
        // Polling checks should NOT force refresh unless missing buttons found
        // to avoid spamming the content script
        this.checkAndInjectButtons(false);
      }, pollInterval);

      // Listen for schedule changes events
      document.addEventListener('PrinChatSchedulesChanged', () => {
        this.updateScheduleButton(true);
      });

      document.addEventListener('PrinChatScheduleExecuted', async () => {
        await this.updateScheduleButton(true);
        if (this.scheduleListPopup) {
          await this.refreshScheduleListPopup();
        }
      });
    } catch (error: any) {
      console.error('[PrinChat UI] Error setting up chat header monitor:', error?.message || error);
    }
  }

  /**
   * Helper to check presence of buttons and inject if missing
   * @param forceRefresh If true, forces a data refresh even if buttons exist
   */
  private checkAndInjectButtons(forceRefresh: boolean = false) {
    const chatHeader = document.querySelector('#main > header');
    if (chatHeader) {
      let injected = false;

      // Check Schedule Button
      if (!chatHeader.querySelector('.princhat-schedule-button')) {
        // console.log('[PrinChat UI] Persistence: Injecting Schedule Button...');
        this.injectScheduleButton();
        injected = true;
      }

      // Check Notes Button
      if (!chatHeader.querySelector('.princhat-notes-button')) {
        // console.log('[PrinChat UI] Persistence: Injecting Notes Button...');
        this.injectNotesButton();
        injected = true;
      }

      // If we just injected OR if a force refresh was requested due to navigation
      if (injected || forceRefresh) {
        // Add small delay to allow chat ID to update if this is a navigation event
        setTimeout(() => {
          this.updateScheduleButton();
          this.updateNotesBadge();
        }, 100);
      }
    }
  }

  // ==================== KANBAN SYSTEM ====================

  /**
   * Inject critical Kanban styles to ensure layout correctness
   */
  private injectKanbanStyles() {
    const styleId = 'princhat-kanban-critical-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .princhat-kanban-lead-header {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          width: 100% !important;
          margin-bottom: 4px !important;
        }

        .princhat-kanban-lead-time-badge {
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          margin-left: auto !important; /* Push to right */
          white-space: nowrap !important;
        }

        .princhat-kanban-lead-time {
          font-size: 11px !important;
          color: #9e9e9e !important;
          font-weight: 400 !important;
          line-height: 1 !important;
        }

        .princhat-kanban-lead-unread {
          border-radius: 999px !important;
          width: 20px !important; /* Fixed width for perfect circle */
          height: 20px !important;
          min-width: 20px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          text-align: center !important;
          padding: 0 !important; /* Remove padding to ensure centering */
          line-height: 1 !important;
          aspect-ratio: 1/1 !important;
        }

        /* Fix alignment of bottom metadata icons */
        .princhat-kanban-lead-meta {
          display: flex !important;
          align-items: center !important;
          margin-top: 8px !important;
          gap: 12px !important;
          color: #9e9e9e !important;
          font-size: 13px !important;
          
          /* Alignment Fix: Reset padding/margin to align with text */
          padding: 8px 0 0 0 !important; 
          margin-left: 0 !important;
          width: 100% !important;
          
          /* Visual Fix: Move border here and add padding-top to separate hover effect */
          border-top: 1px solid rgba(134, 150, 160, 0.15) !important;
        }

        /* Unified Tag Style for Consistency */
        .princhat-kanban-tag-unified {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 10px !important;
          font-weight: 500 !important;
          line-height: 1.3 !important;
          padding: 1px 6px !important;
          border-radius: 4px !important;
          text-transform: none !important;
          gap: 4px !important;
          min-height: 18px !important; /* Enforce minimum height for consistency */
          height: auto !important;
          box-sizing: border-box !important;
        }

        .princhat-kanban-meta-item {
           display: flex;
           align-items: center;
           gap: 4px;
           padding: 4px; 
           border-radius: 4px;
           cursor: pointer;
           margin-left: -4px; /* Compensate for padding to align icon flush left */
        }

        .princhat-kanban-meta-item:hover {
          background-color: rgba(134, 150, 160, 0.1);
        }
      `;
      (document.head || document.documentElement).appendChild(style);
      console.log('[PrinChat UI] 🎨 Injected critical Kanban styles');
    }
  }

  /**
   * Inject Kanban button into WhatsApp sidebar
   */
  private injectKanbanButton() {
    try {
      console.log('[PrinChat UI] Injecting Kanban button into sidebar...');

      // Check if button already exists
      if (document.querySelector('.princhat-kanban-sidebar-btn')) {
        console.log('[PrinChat UI] Kanban button already exists');
        return;
      }

      // Try multiple selectors to find the sidebar container
      let sidebarContainer = document.querySelector('header[data-tab="2"]');
      if (!sidebarContainer) {
        sidebarContainer = document.querySelector('div[data-tab="2"]');
      }

      if (!sidebarContainer) {
        console.log('[PrinChat UI] Sidebar container not found, will retry...');
        setTimeout(() => this.injectKanbanButton(), 1000);
        return;
      }

      console.log('[PrinChat UI] Found sidebar container:', sidebarContainer.tagName);

      // Find the Meta AI button (data-navbar-item-index="4")
      const metaAiButton = sidebarContainer.querySelector('[data-navbar-item-index="4"]');
      if (!metaAiButton || !metaAiButton.parentElement) {
        console.log('[PrinChat UI] Meta AI button not found, will retry...');
        setTimeout(() => this.injectKanbanButton(), 1000);
        return;
      }

      console.log('[PrinChat UI] Found Meta AI button');

      // Get the wrapper element of Meta AI button (the direct parent that we want to duplicate)
      const metaAiWrapper = metaAiButton.closest('.x1c4vz4f.xs83m0k.xdl72j9') || metaAiButton.parentElement;

      console.log('[PrinChat UI] Meta AI wrapper:', metaAiWrapper.className);

      // Create Kanban button wrapper - same structure as Meta AI button
      const buttonWrapper = document.createElement('div');
      buttonWrapper.className = metaAiWrapper.className;

      const buttonSpan = document.createElement('span');
      buttonSpan.className = 'html-span xdj266r x14z9mp xat24cr x1lziwak xexx8yu xyri2b x18d9i69 x1c1uobl x1hl2dhg x16tdsg8 x1vvkbs x4k7w5x x1h91t0o x1h9r5lt x1jfb8zj xv2umb2 x1beo9mf xaigb6o x12ejxvf x3igimt xarpa2k xedcshv x1lytzrv x1t2pt76 x7ja8zs x1qrby5j';

      const button = document.createElement('button');
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', 'Kanban - Organização de Leads');
      button.setAttribute('tabindex', '-1');
      button.setAttribute('data-navbar-item', 'true');
      button.setAttribute('data-navbar-item-selected', 'false');
      button.className = 'xjb2p0i xk390pu x1heor9g x1ypdohk xjbqb8w x972fbf x10w94by x1qhh985 x14e42zd xtnn1bt x9v5kkp xmw7ebm xrdum7p xt8t1vi x1xc408v x129tdwq x15urzxu xh8yej3 x1y1aw1k xf159sx xwib8y2 xmzvs34 princhat-kanban-sidebar-btn';
      button.setAttribute('data-navbar-item-index', '5');

      const iconContainer = document.createElement('div');
      iconContainer.className = 'x1c4vz4f xs83m0k xdl72j9 x1g77sc7 x78zum5 xozqiw3 x1oa3qoh x12fk4p8 xeuugli x2lwn1j x1nhvcw1 x1q0g3np x6s0dn4 xh8yej3';

      const iconInner = document.createElement('div');
      iconInner.className = 'x1c4vz4f xs83m0k xdl72j9 x1g77sc7 x78zum5 xozqiw3 x1oa3qoh x12fk4p8 xeuugli x2lwn1j x1nhvcw1 x1q0g3np x6s0dn4 x1n2onr6';
      iconInner.style.flexGrow = '1';

      const iconWrapper = document.createElement('div');

      // Columns3 icon (Kanban representation)
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('height', '24');
      icon.setAttribute('width', '24');
      icon.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('aria-hidden', 'true');
      icon.setAttribute('data-icon', 'kanban');

      icon.innerHTML = `
        <rect x="3" y="3" width="6" height="18" rx="1" stroke="currentColor" stroke-width="2" fill="none" />
        <rect x="12" y="3" width="3" height="18" rx="1" stroke="currentColor" stroke-width="2" fill="none" />
        <rect x="18" y="3" width="3" height="18" rx="1" stroke="currentColor" stroke-width="2" fill="none" />
      `;

      iconWrapper.appendChild(icon);
      iconInner.appendChild(iconWrapper);
      iconContainer.appendChild(iconInner);
      button.appendChild(iconContainer);
      buttonSpan.appendChild(button);
      buttonWrapper.appendChild(buttonSpan);

      // Add click handler BEFORE insertion to ensure it's always attached
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('[PrinChat UI] Kanban button clicked');
        this.toggleKanbanOverlay();
      });

      // Insert directly after "Anunciar no Facebook" button
      const anunciarBtn = sidebarContainer.querySelector('[aria-label="Anunciar no Facebook"]');
      const anunciarWrapper = anunciarBtn?.closest('.x1c4vz4f.xs83m0k.xdl72j9');

      if (anunciarWrapper) {
        anunciarWrapper.insertAdjacentElement('afterend', buttonWrapper);
        console.log('[PrinChat UI] ✅ Kanban button inserted after Anunciar icon');
      } else {
        // Anunciar button not found yet - retry after delay
        console.log('[PrinChat UI] ⚠️ Anunciar button not found, will retry in 1s...');
        setTimeout(() => {
          const retryAnunciarBtn = sidebarContainer.querySelector('[aria-label="Anunciar no Facebook"]');
          const retryAnunciarWrapper = retryAnunciarBtn?.closest('.x1c4vz4f.xs83m0k.xdl72j9');

          if (retryAnunciarWrapper) {
            retryAnunciarWrapper.insertAdjacentElement('afterend', buttonWrapper);
            console.log('[PrinChat UI] ✅ Kanban button inserted after Anunciar icon (retry)');
          } else if (metaAiWrapper.parentElement) {
            // Still not found - fallback to append
            metaAiWrapper.parentElement.appendChild(buttonWrapper);
            console.log('[PrinChat UI] ⚠️ Anunciar button still not found, appended to end');
          } else {
            console.error('[PrinChat UI] ❌ Could not find parent element to insert button');
          }
        }, 1000);
      }

      console.log('[PrinChat UI] ✅ Kanban button injected successfully');
    } catch (error: any) {
      console.error('[PrinChat UI] Error injecting Kanban button:', error?.message || error);
      console.error('[PrinChat UI] Stack:', error?.stack);
    }
  }

  /**
   * Setup listeners on WhatsApp sidebar buttons to close Kanban when clicked
   */
  private setupSidebarListeners() {
    try {
      // Find all WhatsApp sidebar buttons (data-navbar-item)
      const sidebarButtons = document.querySelectorAll('[data-navbar-item="true"]');

      sidebarButtons.forEach((btn) => {
        // Skip the Kanban button itself
        if (btn.classList.contains('princhat-kanban-sidebar-btn')) {
          return;
        }

        // Add click listener to close Kanban
        btn.addEventListener('click', () => {
          if (this.isKanbanOpen) {
            console.log('[PrinChat UI] Sidebar button clicked, closing Kanban');
            this.closeKanbanOverlay();
          }
        }, { once: false }); // Not once, so it works multiple times
      });

      console.log('[PrinChat UI] Sidebar listeners configured for', sidebarButtons.length - 1, 'buttons');
    } catch (error: any) {
      console.error('[PrinChat UI] Error setting up sidebar listeners:', error?.message || error);
    }
  }

  /**
   * Toggle Kanban fullscreen overlay
   */
  private toggleKanbanOverlay() {
    if (this.isKanbanOpen) {
      this.closeKanbanOverlay();
    } else {
      this.openKanbanOverlay();
    }
  }

  /**
   * Open Kanban fullscreen overlay
   */
  private async openKanbanOverlay() {
    if (this.isKanbanOpen || this.kanbanOverlay || document.querySelector('.princhat-kanban-overlay')) {
      console.log('[PrinChat UI] Kanban overlay already exists, focusing it.');
      this.isKanbanOpen = true; // Ensure state sync
      this.kanbanOverlay = document.querySelector('.princhat-kanban-overlay') as HTMLElement;
      return;
    }

    console.log('[PrinChat UI] Opening Kanban overlay...');

    console.log('[PrinChat UI] 🔄 Reset hasSyncedTags flag for new session');

    // Cleanup Profile Dropdown if open (USER REQ)
    if (this.profileDropdown) {
      this.profileDropdown.remove();
      this.profileDropdown = null;
      const profileBtn = document.querySelector('.princhat-header-profile-btn');
      if (profileBtn) {
        profileBtn.classList.remove('active');
      }
    }

    // Modify global header: hide extension icons, show "Nova Coluna" button
    if (this.customHeader) {
      const headerRight = this.customHeader.querySelector('.princhat-header-right');
      if (headerRight) {
        // Hide all header icons
        headerRight.classList.add('princhat-hidden');

        // Create and add "Nova Coluna" button
        const newColumnBtn = document.createElement('button');
        newColumnBtn.className = 'princhat-kanban-btn-new-column princhat-header-kanban-btn';
        newColumnBtn.innerHTML = `
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
          Nova Coluna
        `;
        newColumnBtn.addEventListener('click', () => {
          console.log('[PrinChat UI] Nova Coluna button clicked!');
          this.showNewColumnModal();
        });
        // Insert button before the headerRight element (sibling position)
        headerRight.parentElement?.insertBefore(newColumnBtn, headerRight);
      }
    }

    // Mark Kanban sidebar button as active
    const kanbanBtn = document.querySelector('.princhat-kanban-sidebar-btn');
    if (kanbanBtn) {
      kanbanBtn.setAttribute('data-navbar-item-selected', 'true');
      kanbanBtn.setAttribute('aria-pressed', 'true');
    }

    // Add listeners to WhatsApp sidebar buttons to close Kanban when clicked
    this.setupSidebarListeners();

    // Create Kanban overlay that covers only WhatsApp content area
    const overlay = document.createElement('div');
    overlay.className = 'princhat-kanban-overlay';

    overlay.innerHTML = `
        <div class="princhat-kanban-board">
          <div class="princhat-kanban-columns-container">
            <!--Columns will be rendered here-->
          </div>
        </div>
        `;

    // Setup global drag listeners
    // Setup global drag listeners
    // Moved to renderKanbanColumns to ensure elements exist

    // Find WhatsApp content area and insert overlay
    const whatsappContent = document.querySelector('#app');
    if (whatsappContent) {
      whatsappContent.appendChild(overlay);
    } else {
      console.warn('[PrinChat UI] ⚠️ Could not find #app to mount Kanban overlay. Aborting to avoid pollution.');
      // document.body.appendChild(overlay); // DISABLE FALLBACK to prevent ghost overlays in iframes
    }

    this.kanbanOverlay = overlay;
    this.isKanbanOpen = true;

    document.body.classList.add('princhat-kanban-active');

    await this.renderKanbanColumns();

    // Setup real-time update listeners
    this.setupKanbanRealtimeListeners();

    // Start backup polling for tag updates (catches events that don't fire)
    this.startKanbanTagPolling();

    console.log('[PrinChat UI] ✅ Kanban overlay opened');
  }

  /**
   * Setup real-time Kanban update listeners
   */
  private setupKanbanRealtimeListeners() {
    if (this.areKanbanListenersSetup) return;
    this.areKanbanListenersSetup = true;

    // Listen for incoming messages directly (Optimistic UI Update)
    document.addEventListener('PrinChatIncomingMessage', (event: any) => {
      if (!this.isKanbanOpen) return;

      const { messageText, chatId, timestamp, fromMe } = event.detail;
      console.log('[PrinChat UI] 📨 Incoming message (Optimistic):', chatId);

      // 1. Find card (Try multiple ID formats for Standard/Business compatibility)
      let card = this.kanbanOverlay?.querySelector(`.princhat-kanban-lead-card[data-lead-id="${chatId}"]`);

      if (!card) {
        // Try alternate formats
        const rawId = chatId.replace(/@c\.us|@lid|@g\.us/g, '');
        card = this.kanbanOverlay?.querySelector(`.princhat-kanban-lead-card[data-lead-id="${rawId}@c.us"]`) ||
          this.kanbanOverlay?.querySelector(`.princhat-kanban-lead-card[data-lead-id="${rawId}"]`) ||
          this.kanbanOverlay?.querySelector(`.princhat-kanban-lead-card[data-lead-id^="${rawId}"]`);
      }

      if (card) {
        // 2. Move to top of its CURRENT column (Prevent Column Jump)
        // Ensure we find the column body relative to the card
        const currentColumnBody = card.closest('.princhat-kanban-column-body');
        if (currentColumnBody) {
          // Only move if not already at the top
          if (currentColumnBody.firstElementChild !== card) {
            console.log('[PrinChat UI] ⬆️ Bumping card to top of CURRENT column');
            currentColumnBody.prepend(card);
          }
        }

        // 3. Update preview text with "Você:" prefix if applicable
        const previewEl = card.querySelector('.princhat-kanban-lead-preview');
        if (previewEl) {
          const prefix = fromMe ? 'Você: ' : '';
          const fullText = prefix + messageText;
          previewEl.textContent = fullText.length > 50 ? fullText.substring(0, 50) + '...' : fullText;
        }

        // 4. Update time
        const timeEl = card.querySelector('.princhat-kanban-lead-time');
        if (timeEl) {
          timeEl.textContent = new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }

        // 5. Unread Count Logic (Clear on Reply, Increment on Receive)
        const timeBadgeEl = card.querySelector('.princhat-kanban-lead-time-badge');

        if (fromMe) {
          // If message is from ME, clear unread count
          console.log('[PrinChat UI] 📤 Outgoing message detected - Clearing unread count for:', chatId);

          if (timeBadgeEl) {
            const badge = timeBadgeEl.querySelector('.princhat-kanban-lead-unread');
            if (badge) badge.remove();
          }

          // Persist reset to database
          this.requestFromContentScript({
            type: 'UPDATE_KANBAN_LEAD',
            payload: {
              leadId: chatId,
              updates: { unreadCount: 0 }
            }
          }).catch(err => console.error('[PrinChat UI] Failed to clear unread count in DB:', err));

        } else {
          // If message is INCOMING, increment unread count
          if (timeBadgeEl) {
            let badge = timeBadgeEl.querySelector('.princhat-kanban-lead-unread');
            let count = 0;
            if (badge) {
              const current = parseInt(badge.textContent || '0');
              count = isNaN(current) ? 9 : current;
            } else {
              badge = document.createElement('span');
              badge.className = 'princhat-kanban-lead-unread';
              timeBadgeEl.appendChild(badge);
            }
            count++;

            // Limit visual count to 9+
            badge.textContent = count > 9 ? '9+' : String(count);
            if (count > 9) badge.setAttribute('data-count', '9+');

            // Persist increment to database (Optional: DB might already handle this via background listener?)
            // Usually background handles incrementing for incoming messages. 
            // We only need to force reset on outgoing.
            // But to be safe/synced, we can update here too, or trust the sync.
            // Let's trust the background listener for increments to avoid double-counting if we send updates.
            // Actually, for optimistic UI, we update visual here.
          }
        }

        // 6. Highlight animation
        card.classList.add('princhat-kanban-card-updated');
        setTimeout(() => card.classList.remove('princhat-kanban-card-updated'), 300);
      }
    });

    // Listen for lead updates (Database confirmed updates)
    document.addEventListener('PrinChatKanbanLeadUpdated', (event: any) => {
      if (!this.isKanbanOpen) return;

      const { leadId, updates } = event.detail;
      console.log('[PrinChat UI] 🔄 Lead updated:', leadId, updates);

      // Find and update the card in DOM
      const card = this.kanbanOverlay?.querySelector(`.princhat - kanban - lead - card[data - lead - id="${leadId}"]`);
      if (card) {
        // Update last message preview
        if (updates.lastMessage) {
          let previewEl = card.querySelector('.princhat-kanban-lead-preview');
          if (!previewEl) {
            // Create preview element if it doesn't exist
            previewEl = document.createElement('p');
            previewEl.className = 'princhat-kanban-lead-preview';
            const headerEl = card.querySelector('.princhat-kanban-lead-header');
            if (headerEl) {
              headerEl.insertAdjacentElement('afterend', previewEl);
            }
          }
          if (previewEl) {
            const preview = updates.lastMessage.length > 50 ? updates.lastMessage.substring(0, 50) + '...' : updates.lastMessage;
            previewEl.textContent = preview;
          }
        }

        // Update time
        if (updates.lastMessageTime) {
          const timeEl = card.querySelector('.princhat-kanban-lead-time');
          if (timeEl) {
            const time = new Date(updates.lastMessageTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            timeEl.textContent = time;
          }
        }

        // Update unread count badge
        if (updates.unreadCount !== undefined) {
          const timeBadgeEl = card.querySelector('.princhat-kanban-lead-time-badge');
          if (timeBadgeEl) {
            // Remove old badge if exists
            const oldBadge = timeBadgeEl.querySelector('.princhat-kanban-lead-unread');
            if (oldBadge) oldBadge.remove();

            // Add new badge
            if (updates.unreadCount > 0) {
              const badge = document.createElement('span');
              badge.className = 'princhat-kanban-lead-unread';
              if (updates.unreadCount > 9) {
                badge.setAttribute('data-count', '9+');
                badge.textContent = '9+';
              } else {
                badge.textContent = String(updates.unreadCount);
              }
              timeBadgeEl.appendChild(badge);
            }
          }
        }

        // Update order attribute for sorting stability
        if (updates.order) {
          card.setAttribute('data-order', updates.order.toString());
        }

        // MOVEMENT LOGIC: Move to top of current column when updated (new message)
        const parentColumnBody = card.closest('.princhat-kanban-column-body');
        if (parentColumnBody) {
          // Check if it's already the first element
          if (parentColumnBody.firstElementChild !== card) {
            console.log('[PrinChat UI] ⬆️ Moving updated card to top');
            parentColumnBody.prepend(card);
          }
        }

        // Add animation
        card.classList.add('princhat-kanban-card-updated');
        setTimeout(() => card.classList.remove('princhat-kanban-card-updated'), 300);

        console.log('[PrinChat UI] ✅ Card updated in DOM');
      }
    });

    // Listen for new lead creation
    document.addEventListener('PrinChatKanbanLeadCreated', async (event: any) => {
      if (!this.isKanbanOpen) return;

      const { lead } = event.detail;
      console.log('[PrinChat UI] ➕ New lead created:', lead.name);

      // Re-render Kanban to show new card
      this.queueKanbanRender();
    });

    // Listen for label/tag changes (colors or new labels)
    // Listen for label/tag changes (colors or new labels)
    document.addEventListener('PrinChatLabelsChanged', async (event: any) => {
      try {
        console.log('[PrinChat UI] 🏷️📥 Label change detected!', event.detail);

        // ALWAYS clear cache (even if Kanban closed) to ensure fresh data on next open
        this.globalLabels = [];
        console.log('[PrinChat UI] ✅ Cache cleared');

        // If event includes specific chat data, update that card INSTANTLY
        if (event.detail?.chatId && event.detail?.tags !== undefined) {
          console.log('[PrinChat UI] 🎯 Specific chat update detected - applying instant update');
          await this.updateCardTagsInstantly(event.detail.chatId, event.detail.tags);
        }

        // ALSO queue full render (as backup/sync for global label changes)
        // Only re-render if Kanban is currently open
        if (this.isKanbanOpen) {
          console.log('[PrinChat UI] 🔄 Kanban open - queuing re-render...');
          this.queueKanbanRender();
          // await this.renderKanbanColumns(); // Removed to use debounce
        } else {
          console.log('[PrinChat UI] 💤 Kanban closed - will fetch fresh on next open');
        }
      } catch (error) {
        console.error('[PrinChat UI] ❌ Error:', error);
      }
    });

    console.log('[PrinChat UI] 🔊 Real-time listeners setup');
  }

  /**
   * Close Kanban overlay
   */
  private closeKanbanOverlay() {
    // Cleanup global dropdowns/tooltips immediately
    document.querySelectorAll('.princhat-kanban-tags-tooltip, .princhat-kanban-card-dropdown, .princhat-kanban-description-tooltip, .princhat-kanban-modal-overlay, .princhat-kanban-column-menu').forEach(el => el.remove());
    document.querySelectorAll('.princhat-kanban-lead-card.active-menu').forEach(c => c.classList.remove('active-menu'));

    // Stop tag polling
    this.stopKanbanTagPolling();

    if (this.kanbanOverlay) {
      this.kanbanOverlay.remove();
      this.kanbanOverlay = null;
    }

    // Remove active state from Kanban sidebar button
    const kanbanBtn = document.querySelector('.princhat-kanban-sidebar-btn');
    if (kanbanBtn) {
      kanbanBtn.setAttribute('data-navbar-item-selected', 'false');
      kanbanBtn.setAttribute('aria-pressed', 'false');
    }

    // Restore global header: show extension icons, hide "Nova Coluna" button
    // Always query the DOM directly to avoid stale references
    const liveHeader = document.querySelector('.princhat-custom-header');
    if (liveHeader) {
      const headerRight = liveHeader.querySelector('.princhat-header-right');
      if (headerRight) {
        headerRight.classList.remove('princhat-hidden');
      }

      // Remove "Nova Coluna" button
      const newColumnBtn = liveHeader.querySelector('.princhat-header-kanban-btn');
      if (newColumnBtn) {
        newColumnBtn.remove();
      }
    }

    this.isKanbanOpen = false;
    document.body.classList.remove('princhat-kanban-active');

    console.log('[PrinChat UI] Kanban overlay closed');
  }

  /**
   * Get contact info for a specific chat (used for Kanban hydration)
   */


  /**
   * Queue a Kanban render with debounce
   * This prevents multiple rapid renders causing race conditions
   */
  private queueKanbanRender() {
    if (this.renderDebounceTimer) {
      clearTimeout(this.renderDebounceTimer);
    }

    console.log('[PrinChat UI] ⏳ Queuing Kanban render (debounced 1000ms)...');
    this.renderDebounceTimer = setTimeout(() => {
      // SAFEGUARD: If user is actively dragging, DO NOT Render!
      // Rendering destroys DOM and breaks the drag. Reschedule.
      if (document.body.classList.contains('kanban-is-dragging')) {
        console.warn('[PrinChat UI] ✋ Drag in progress - Rescheduling render...');
        this.queueKanbanRender();
        return;
      }
      this.renderKanbanColumns();
    }, 1000);
  }

  /**
   * Instantly update tags for a specific card without full re-render
   * Uses the robust ID matching strategy
   */
  private async updateCardTagsInstantly(chatId: string, newTags: string[]): Promise<void> {
    if (!this.isKanbanOpen) {
      console.log('[PrinChat UI] ⚠️ Kanban not open - skipping instant update');
      return;
    }

    console.log(`[PrinChat UI] ⚡ Instant tag update for ${chatId}`, newTags);

    // NORMALIZE ID: Remove WhatsApp suffixes (@lid, @c.us, @s.whatsapp.net, @g.us, etc.)
    // DB stores IDs without suffix, but events come with suffix
    const normalizedId = chatId.replace(/@lid$|@c\.us$|@s\.whatsapp\.net$|@g\.us$/g, '');
    console.log(`[PrinChat UI] 🔧 Normalized ID: "${chatId}" → "${normalizedId}"`);

    // ROBUST ID MATCHING (reuse existing logic)
    const rawId = normalizedId;
    let card: HTMLElement | null = null;

    console.log(`[PrinChat UI] 🔍 Searching for card with ID: "${rawId}"`);

    try {
      card = document.querySelector(`.princhat-kanban-lead-card[data-lead-id="${rawId}"]`);
      if (card) {
        console.log(`[PrinChat UI] ✅ Found card via exact match`);
      }
    } catch (e) {
      console.warn(`[PrinChat UI] ⚠️ Selector error:`, e);
    }

    // Fallback: User ID Match
    if (!card) {
      console.log(`[PrinChat UI] 🔄 Exact match failed, trying fallback...`);
      const userPart = rawId.split('@')[0];
      console.log(`[PrinChat UI]   Looking for cards starting with: "${userPart}"`);

      const allCards = Array.from(document.querySelectorAll('.princhat-kanban-lead-card'));
      console.log(`[PrinChat UI]   Total cards in DOM: ${allCards.length}`);

      // Log all card IDs for debugging
      const allCardIds = allCards.map(c => c.getAttribute('data-lead-id') || 'NO_ID');
      console.log(`[PrinChat UI]   All card IDs:`, allCardIds);

      for (const c of allCards) {
        const cId = c.getAttribute('data-lead-id') || '';
        if (cId.startsWith(userPart)) {
          card = c as HTMLElement;
          console.log(`[PrinChat UI] ✅ Found card via fallback match: "${cId}"`);
          break;
        }
      }

      if (!card) {
        console.error(`[PrinChat UI] ❌ No card found with prefix "${userPart}"`);
      }
    }

    if (!card) {
      console.warn(`[PrinChat UI] ⚠️ Card not found for instant update: ${chatId}`);
      return;
    }

    // Fetch label details for rendering
    let allLabels: any[] = [];

    // Use cached labels if available, otherwise fetch
    if (this.globalLabels && this.globalLabels.length > 0) {
      allLabels = this.globalLabels;
    } else {
      const labelsResponse = await this.requestFromContentScript({ type: 'GET_ALL_LABELS' });
      allLabels = labelsResponse?.data?.labels || [];
      this.globalLabels = allLabels; // Update cache
    }

    // Find tags container
    const tagsContainer = card.querySelector('.princhat-kanban-lead-tags');
    if (!tagsContainer) {
      console.warn('[PrinChat UI] Tags container not found in card');
      return;
    }

    // Render tags (reuse logic from updateCardDOM)
    const MAX_VISIBLE = 2;
    const tagElements = newTags.slice(0, MAX_VISIBLE).map(tagId => {
      const label = allLabels.find((l: any) => l.id === tagId);
      if (!label) return '';

      const bgColor = label.hexColor || '#4A5568';
      const textColor = this.getContrastColor(bgColor);

      return `
        <span class="princhat-kanban-tag" style="background-color: ${bgColor}; color: ${textColor};">
          ${label.name || 'Tag'}
        </span>
      `;
    }).join('');

    const hiddenCount = Math.max(0, newTags.length - MAX_VISIBLE);
    const moreButton = hiddenCount > 0 ? `
      <button class="princhat-kanban-more-tags" data-action="show-more-tags" data-tags='${JSON.stringify(newTags)}'>
        +${hiddenCount}
      </button>
    ` : '';

    tagsContainer.innerHTML = tagElements + moreButton;

    console.log(`[PrinChat UI] ✅ Card ${chatId} tags updated instantly`);
  }

  /**
   * Start polling for tag updates (backup for when events don't fire)
   * Polls every 8 seconds for visible cards
   */
  private startKanbanTagPolling() {
    // Clear any existing interval
    this.stopKanbanTagPolling();

    console.log('[PrinChat UI] 🔄 Starting tag polling (8s interval)');

    this.kanbanPollingInterval = setInterval(async () => {
      if (!this.isKanbanOpen) {
        console.log('[PrinChat UI] ⚠️ Polling stopped - Kanban closed');
        this.stopKanbanTagPolling();
        return;
      }

      await this.pollVisibleCardsForTagChanges();
    }, 8000); // Every 8 seconds
  }

  /**
   * Stop tag polling
   */
  private stopKanbanTagPolling() {
    if (this.kanbanPollingInterval) {
      clearInterval(this.kanbanPollingInterval);
      this.kanbanPollingInterval = null;
      this.lastPolledTags.clear();
      console.log('[PrinChat UI] 🛑 Tag polling stopped');
    }
  }

  /**
   * Poll all visible cards and update if tags changed
   */
  private async pollVisibleCardsForTagChanges() {
    if (!this.isKanbanOpen) return;

    const visibleCards = document.querySelectorAll('.princhat-kanban-lead-card');
    if (visibleCards.length === 0) return;

    console.log(`[PrinChat UI] 🔍 Polling ${visibleCards.length} visible cards for tag changes...`);

    // Fetch current leads from DB
    const response = await this.requestFromContentScript({ type: 'GET_ALL_KANBAN_LEADS' });
    if (!response?.data?.leads) return;

    const allLeads = response.data.leads;

    for (const card of Array.from(visibleCards)) {
      const chatId = card.getAttribute('data-lead-id');
      if (!chatId) continue;

      // Find lead in DB
      const lead = allLeads.find((l: any) => l.chatId === chatId);
      if (!lead) continue;

      const currentTags = lead.tags || [];
      const lastTags = this.lastPolledTags.get(chatId) || [];

      // Compare tags
      const tagsChanged = JSON.stringify(currentTags.sort()) !== JSON.stringify(lastTags.sort());

      if (tagsChanged) {
        console.log(`[PrinChat UI] 🔄 Polling detected tag change for ${chatId}`);
        console.log(`[PrinChat UI]   Old: ${JSON.stringify(lastTags)}`);
        console.log(`[PrinChat UI]   New: ${JSON.stringify(currentTags)}`);

        await this.updateCardTagsInstantly(chatId, currentTags);
        this.lastPolledTags.set(chatId, currentTags);
      } else {
        // Update cache even if no change (first poll)
        if (!this.lastPolledTags.has(chatId)) {
          this.lastPolledTags.set(chatId, currentTags);
        }
      }
    }
  }

  /**
   * Adjust color opacity
   */
  private adjustColorOpacity(color: string, opacity: number): string {
    try {
      // Handle Hex
      if (color.startsWith('#')) {
        let hex = color.slice(1);
        if (hex.length === 3) {
          hex = hex.split('').map(c => c + c).join('');
        }
        if (hex.length === 6) {
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }
      }
      // Handle rgb/rgba
      if (color.startsWith('rgb')) {
        const numbers = color.match(/\d+/g);
        if (numbers && numbers.length >= 3) {
          return `rgba(${numbers[0]}, ${numbers[1]}, ${numbers[2]}, ${opacity})`;
        }
      }
    } catch (e) {
      console.error('Error adjusting color:', e);
    }
    return color;
  }



  /**
   * Render Kanban columns from database
   */
  private async renderKanbanColumns() {
    if (this.isRenderingKanban) {
      console.log('[PrinChat UI] ⚠️ Kanban render already in progress, skipping duplication...');
      return;
    }

    this.isRenderingKanban = true;

    console.log('[PrinChat UI] 🎨 Rendering Kanban columns at', Date.now());

    const container = this.kanbanOverlay?.querySelector('.princhat-kanban-columns-container');
    if (!container) return;

    try {
      console.log('[PrinChat UI] renderKanbanColumns called');

      // 1. Fetch EVERYTHING first (Atomic Update Preparation)
      const columnsResponse = await this.requestFromContentScript({ type: 'GET_KANBAN_COLUMNS' });
      let rawColumns = columnsResponse?.data || [];

      // DEDUPLICATE COLUMNS (Fixing User Issue)
      const uniqueColumnsMap = new Map();
      rawColumns.forEach((col: any) => {
        if (!uniqueColumnsMap.has(col.id)) {
          uniqueColumnsMap.set(col.id, col);
        }
      });
      let columns = Array.from(uniqueColumnsMap.values());

      console.log(`[PrinChat UI] Loaded ${columns.length} unique columns(from ${rawColumns.length} raw)`);


      console.log('[PrinChat UI] 🔍 DEBUG: About to fetch/check labels. this.globalLabels.length =', this.globalLabels.length);

      // OPTIMIZATION: Do NOT block rendering for labels.
      // If we have them (from background fetch), great. If not, we render without colors
      // and they will be fixed on next render/refresh.
      if (this.globalLabels.length === 0) {
        console.log('[PrinChat UI] ⏳ Labels not ready yet. Triggering background fetch...');
        // Fire and forget catch-up
        this.requestFromContentScript({ type: 'GET_ALL_LABELS' })
          .then(res => {
            if (res?.data?.labels) {
              this.globalLabels = res.data.labels;
              console.log('[PrinChat UI] Late label fetch complete.');
              // CRITICAL FIX: Re-render columns if Kanban is still open to apply colors
              if (this.isKanbanOpen) {
                console.log('[PrinChat UI] 🎨 Re-rendering Kanban with new labels...');
                this.renderKanbanColumns();
              }
            }
          })
          .catch(console.error);
      } else {
        console.log('[PrinChat UI] Using cached global labels:', this.globalLabels.length);
      }


      // Fetch All Leads
      const leadsResponse = await this.requestFromContentScript({ type: 'GET_ALL_KANBAN_LEADS' });
      const allLeads = leadsResponse?.data || [];
      console.log('[PrinChat UI] Loaded', allLeads.length, 'total leads');

      // Fetch Contact Info for Leads (INSTANT RENDER + BACKGROUND HYDRATION)
      // OPTIMIZATION: Render immediately with what we have in DB. Update stale info in background.
      console.log('[PrinChat UI] 🚀 Instant Render strategy: Using cached lead data.');

      const leadsWithContactInfo: any[] = allLeads;

      // Trigger Background Hydration (Fire and Forget)
      this.hydrateLeadsInBackground(allLeads).catch(console.error);


      console.log('[PrinChat UI] ✅ All contact info fetched');

      // 2. ATOMIC DOM UPDATE
      this.destroySortables(); // Cleanup old drag instances

      const fragment = document.createDocumentFragment();

      columns.forEach((column: any) => {
        const columnLeads = leadsWithContactInfo.filter((l: any) => l.columnId === column.id)
          .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
        const columnEl = this.createColumnElement(column, columnLeads, this.globalLabels);
        fragment.appendChild(columnEl);
      });

      // Clear and Append in one go
      container.innerHTML = '';
      container.appendChild(fragment);

      // 3. Post-Render Setup
      this.setupColumnDragAndDrop();

      if (this.kanbanOverlay) {
        // Immediate init on next frame (No 500ms delay)
        requestAnimationFrame(() => {
          if (!this.kanbanOverlay || this.isSortableInitialized) return;

          this.initSortable(this.kanbanOverlay);
          this.isSortableInitialized = true;
        });
      }

      // Sanity Check
      this.fixNestedCards();

      // Persist Updated Labels to DB (Original Logic)
      for (const lead of leadsWithContactInfo) {
        if (lead.labels && lead.labels.length > 0) {
          try {
            this.requestFromContentScript({
              type: 'UPDATE_KANBAN_LEAD',
              payload: {
                leadId: lead.id,
                updates: { name: lead.name, photo: lead.photo, labels: lead.labels }
              }
            });
          } catch (e) { }
        }
      }

    } catch (error: any) {
      console.error('[PrinChat UI] Error rendering Kanban columns:', error);
      container.innerHTML = '<p style="color: #ff6b6b; text-align: center; padding: 2rem;">Erro ao carregar colunas</p>';
    } finally {
      this.isRenderingKanban = false;
    }
  }

  /**
   * Hydrate leads with fresh contact info in background
   * Updates DB so next render is fresh.
   */
  private async hydrateLeadsInBackground(leads: any[]) {
    console.log(`[PrinChat UI] 💧 Starting background hydration for ${leads.length} leads...`);
    const BATCH_SIZE = 10;

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);

      const promises = batch.map(async (lead) => {
        let chatId = lead.leadId || lead.id || lead.chatId;
        if (!chatId) return;

        // Normalize ID
        if (!chatId.includes('@') && /^\d+$/.test(chatId)) {
          chatId = `${chatId} @c.us`;
        }

        try {
          const info = await this.getContactInfo(chatId);
          // Only update if we have new useful info
          if (info.chatName || info.labels) {
            // Update UI immediately (Manual DOM Patching)
            this.updateCardDOM({
              ...lead,
              name: info.chatName || lead.name,
              photo: info.chatPhoto || lead.photo,
              labels: info.labels || [],
              tags: (info.labels || []).map((l: any) => l.id)
            });

          }
        } catch (e) {
          // Ignore errors in background hydration
        }
      });

      await Promise.all(promises);
      // Nice yield to main thread
      await new Promise(r => setTimeout(r, 100));
    }
    console.log('[PrinChat UI] ✅ Background hydration complete.');
  }

  /**
   * Manually update a card's DOM element with fresh data
   * This ensures "pop-in" of new data without full re-render
   */
  private updateCardDOM(lead: any) {
    const card = document.querySelector(`.princhat-kanban - lead - card[data - lead - id="${lead.id}"]`);
    if (!card) return;

    // 1. Update Name
    const nameEl = card.querySelector('.princhat-kanban-lead-name');
    if (nameEl) {
      // Instagram ID check
      const isInstagramId = /^\d{15,}/.test(lead.name || '');
      const displayName = isInstagramId ? 'Lead' : (lead.name || 'Desconhecido');
      nameEl.textContent = displayName;
    }

    // 2. Update Photo
    const photoContainer = card.querySelector('.princhat-kanban-lead-photo');
    if (photoContainer) {
      if (lead.photo) {
        photoContainer.innerHTML = `< img src = "${lead.photo}" alt = "${lead.name}" style = "width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" > `;
      } else {
        const initial = (lead.name || '?').charAt(0).toUpperCase();
        photoContainer.innerHTML = `< div class="princhat-kanban-lead-photo-placeholder" > ${initial} </div>`;
      }
    }

    // 3. Update Tags
    // Remove existing tags if any
    const existingTags = card.querySelector('.princhat-kanban-lead-tags');
    if (existingTags) existingTags.remove();

    if (lead.tags && lead.tags.length > 0) {
      const tagsContainer = document.createElement('div');
      tagsContainer.className = 'princhat-kanban-lead-tags';

      const firstTag = lead.tags[0];

      // Lookup label info
      let labelInfo = this.globalLabels.find(l => l.id === firstTag || (l.name && l.name.toLowerCase() === firstTag.toLowerCase()));
      // Fallback
      if (!labelInfo && lead.labels) {
        labelInfo = lead.labels.find((l: any) => String(l.id) === String(firstTag) || (l.name && l.name === firstTag));
      }

      const tagName = labelInfo ? labelInfo.name : firstTag;
      const tagColor = labelInfo ? (labelInfo.color || labelInfo.hexColor || '#2196f3') : '#2196f3';
      const safeColor = tagColor.startsWith('#') ? tagColor : '#' + tagColor;

      let finalBg = 'rgba(33, 150, 243, 0.30)'; // Fallback default
      let finalColor = '#2196f3';
      let textShadow = 'none';

      if (tagColor) {
        // Tag Color at 30% opacity (Legacy Style from Commit 9915674)
        finalBg = `color-mix(in srgb, ${safeColor} 30%, transparent)`;
        finalColor = safeColor;
        textShadow = 'none';
      }

      let tagsHtml = `
      <span class="princhat-kanban-tag" style="background-color: ${finalBg}; color: ${finalColor} !important; text-shadow: ${textShadow}; text-transform: none; font-size: 11px; font-weight: 500 !important; padding: 2px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; margin-right: 4px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" x2="7.01" y1="7" y2="7"/>
        </svg>
        ${this.escapeHtml(tagName)}
      </span>`;

      if (lead.tags.length > 1) {
        tagsHtml += `<span class="princhat-kanban-tag-more princhat-no-drag princhat-kanban-tag-unified" style="cursor: pointer !important; pointer-events: auto !important; position: relative !important; z-index: 99 !important; background-color: rgba(158, 158, 158, 0.2) !important; color: #9e9e9e !important; " data-action="show-more-tags" data-tags="${encodeURIComponent(JSON.stringify(
          (() => {
            const remainingTags = lead.tags.slice(1);
            return remainingTags.map((tag: string) => {
              let info = this.globalLabels.find(l => l.id === tag || (l.name && l.name.toLowerCase() === tag.toLowerCase()));
              if (!info && lead.labels) info = lead.labels.find((l: any) => l.id === tag || (l.name && l.name.toLowerCase() === tag.toLowerCase()));

              return {
                name: info?.name || tag,
                color: info?.color || '#2196f3'
              };
            });
          })()
        ))}">+${lead.tags.length - 1}</span>`;
      }

      tagsContainer.innerHTML = tagsHtml;

      // Append after lead-preview or before lead-meta to maintain correct order
      const leadInfo = card.querySelector('.princhat-kanban-lead-info');
      const leadMeta = card.querySelector('.princhat-kanban-lead-meta');

      if (leadInfo) {
        if (leadMeta) {
          leadInfo.insertBefore(tagsContainer, leadMeta);
        } else {
          leadInfo.appendChild(tagsContainer);
        }
      }
    }
  }

  /**
   * Get contact info for a specific chat (used for Kanban hydration)
   */
  private async getContactInfo(chatId: string): Promise<{ chatName?: string, chatPhoto?: string, labels?: any[] }> {
    try {
      const response = await this.requestFromContentScript({
        type: 'GET_CHAT_INFO',
        payload: { chatId }
      });

      return {
        chatName: response?.data?.chatName || response?.data?.name,
        chatPhoto: response?.data?.chatPhoto,
        labels: response?.data?.labels || []
      };
    } catch (error) {
      console.error('[PrinChat UI] Error fetching contact info:', error);
      return {};
    }
  }

  /**
   * Sanity Check: Detect and fix nested cards
   * Sometimes race conditions in manual DOM manipulation (drag events) can nest cards.
   * This flattens them back to siblings.
   */
  private fixNestedCards() {
    const nestedCards = document.querySelectorAll('.princhat-kanban-lead-card .princhat-kanban-lead-card');
    if (nestedCards.length > 0) {
      console.warn('[PrinChat UI] 🚨 Found', nestedCards.length, 'nested cards! Fixing...');
      nestedCards.forEach(card => {
        const parentCard = card.parentElement?.closest('.princhat-kanban-lead-card');
        const columnBody = card.closest('.princhat-kanban-column-body');

        if (parentCard && columnBody) {
          // Move the nested card OUT of the parent card, inserting it AFTER the parent
          parentCard.insertAdjacentElement('afterend', card);
          console.log('[PrinChat UI] 🔧 Fixed nested card:', card.getAttribute('data-lead-id'));
        }
      });
    }
  }


  /**
   * Create a column DOM element
   */
  private createColumnElement(column: any, leads: any[] = [], globalLabels: any[] = []): HTMLElement {
    const columnEl = document.createElement('div');
    columnEl.className = 'princhat-kanban-column';
    columnEl.setAttribute('data-column-id', column.id);
    columnEl.setAttribute('data-column-order', column.order.toString());

    const inboxTag = column.isDefault ? '<span class="princhat-kanban-inbox-tag">Inbox</span>' : '';

    columnEl.innerHTML = `
      <div class="princhat-kanban-column-header" style="border-top: 3px solid ${column.color};">
        <button class="princhat-kanban-column-drag" title="Arrastar coluna" ${!column.canEdit ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v20"/>
            <path d="m15 19-3 3-3-3"/>
            <path d="m19 9 3 3-3 3"/>
            <path d="M2 12h20"/>
            <path d="m5 9-3 3 3 3"/>
            <path d="m9 5 3-3 3 3"/>
          </svg>
        </button>
        <h3>${column.name} ${inboxTag}</h3>
        ${column.description ? `
        <button class="princhat-kanban-info-btn" title="Ver descrição" data-column-id="${column.id}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="21" x2="3" y1="6" y2="6"/>
            <line x1="15" x2="3" y1="12" y2="12"/>
            <line x1="17" x2="3" y1="18" y2="18"/>
          </svg>
        </button>
        ` : ''}
        <span class="princhat-kanban-column-count">0</span>
        <button class="princhat-kanban-column-menu-btn" title="Opções da coluna" data-column-id="${column.id}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>
          </svg>
        </button>
      </div>
      <div class="princhat-kanban-column-body" data-column-id="${column.id}">

        ${leads.map((lead: any) => {
      // Check if name is an Instagram/Facebook ID (15+ digits)
      // IDs like 186083820216376@c.us or 186083820216376@lid should show "Lead"
      const isInstagramId = /^\d{15,}/.test(lead.name || '');
      const displayName = isInstagramId ? 'Lead' : (lead.name || 'Desconhecido');

      const safeName = this.escapeHtml(displayName);
      const safeMessage = this.escapeHtml(lead.lastMessage || '');
      const safeId = this.escapeHtml(lead.id || lead.leadId || '');

      // Fallback to updatedAt if lastMessageTime is missing (for legacy leads)
      const displayTime = lead.lastMessageTime || lead.updatedAt;

      return `
          <div class="princhat-kanban-lead-card" data-lead-id="${safeId}">
            <div class="princhat-kanban-lead-photo">
              ${lead.photo ?
          `<img src="${lead.photo}" alt="${safeName}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` :
          `<div class="princhat-kanban-lead-photo-placeholder">${(safeName.charAt(0) || '?').toUpperCase()}</div>`
        }
            </div>
            <div class="princhat-kanban-lead-info">
              <div class="princhat-kanban-lead-header">
                <h4 class="princhat-kanban-lead-name">${safeName}</h4>
                <div class="princhat-kanban-lead-time-badge">
                  ${displayTime ? `<span class="princhat-kanban-lead-time">${new Date(displayTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>` : ''}
                  ${lead.unreadCount && lead.unreadCount > 0 ? `<span class="princhat-kanban-lead-unread"${lead.unreadCount > 9 ? ' data-count="9+"' : ''}>${lead.unreadCount > 9 ? '9+' : lead.unreadCount}</span>` : ''}
                </div>
              </div>
              ${safeMessage ? `<p class="princhat-kanban-lead-preview">${safeMessage.length > 50 ? safeMessage.substring(0, 50) + '...' : safeMessage}</p>` : ''}
              
              <!-- Tags -->
              ${lead.tags && lead.tags.length > 0 ? `
                <div class="princhat-kanban-lead-tags">
                  ${(() => {
            const firstTag = lead.tags[0];

            // LOOKUP STRATEGY: 
            // 1. Try to find by ID (if tag matches a label ID).
            // 2. Try to find by Name (case-insensitive).
            let labelInfo = globalLabels.find(l => l.id === firstTag || (l.name && l.name.toLowerCase() === firstTag.toLowerCase()));

            // Fallback: Check lead.labels (per-chat info) if global lookup failed
            if (!labelInfo && lead.labels) {
              labelInfo = lead.labels.find((l: any) =>
                String(l.id) === String(firstTag) ||
                l.name?.toLowerCase() === String(firstTag).toLowerCase()
              );
            }

            let labelColor = labelInfo?.color;
            let labelName = labelInfo?.name || firstTag;

            // CSS Logic:
            // User Feedback 3: 
            // - No Uppercase (Natural case)
            // - Text Color: Tag color + Brightness
            // SOLID COLOR LOGIC (Original Restoration)
            // Background: Solid Color from data
            // Text: Dark for contrast (Fixed)

            let finalBg = 'rgba(33, 150, 243, 0.30)'; // Fallback default
            let finalColor = '#2196f3';
            let textShadow = 'none';

            if (labelColor) {
              // Tag Color at 30% opacity (Legacy Style from Commit 9915674)
              finalBg = `color-mix(in srgb, ${labelColor} 30%, transparent)`;
              finalColor = labelColor;
              textShadow = 'none';
            }

            return `
            <span class="princhat-kanban-tag princhat-kanban-tag-unified" style="background-color: ${labelColor ? labelColor + '4D' : finalBg}; color: ${finalColor} !important; text-shadow: ${textShadow}; margin-right: 4px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                <line x1="7" x2="7.01" y1="7" y2="7"/>
              </svg>
              ${this.escapeHtml(labelName)}
            </span>
          `;
          })()}
                  
        ${lead.tags.length > 1 ? `<span class="princhat-kanban-tag-more princhat-no-drag princhat-kanban-tag-unified" style="cursor: pointer !important; pointer-events: auto !important; position: relative !important; z-index: 99 !important; background-color: rgba(158, 158, 158, 0.2) !important; color: #9e9e9e !important; " data-action="show-more-tags" data-tags="${encodeURIComponent(JSON.stringify(
            (() => {
              const remainingTags = lead.tags.slice(1);
              return remainingTags.map((tag: string) => {
                let info = globalLabels.find(l => l.id === tag || (l.name && l.name.toLowerCase() === tag.toLowerCase()));
                if (!info && lead.labels) info = lead.labels.find((l: any) => l.id === tag || (l.name && l.name.toLowerCase() === tag.toLowerCase()));

                return {
                  name: info?.name || tag,
                  color: info?.color || '#2196f3'
                };
              });
            })()
          ))}">+${lead.tags.length - 1}</span>` : ''}
      </div>
              ` : ''
        }
              
      <!-- Metadata - ALWAYS show icons, even with 0 count -->
      <div class="princhat-kanban-lead-meta">
        <div class="princhat-kanban-meta-item" title="${lead.notesCount || 0} nota${(lead.notesCount || 0) !== 1 ? 's' : ''}">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/>
            <path d="M2 6h4"/> <path d="M2 10h4"/> <path d="M2 14h4"/> <path d="M2 18h4"/>
            <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>
          </svg>
          <span>${lead.notesCount || 0}</span>
        </div>
        <div class="princhat-kanban-meta-item" title="${lead.schedulesCount || 0} agendamento${(lead.schedulesCount || 0) !== 1 ? 's' : ''}">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
            <line x1="16" x2="16" y1="2" y2="6"/>
            <line x1="8" x2="8" y1="2" y2="6"/>
            <line x1="3" x2="21" y1="10" y2="10"/>
          </svg>
          <span>${lead.schedulesCount || 0}</span>
        </div>
        <div class="princhat-kanban-meta-item" title="${lead.scriptsCount || 0} script${(lead.scriptsCount || 0) !== 1 ? 's' : ''}">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          <span>${lead.scriptsCount || 0}</span>
        </div>

        <!-- Spacer to push menu button to the right -->
        <div style="flex: 1;"></div>

        <!-- 3-dot menu button (on the right) -->
        <div class="princhat-kanban-meta-item princhat-kanban-card-menu-btn" title="Mais ações" data-lead-id="${lead.id}" data-chat-id="${lead.chatId}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/>
          </svg>
        </div>
      </div>
    </div>
  </div>`;
    }).join('')}
      </div>
    `;

    // Add click handler for menu button
    const menuBtn = columnEl.querySelector('.princhat-kanban-column-menu-btn') as HTMLElement;
    if (menuBtn) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showColumnMenu(menuBtn, column);
      });
    }

    // Add click handler for info button (description)
    const infoBtn = columnEl.querySelector('.princhat-kanban-info-btn') as HTMLElement;
    if (infoBtn && column.description) {
      infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showColumnDescription(infoBtn, column.description);
      });
    }

    // Add event listeners for tag expansion (+X counters)
    const tagMoreButtons = columnEl.querySelectorAll('.princhat-kanban-tag-more');
    tagMoreButtons.forEach((btn: Element) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tooltip = btn.nextElementSibling as HTMLElement;
        if (tooltip && tooltip.classList.contains('princhat-kanban-tags-tooltip')) {
          const wasActive = tooltip.classList.contains('active');

          // Close all tooltips
          document.querySelectorAll('.princhat-kanban-tags-tooltip.active').forEach((t) => {
            t.classList.remove('active');
          });

          // If it wasn't active, open it
          if (!wasActive) {
            // Move tooltip to body to escape stacking context
            document.body.appendChild(tooltip);

            // Make visible but hidden to measure height
            tooltip.style.visibility = 'hidden';
            tooltip.classList.add('active');

            // Calculate position ABOVE the button
            const rect = (btn as HTMLElement).getBoundingClientRect();
            const tooltipHeight = tooltip.offsetHeight;
            tooltip.style.position = 'fixed';
            tooltip.style.left = `${rect.left}px`;
            tooltip.style.top = `${rect.top - tooltipHeight - 8}px`; // Above the button

            // Now make visible
            tooltip.style.visibility = 'visible';

            // Click outside to close
            const clickOutside = (event: MouseEvent) => {
              const target = event.target as Node;
              if (!tooltip.contains(target) && !btn.contains(target)) {
                tooltip.classList.remove('active');
                // Move back to original location
                const tagsContainer = btn.parentElement;
                if (tagsContainer) {
                  tagsContainer.appendChild(tooltip);
                }
                document.removeEventListener('click', clickOutside);
              }
            };

            setTimeout(() => document.addEventListener('click', clickOutside), 10);
          }
        }
      });
    });

    // Drag listeners are now handled globally by setupGlobalKanbanListeners
    // No local listeners needed here

    // Add click handler to cards to open chat and reset unread count
    const cards = columnEl.querySelectorAll('.princhat-kanban-lead-card');
    cards.forEach((cardEl: Element) => {
      const leadId = (cardEl as HTMLElement).getAttribute('data-lead-id');
      if (leadId) {
        // Add click handler to the card (excluding buttons inside it)
        cardEl.addEventListener('click', async (e) => {
          // Don't trigger if clicking on buttons inside the card
          const target = e.target as HTMLElement;
          if (target.closest('.princhat-kanban-card-menu-btn') ||
            target.closest('.princhat-kanban-delete-btn') ||
            target.closest('.princhat-kanban-tag-more')) {
            return;
          }

          console.log('[PrinChat UI] Card clicked, opening chat:', leadId);

          /* 
          // REMOVED: Unread count should NOT clear on click, only on reply (User Request)
          try {
            await this.requestFromContentScript({
              type: 'UPDATE_KANBAN_LEAD',
              payload: {
                leadId: leadId,
                updates: { unreadCount: 0 }
              }
            });
  
            // Update UI immediately
            document.dispatchEvent(new CustomEvent('PrinChatKanbanLeadUpdated', {
              detail: {
                leadId: leadId,
                updates: { unreadCount: 0 }
              }
            }));
  
            console.log('[PrinChat UI] Unread count reset for lead:', leadId);
          } catch (err) {
            console.error('[PrinChat UI] Error resetting unread count:', err);
          }
          */
        });
      }
    });

    return columnEl;
  }

  /**
  /**
   * Setup GLOBAL drag listeners on the overlay to handle dynamic elements
   * This uses Event Delegation to ensure listeners persist even after DOM updates
   */
  /**
  * Destroy existing Sortable instances to prevent memory leaks and duplication
  */
  private destroySortables() {
    if (this.sortableInstances.length > 0) {
      console.log('[PrinChat] 🧹 Destroying', this.sortableInstances.length, 'SortableJS instances');
      this.sortableInstances.forEach(instance => {
        try {
          instance.destroy();
        } catch (e) {
          console.error('[PrinChat] Error destroying Sortable:', e);
        }
      });
      this.sortableInstances = [];
    }
    this.isSortableInitialized = false;
  }

  /**
   * Initialize SortableJS for drag and drop
   * This replaces manual drag listeners with a robust library solution
   */
  private initSortable(overlay: HTMLElement) {
    console.log('[PrinChat] Initializing SortableJS');

    const columns = overlay.querySelectorAll('.princhat-kanban-column-body');

    columns.forEach((column) => {
      const instance = new Sortable(column as HTMLElement, {
        group: 'kanban', // Allow dragging between lists
        animation: 150,  // Smooth animation
        ghostClass: 'princhat-kanban-ghost', // Class for the placeholder
        dragClass: 'princhat-kanban-drag',   // Class for the dragging item
        delay: 50, // Small delay to prevent accidental drags
        delayOnTouchOnly: true,
        filter: '.princhat-no-drag', // Disable dragging on specific elements
        preventOnFilter: false, // Allow clicks on filtered elements

        // Native Drag & Drop (Restored)

        onStart: () => {
          document.body.classList.add('kanban-is-dragging');
        },

        onEnd: async (evt) => {
          document.body.classList.remove('kanban-is-dragging');
          const itemEl = evt.item as HTMLElement;  // dragged HTMLElement
          const toEl = evt.to;      // target list
          // const fromEl = evt.from;  // previous list

          const leadId = itemEl.getAttribute('data-lead-id');
          const newColumnId = toEl.getAttribute('data-column-id');
          // const newIndex = evt.newIndex; // We won't trust single index, we re-index ALL

          console.log('[PrinChat] Sortable drop:', { leadId, to: newColumnId });

          if (leadId && newColumnId) {
            // CRITICAL FIX: Re-index ALL cards in the destination column to ensure valid order
            // This prevents "position reset" or "random sort" on reload due to duplicate indices

            const allCardsInCol = toEl.querySelectorAll('.princhat-kanban-lead-card');
            const updates: Promise<any>[] = [];

            console.log(`[PrinChat] Re-indexing ${allCardsInCol.length} cards in column ${newColumnId}...`);
            // Debug: Print the visual order (IDs)
            const visualOrderIds = Array.from(allCardsInCol).map(c => c.getAttribute('data-lead-id'));
            console.log('[PrinChat] Visual Order:', visualOrderIds);

            allCardsInCol.forEach((card, index) => {
              const cardId = (card as HTMLElement).getAttribute('data-lead-id');
              if (cardId) {
                // Log payload for debugging
                console.log(`[PrinChat] Queueing update: Lead ${cardId} -> Order ${index}`);
                // If it's the moved card, send MOVE (updates column + order)
                // If it's a sibling, send UPDATE (updates order only)
                // Actually, MOVE handles both efficiently if we just use it.
                // But let's use UPDATE_KANBAN_LEAD for siblings to avoid side effects?
                // Simpler: Send MOVE for the main one, and explicit ORDER update for others.

                // Optimized: 
                // 1. Move the dragged card first (to switch columns)
                // 2. Update order for everyone

                if (cardId === leadId) {
                  updates.push(this.requestFromContentScript({
                    type: 'MOVE_KANBAN_LEAD',
                    payload: {
                      leadId: cardId,
                      newColumnId, // Change column
                      newOrder: index // Set explicit index
                    }
                  }));
                } else {
                  // Just update order for siblings
                  updates.push(this.requestFromContentScript({
                    type: 'UPDATE_KANBAN_LEAD', // Use generic update for same-column reorder
                    payload: {
                      leadId: cardId,
                      updates: { order: index, columnId: newColumnId } // Ensure column consistency
                    }
                  }));
                }
              }
            });

            // Execute all updates
            try {
              await Promise.all(updates);
              console.log('[PrinChat] ✅ Re-indexing completed.');
            } catch (err) {
              console.error('[PrinChat] ❌ Error re-indexing column:', err);
            }
          }
        }
      });

      this.sortableInstances.push(instance);
    });

    // Still need the global delegate for DELETE button and other clicks
    this.setupGlobalClickListeners(overlay);
  }

  /**
   * Setup global click listeners (delegated)
   * Separated from Drag listeners since we used SortableJS for drags
   */
  private setupGlobalClickListeners(overlay: HTMLElement) {
    // CLICK - Delegated to Delete Button
    overlay.addEventListener('click', async (e: Event) => {
      // 1. Check Dropdown Item FIRST
      const dropdownItem = (e.target as HTMLElement).closest('.princhat-kanban-card-dropdown-item') as HTMLElement;
      if (dropdownItem) {
        e.preventDefault();
        e.stopPropagation();

        const action = dropdownItem.getAttribute('data-action');
        const chatId = dropdownItem.getAttribute('data-chat-id');
        const menuLeadId = dropdownItem.getAttribute('data-lead-id'); // Read explicit leadID

        console.log('[PrinChat] Dropdown action:', action, 'ChatID:', chatId, 'LeadID:', menuLeadId);

        // Close dropdown
        dropdownItem.closest('.princhat-kanban-card-dropdown')?.remove();

        switch (action) {
          case 'open-chat':
            if (chatId) {
              this.closeKanbanOverlay();
              await this.requestFromContentScript({
                type: 'NAVIGATE_TO_CHAT',
                payload: { chatId }
              });
            }
            break;

          case 'close-deal':
            if (chatId) {
              console.log('[PrinChat] Close deal for:', chatId);
              // TODO: Implement close deal logic
            }
            break;

          case 'delete-card':
            // Priority: Use explicit leadId from dropdown, fallback to DOM traversal
            let leadId = menuLeadId;
            let leadName = 'este card';
            let cardElement: HTMLElement | null = null;

            // Try to find DOM element for visual removal
            if (!leadId) {
              const card = dropdownItem.closest('.princhat-kanban-lead-card') as HTMLElement;
              if (card) {
                leadId = card.getAttribute('data-lead-id');
                leadName = card.querySelector('.princhat-kanban-lead-name')?.textContent || 'este card';
                cardElement = card;
              }
            } else {
              // Try to find card by ID if we have leadId but no direct DOM ancestry (rare)
              cardElement = overlay.querySelector(`.princhat-kanban-lead-card[data-lead-id="${leadId}"]`) as HTMLElement;
              if (cardElement) {
                leadName = cardElement.querySelector('.princhat-kanban-lead-name')?.textContent || 'este card';
              }
            }

            console.log('[PrinChat] Delete request for LeadID:', leadId);

            if (leadId) {
              if (window.confirm(`Tem certeza que deseja remover "${leadName}" do Kanban?`)) {
                console.log('[PrinChat] User confirmed deletion for:', leadId);

                // Visual removal
                if (cardElement) {
                  cardElement.style.transition = 'all 0.3s ease';
                  cardElement.style.opacity = '0';
                  cardElement.style.transform = 'scale(0.8)';
                  setTimeout(() => cardElement?.remove(), 300);
                }

                try {
                  await this.requestFromContentScript({
                    type: 'DELETE_KANBAN_LEAD',
                    payload: { leadId }
                  });
                  console.log('[PrinChat] Lead deleted successfully via API');
                } catch (error) {
                  console.error('[PrinChat] Error deleting lead:', error);
                }
              } else {
                console.log('[PrinChat] User cancelled deletion');
              }
            } else {
              console.error('[PrinChat] Could not identify Lead ID for deletion');
            }
            break;
        }
        return; // Stop processing
      }

      // 2. Check Menu Btn (The 3 dots wrapper)
      const menuBtn = (e.target as HTMLElement).closest('.princhat-kanban-card-menu-btn') as HTMLElement;
      if (menuBtn) {
        e.preventDefault();
        e.stopPropagation();

        // Close any other open dropdowns
        overlay.querySelectorAll('.princhat-kanban-card-dropdown').forEach(d => d.remove());
        // Remove active class from other cards
        overlay.querySelectorAll('.princhat-kanban-lead-card.active-menu').forEach(c => c.classList.remove('active-menu'));

        // Get info from button
        const chatId = menuBtn.getAttribute('data-chat-id');
        const leadId = menuBtn.getAttribute('data-lead-id');

        const card = menuBtn.closest('.princhat-kanban-lead-card');
        if (card) {
          card.classList.add('active-menu');
        }

        console.log('[PrinChat] Opening menu for Lead:', leadId, 'Chat:', chatId);

        // Create dropdown
        const dropdown = document.createElement('div');
        dropdown.className = 'princhat-kanban-card-dropdown';
        // Pass data-lead-id to the items!
        dropdown.innerHTML = `
          <div class="princhat-kanban-card-dropdown-item" data-action="open-chat" data-chat-id="${chatId}" data-lead-id="${leadId}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span>Abrir conversa</span>
          </div>
          <div class="princhat-kanban-card-dropdown-item" data-action="close-deal" data-chat-id="${chatId}" data-lead-id="${leadId}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" x2="12" y1="2" y2="22"/>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            <span>Faturar card</span>
          </div>
          <div class="princhat-kanban-card-dropdown-item" data-action="delete-card" data-chat-id="${chatId}" data-lead-id="${leadId}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Excluir card</span>
          </div>
        `;

        // Position dropdown
        menuBtn.style.position = 'relative';
        menuBtn.appendChild(dropdown);

        // Close dropdown when clicking outside
        setTimeout(() => {
          const closeDropdown = (event: MouseEvent) => {
            if (!dropdown.contains(event.target as Node)) {
              dropdown.remove();
              if (card) card.classList.remove('active-menu');
              document.removeEventListener('click', closeDropdown);
            }
          };
          document.addEventListener('click', closeDropdown);
        }, 0);

        return;
      }

      // 3. Check Delete Btn (Legacy/Backup)
      const deleteBtn = (e.target as HTMLElement).closest('.princhat-kanban-delete-btn') as HTMLElement;
      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();

        const card = deleteBtn.closest('.princhat-kanban-lead-card') as HTMLElement;
        if (!card) return;

        const leadId = card.getAttribute('data-lead-id');
        const leadName = card.querySelector('.princhat-kanban-lead-name')?.textContent || 'este card';

        if (window.confirm(`Tem certeza que deseja remover "${leadName}" do Kanban?`)) {
          console.log('[PrinChat] Deleting lead:', leadId);

          // Visual removal immediately
          card.style.transition = 'all 0.3s ease';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.8)';

          setTimeout(() => card.remove(), 300);

          if (leadId) {
            try {
              await this.requestFromContentScript({
                type: 'DELETE_KANBAN_LEAD',
                payload: { leadId }
              });
              console.log('[PrinChat] Lead deleted successfully');
            } catch (error) {
              console.error('[PrinChat] Error deleting lead:', error);
            }
          }
        }
      }
    });



    // CRITICAL: Stop propagation on MOUSE DOWN to prevent SortableJS from starting drag
    // This must use CAPTURE phase to run before Sortable's listeners
    this.kanbanOverlay?.addEventListener('mousedown', (e) => {
      const moreTagsBtn = (e.target as HTMLElement).closest('[data-action="show-more-tags"]') as HTMLElement;
      if (moreTagsBtn) {
        console.log('[PrinChat UI] Blocking drag on tag button (Capture Phase) & Opening Tooltip');
        e.stopPropagation(); // Stop SortableJS

        // --- TOOLTIP LOGIC START ---
        // Remove any existing tooltips first
        const existing = document.querySelector('.princhat-kanban-tags-tooltip');
        if (existing) existing.remove();

        const tagsJson = moreTagsBtn.getAttribute('data-tags');
        if (!tagsJson) return;

        try {
          const tagsOrLabels = JSON.parse(decodeURIComponent(tagsJson));
          if (!tagsOrLabels || !tagsOrLabels.length) return;

          // Create tooltip
          const tooltip = document.createElement('div');
          tooltip.className = 'princhat-kanban-tags-tooltip';

          // Apply styling IMMEDIATELLY (inline overrides)
          tooltip.style.zIndex = '100000'; // Higher than drag
          tooltip.style.backgroundColor = '#161818'; // Standard Dark Theme
          tooltip.style.border = '1px solid #3a3a3a';
          tooltip.style.borderRadius = '6px';
          tooltip.style.padding = '8px';
          tooltip.style.display = 'flex';
          tooltip.style.flexDirection = 'column';
          tooltip.style.alignItems = 'flex-start'; // Prevent tags from stretching
          tooltip.style.gap = '4px';
          tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
          tooltip.style.minWidth = '120px';

          // Make invisible for measurement
          tooltip.style.visibility = 'hidden';
          tooltip.style.position = 'fixed';

          tagsOrLabels.forEach((item: string | any) => {
            const tagEl = document.createElement('span');
            tagEl.className = 'princhat-kanban-tooltip-tag';
            // IMPORTANT: Force inherited font styles AND Unified Class
            tagEl.classList.add('princhat-kanban-tag');
            tagEl.classList.add('princhat-kanban-tag-unified');

            // Unify structure
            const isObject = typeof item === 'object' && item !== null;
            const tagName = isObject ? item.name : item;

            // SOLID COLOR LOGIC (Dynamic)
            let baseColor = isObject && item.color ? item.color : '#2196f3';

            // Background: 30% opacity
            const bgColor = this.adjustColorOpacity(baseColor, 0.30);

            // Text: Solid Color
            const textColor = baseColor;

            const textShadow = 'none';

            tagEl.style.backgroundColor = bgColor;
            tagEl.style.color = textColor;
            tagEl.style.setProperty('color', textColor, 'important');
            tagEl.style.textShadow = textShadow;

            // Removed inline styles that are covered by .princhat-kanban-tag-unified
            // tagEl.style.textTransform = 'none';
            // tagEl.style.fontWeight...
            // tagEl.style.fontSize...
            // tagEl.style.padding...
            // tagEl.style.borderRadius...

            tagEl.style.border = 'none';

            // Flex layout
            tagEl.style.display = 'flex';
            tagEl.style.alignItems = 'center';
            tagEl.style.gap = '4px';
            tagEl.style.letterSpacing = '0.3px';
            tagEl.style.whiteSpace = 'nowrap';

            tagEl.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                  <line x1="7" x2="7.01" y1="7" y2="7"/>
                </svg>
                ${tagName}
            `;

            tooltip.appendChild(tagEl);
          });

          document.body.appendChild(tooltip);

          // Position Logic (Now that content is in DOM)
          const rect = moreTagsBtn.getBoundingClientRect();
          const tooltipHeight = tooltip.offsetHeight;

          // Align ABOVE the button
          tooltip.style.top = `${rect.top - tooltipHeight - 8}px`;
          tooltip.style.left = `${rect.left}px`;

          // Show it
          tooltip.style.visibility = 'visible';
          tooltip.classList.add('active'); // For compatibility

          // Tag styling via injected stylesheet to scope it
          const styleId = 'princhat-tags-tooltip-style';
          if (!document.getElementById(styleId)) {
            const styleSheet = document.createElement('style');
            styleSheet.id = styleId;
            styleSheet.textContent = `
              .princhat - kanban - tooltip - tag {
              background: rgba(33, 150, 243, 0.15);
              color: #2196f3;
              padding: 4px 8px;
              border - radius: 4px;
              font - size: 12px;
              white - space: nowrap;
              border - radius: 4px;
              font - size: 12px;
              white - space: nowrap;
              /* text-transform: uppercase removed based on user feedback */
            }
            `;
            document.head.appendChild(styleSheet);
          }

          // Close on click outside
          setTimeout(() => {
            const closeTooltip = (ev: MouseEvent) => {
              if (!tooltip.contains(ev.target as Node) && ev.target !== moreTagsBtn) {
                tooltip.remove();
                document.removeEventListener('click', closeTooltip);
              }
            };
            document.addEventListener('click', closeTooltip);
          }, 100); // Increased timeout slightly to avoid immediate close

        } catch (err) {
          console.error('Error parsing tags data:', err);
        }
        // --- TOOLTIP LOGIC END ---
      }
    }, { capture: true });

  }

  /**
   * Setup drag and drop for column reordering
   * Refactored to use SortableJS to avoid conflicts with card dragging
   */
  private setupColumnDragAndDrop() {
    const container = this.kanbanOverlay?.querySelector('.princhat-kanban-columns-container');
    if (!container) return;

    console.log('[PrinChat] Initializing SortableJS for Columns');

    new Sortable(container as HTMLElement, {
      animation: 150,
      handle: '.princhat-kanban-column-drag', // Drag handle selector within list items
      draggable: '.princhat-kanban-column',   // Specifies which items inside the element should be draggable
      ghostClass: 'princhat-kanban-ghost',
      dragClass: 'princhat-kanban-drag',
      direction: 'horizontal',

      onEnd: (evt) => {
        const itemEl = evt.item;
        const newIndex = evt.newIndex;
        const columnId = itemEl.getAttribute('data-column-id');

        // The 'newIndex' from Sortable is 0-based index in the DOM list
        console.log('[PrinChat] Column reordered:', { columnId, newIndex });

        if (columnId && newIndex !== undefined) {
          this.requestFromContentScript({
            type: 'UPDATE_COLUMN_ORDER',
            payload: { columnId, newOrder: newIndex }
          }).catch(err => console.error('[PrinChat] Error reordering column:', err));
        }
      }
    });
  }

  /**
   * Show column menu dropdown
   */
  private showColumnMenu(button: HTMLElement, column: any) {
    // Remove any existing menu
    const existingMenu = document.querySelector('.princhat-kanban-column-menu');
    if (existingMenu) existingMenu.remove();

    // Create menu
    const menu = document.createElement('div');
    menu.className = 'princhat-kanban-column-menu';

    const editOption = column.canEdit ? `
      <button class="princhat-kanban-menu-item" data-action="edit">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Editar coluna
      </button>
    ` : '';

    const deleteOption = column.canDelete ? `
      <button class="princhat-kanban-menu-item princhat-kanban-menu-item-danger" data-action="delete">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        Deletar coluna
      </button>
    ` : '';

    menu.innerHTML = `
      ${editOption}
      ${deleteOption}
      ${!editOption && !deleteOption ? '<p style="padding: 8px 12px; color: #94a3b8;">Coluna padrão não editável</p>' : ''}
    `;

    // Position menu
    const rect = button.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left - 150}px`; // Align to right of button

    document.body.appendChild(menu);

    // Add click handlers
    const editBtn = menu.querySelector('[data-action="edit"]');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        menu.remove();
        this.showEditColumnModal(column);
      });
    }

    const deleteBtn = menu.querySelector('[data-action="delete"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        menu.remove();
        this.showDeleteColumnConfirmation(column);
      });
    }

    // Close menu when clicking outside
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node) && e.target !== button) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  /**
   * Show column description tooltip
   */
  private showColumnDescription(button: HTMLElement, description: string) {
    // Remove any existing tooltip
    const existingTooltip = document.querySelector('.princhat-kanban-description-tooltip');
    if (existingTooltip) existingTooltip.remove();

    const tooltip = document.createElement('div');
    tooltip.className = 'princhat-kanban-description-tooltip';
    tooltip.textContent = description;

    document.body.appendChild(tooltip);

    const buttonRect = button.getBoundingClientRect();
    tooltip.style.top = `${buttonRect.bottom + 8}px`;
    tooltip.style.left = `${buttonRect.left + (buttonRect.width / 2)}px`;
    tooltip.style.transform = 'translateX(-50%)';

    // Close tooltip when clicking outside
    const closeTooltip = (e: MouseEvent) => {
      if (!tooltip.contains(e.target as Node) && e.target !== button) {
        tooltip.remove();
        document.removeEventListener('click', closeTooltip);
      }
    };
    setTimeout(() => document.addEventListener('click', closeTooltip), 0);
  }

  /**
   * Show edit column modal
   */
  private showEditColumnModal(column: any) {
    // Remove existing modal
    const existingModal = document.querySelector('.princhat-kanban-edit-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'princhat-kanban-modal-overlay';

    modal.innerHTML = `
      <div class="princhat-kanban-edit-modal">
        <h2>Editar Coluna</h2>
        <div class="princhat-kanban-modal-body">
          <div class="princhat-kanban-form-group">
            <label>Nome da Coluna</label>
            <input type="text" class="princhat-kanban-input" id="column-name" value="${column.name}" />
          </div>
          <div class="princhat-kanban-form-group">
            <label>Cor</label>
            <div class="princhat-kanban-color-picker-wrapper">
              <input type="color" class="princhat-kanban-color-input" id="column-color" value="${column.color}" />
              <div class="princhat-kanban-color-preview">
                <div class="princhat-kanban-color-swatch" style="background-color: ${column.color};"></div>
                <span class="princhat-kanban-color-value">${column.color}</span>
              </div>
            </div>
          </div>
          <div class="princhat-kanban-form-group">
            <label>Descrição (Opcional)</label>
            <textarea class="princhat-kanban-textarea" id="column-description" placeholder="Descreva o propósito desta coluna..." rows="3">${column.description || ''}</textarea>
          </div>
        </div>
        <div class="princhat-kanban-modal-footer">
          <button class="princhat-kanban-btn princhat-kanban-btn-secondary" data-action="cancel">Cancelar</button>
          <button class="princhat-kanban-btn princhat-kanban-btn-primary" data-action="save">Salvar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Update color preview in real-time
    const colorInput = modal.querySelector('#column-color') as HTMLInputElement;
    const colorSwatch = modal.querySelector('.princhat-kanban-color-swatch') as HTMLElement;
    const colorValue = modal.querySelector('.princhat-kanban-color-value') as HTMLElement;

    colorInput?.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      if (colorSwatch) colorSwatch.style.backgroundColor = color;
      if (colorValue) colorValue.textContent = color;
    });

    // Handle cancel
    const cancelBtn = modal.querySelector('[data-action="cancel"]');
    cancelBtn?.addEventListener('click', () => modal.remove());

    // Handle save
    const saveBtn = modal.querySelector('[data-action="save"]');
    saveBtn?.addEventListener('click', async () => {
      const nameInput = modal.querySelector('#column-name') as HTMLInputElement;
      const colorInput = modal.querySelector('#column-color') as HTMLInputElement;
      const descriptionInput = modal.querySelector('#column-description') as HTMLTextAreaElement;

      const name = nameInput.value.trim();
      const color = colorInput.value;
      const description = descriptionInput.value.trim() || undefined;

      if (!name) {
        alert('Nome da coluna é obrigatório');
        return;
      }

      try {
        await this.requestFromContentScript({
          type: 'UPDATE_KANBAN_COLUMN',
          payload: { id: column.id, updates: { name, color, description } }
        });

        modal.remove();
        await this.renderKanbanColumns();
      } catch (error: any) {
        alert(error.message || 'Erro ao atualizar coluna');
      }
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  /**
   * Show delete column confirmation
   */
  private showDeleteColumnConfirmation(column: any) {
    const modal = document.createElement('div');
    modal.className = 'princhat-kanban-modal-overlay';

    modal.innerHTML = `
      <div class="princhat-kanban-edit-modal">
        <h2>Deletar Coluna</h2>
        <div class="princhat-kanban-modal-body">
          <p>Tem certeza que deseja deletar a coluna "${column.name}"?</p>
          <p style="color: #f59e0b; margin-top: 8px;">Esta ação não pode ser desfeita.</p>
        </div>
        <div class="princhat-kanban-modal-footer">
          <button class="princhat-kanban-btn princhat-kanban-btn-secondary" data-action="cancel">Cancelar</button>
          <button class="princhat-kanban-btn princhat-kanban-btn-danger" data-action="delete">Deletar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Handle cancel
    const cancelBtn = modal.querySelector('[data-action="cancel"]');
    cancelBtn?.addEventListener('click', () => modal.remove());

    // Handle delete
    const deleteBtn = modal.querySelector('[data-action="delete"]');
    deleteBtn?.addEventListener('click', async () => {
      try {
        await this.requestFromContentScript({
          type: 'DELETE_KANBAN_COLUMN',
          payload: { id: column.id }
        });

        modal.remove();
        await this.renderKanbanColumns();
      } catch (error: any) {
        alert(error.message || 'Erro ao deletar coluna');
      }
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  /**
   * Show new column creation modal
   */
  private showNewColumnModal() {
    const modal = document.createElement('div');
    modal.className = 'princhat-kanban-modal-overlay';

    modal.innerHTML = `
      <div class="princhat-kanban-edit-modal">
        <h2>Nova Coluna</h2>
        <div class="princhat-kanban-modal-body">
          <div class="princhat-kanban-form-group">
            <label>Nome da Coluna</label>
            <input type="text" class="princhat-kanban-input" id="new-column-name" placeholder="Ex: Negociação" />
          </div>
          <div class="princhat-kanban-form-group">
            <label>Cor</label>
            <div class="princhat-kanban-color-picker-wrapper">
              <input type="color" class="princhat-kanban-color-input" id="new-column-color" value="#3b82f6" />
              <div class="princhat-kanban-color-preview">
                <div class="princhat-kanban-color-swatch" style="background-color: #3b82f6;"></div>
                <span class="princhat-kanban-color-value">#3b82f6</span>
              </div>
            </div>
          </div>
          <div class="princhat-kanban-form-group">
            <label>Descrição (Opcional)</label>
            <textarea class="princhat-kanban-textarea" id="new-column-description" placeholder="Descreva o propósito desta coluna..." rows="3"></textarea>
          </div>
        </div>
        <div class="princhat-kanban-modal-footer">
          <button class="princhat-kanban-btn princhat-kanban-btn-secondary" data-action="cancel">Cancelar</button>
          <button class="princhat-kanban-btn princhat-kanban-btn-primary" data-action="create">Criar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Auto-focus name input
    const nameInput = modal.querySelector('#new-column-name') as HTMLInputElement;
    setTimeout(() => nameInput?.focus(), 100);

    // Update color preview in real-time
    const colorInput = modal.querySelector('#new-column-color') as HTMLInputElement;
    const colorSwatch = modal.querySelector('.princhat-kanban-color-swatch') as HTMLElement;
    const colorValue = modal.querySelector('.princhat-kanban-color-value') as HTMLElement;

    colorInput?.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      if (colorSwatch) colorSwatch.style.backgroundColor = color;
      if (colorValue) colorValue.textContent = color;
    });

    // Handle cancel
    const cancelBtn = modal.querySelector('[data-action="cancel"]');
    cancelBtn?.addEventListener('click', () => modal.remove());

    // Handle create
    const createBtn = modal.querySelector('[data-action="create"]');
    createBtn?.addEventListener('click', async () => {
      const colorInput = modal.querySelector('#new-column-color') as HTMLInputElement;
      const descriptionInput = modal.querySelector('#new-column-description') as HTMLTextAreaElement;

      const name = nameInput.value.trim();
      const color = colorInput.value;
      const description = descriptionInput.value.trim() || undefined;

      if (!name) {
        alert('Nome da coluna é obrigatório');
        return;
      }

      try {
        await this.requestFromContentScript({
          type: 'CREATE_KANBAN_COLUMN',
          payload: { name, color, description }
        });

        modal.remove();
        await this.renderKanbanColumns();
      } catch (error: any) {
        alert(error.message || 'Erro ao criar coluna');
      }
    });

    // Handle enter key
    nameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        createBtn?.dispatchEvent(new Event('click'));
      }
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  /**
   * Listen for user interactions that imply navigation (Sidebar clicks)
   */
  private detectChatNavigation() {
    const side = document.querySelector('#side');
    if (side) {
      side.addEventListener('click', () => {
        // User clicked sidebar -> Potential navigation
        // console.log('[PrinChat UI] Navigation detected (Sidebar click)');
        this.handleNavigationStart();
      }, { capture: true }); // Capture early
    }

    // Also listen for KeyDown (Alt+Tab or Arrow keys could switch chat)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // Potential navigation via keyboard
      }
    });
  }

  /**
   * Handle start of navigation: clear artifacts and prepare for switch
   */
  private handleNavigationStart() {
    // Cleanup global dropdowns
    document.querySelectorAll('.princhat-kanban-tags-tooltip, .princhat-kanban-card-dropdown').forEach(el => el.remove());
    document.querySelectorAll('.princhat-kanban-lead-card.active-menu').forEach(c => c.classList.remove('active-menu'));

    this.invalidateChatCache();
    this.setButtonsLoadingState(true);
  }

  /**
   * Wait for the Chat ID to change (polling)
   * This is crucial because UI updates BEFORE the Store updates active chat.
   */
  private async waitForChatIdChange(oldId: string | null, maxAttempts = 20): Promise<string | null> {
    let attempts = 0;

    return new Promise((resolve) => {
      const check = async () => {
        attempts++;
        // Force fetch current ID from store (bypassing our cache)
        this.invalidateChatCache();
        const newId = await this.getActiveChatId();

        // If ID is different and valid, WE ARE SYNCED
        // Also if oldId was null and we got a newId, that counts
        if (newId && newId !== oldId) {
          // console.log(`[PrinChat UI] Chat ID changed: ${ oldId } -> ${ newId } (Attempt ${ attempts })`);
          resolve(newId);
          return;
        }

        if (attempts >= maxAttempts) {
          // console.log('[PrinChat UI] Chat ID wait timeout - using last known:', newId);
          resolve(newId); // Return whatever we have
          return;
        }

        setTimeout(check, 100); // Poll every 100ms
      };
      check();
    });
  }

  /**
   * Helper to set buttons to loading state (hide badges)
   */
  /**
   * Calculate optimal text color (black or white) based on background color
   * Uses WCAG luminance formula for accessibility
   */
  private getContrastColor(hexColor: string): string {
    // Remove # if present
    const hex = hexColor.replace('#', '');

    // Convert to RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Calculate relative luminance (WCAG formula)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Return white for dark backgrounds, black for light backgrounds
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  }

  private setButtonsLoadingState(isLoading: boolean) {
    const notesBadge = document.querySelector('.notes-badge') as HTMLElement;
    if (notesBadge) notesBadge.style.opacity = isLoading ? '0.5' : '1';

    const scheduleBtn = document.querySelector('.princhat-schedule-button');
    if (scheduleBtn) scheduleBtn.classList.toggle('loading', isLoading);
  }

}

// Initialize when DOM is ready
// Singleton Guard to prevent multiple injections (common in WhatsApp Business iframes/updates)
if ((window as any).__PRINCHAT_UI_INSTANCE__) {
  console.log('[PrinChat UI] ⚠️ Instance already running, skipping duplicate initialization');
} else {
  const init = () => {
    // FRAME GUARD: Strict isolation to top frame only
    // WhatsApp Business uses iframes for tracking/tools, we must NOT run there.
    if (window.self !== window.top) {
      // console.log('[PrinChat UI] 🛑 Aborting init: Running in iframe');
      // console.log('[PrinChat UI] 🛑 Aborting init: Running in iframe');
      return;
    }

    // DOM LOCK (Matches across contexts if they share DOM)
    if (document.documentElement.getAttribute('data-princhat-loaded')) {
      console.log('[PrinChat UI] 🛑 DOM Lock found: Extension already loaded in this document.');
      return;
    }
    document.documentElement.setAttribute('data-princhat-loaded', 'true');

    // Double check inside init to be safe against race conditions
    if ((window as any).__PRINCHAT_UI_INSTANCE__) return;

    console.log('[PrinChat UI] 🚀 Initializing singleton instance');
    (window as any).__PRINCHAT_UI_INSTANCE__ = new WhatsAppUIOverlay();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

// Export for potential external access
(window as any).princhatUI = WhatsAppUIOverlay;
