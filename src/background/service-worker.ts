/**
 * Background Service Worker for X1Flox
 * Handles background tasks and message passing between components
 *
 * Architecture Decision:
 * - Uses Manifest V3 service workers (not persistent background pages)
 * - Coordinates communication between popup, options, and content scripts
 * - Handles trigger monitoring (future feature)
 */

import { db } from '../storage/db';

class BackgroundService {
  private injectedTabs = new Set<number>();

  constructor() {
    this.init();
  }

  private async init() {
    console.log('[X1Flox] Background service worker initialized');
    console.log('[X1Flox] Current time:', new Date().toISOString());

    // Listen for extension installation
    chrome.runtime.onInstalled.addListener(this.handleInstalled.bind(this));

    // Listen for messages from popup/options/content
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));

    // Clean up when tabs are closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      console.log('[X1Flox] Tab closed:', tabId);
      this.injectedTabs.delete(tabId);
    });

    // Initialize database
    await db.init();

    // Set up triggers monitoring (if enabled)
    // This is a beta feature and will be implemented in future versions
    // await this.setupTriggersMonitoring();

    console.log('[X1Flox] Initialization complete');
  }

  /**
   * Handle extension installation or update
   */
  private async handleInstalled(details: chrome.runtime.InstalledDetails) {
    if (details.reason === 'install') {
      console.log('[X1Flox] Extension installed');

      // Open options page on first install
      chrome.runtime.openOptionsPage();

      // Create sample data (optional)
      await this.createSampleData();
    } else if (details.reason === 'update') {
      console.log('[X1Flox] Extension updated to version', chrome.runtime.getManifest().version);
    }
  }

  /**
   * Handle messages from other parts of the extension
   */
  private handleMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ): boolean {
    console.log('[X1Flox] Service worker received message:', message.type, 'from tab:', sender.tab?.id);

    // Handle different message types
    switch (message.type) {
      case 'PING':
        sendResponse({ success: true, data: 'PONG' });
        break;

      case 'INJECT_PAGE_SCRIPTS':
        // Content script is asking us to inject the page scripts
        if (sender.tab?.id) {
          this.injectPageScripts(sender.tab.id)
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
          return true; // Keep channel open for async response
        } else {
          sendResponse({ success: false, error: 'No tab ID available' });
        }
        break;

      case 'CHECK_TRIGGERS':
        // Check if incoming message matches any trigger
        if (sender.tab?.id) {
          this.checkTriggersAndExecute(message.payload, sender.tab.id)
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
          return true; // Keep channel open for async response
        } else {
          sendResponse({ success: false, error: 'No tab ID available' });
        }
        break;

      case 'GET_STORAGE_STATS':
        this.getStorageStats()
          .then((stats) => sendResponse({ success: true, data: stats }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response

      case 'GET_SCRIPTS_AND_MESSAGES':
        this.getScriptsAndMessages()
          .then((data) => sendResponse({ success: true, data }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response

      case 'GET_SETTINGS':
        db.getSettings()
          .then((settings) => sendResponse({ success: true, data: settings }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response

      case 'GET_SCRIPT':
        // Content script needs to execute a script but can't access extension's IndexedDB
        // So we fetch it here and return the complete script with all message data
        this.getScriptWithMessages(message.payload.scriptId)
          .then((scriptData) => sendResponse({ success: true, data: scriptData }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }

    return false;
  }

  /**
   * Inject loader script into a specific tab
   * The loader will then inject WPPConnect and page scripts via DOM
   */
  private async injectPageScripts(tabId: number) {
    console.log('[X1Flox] Injecting loader script into tab:', tabId);

    // Prevent multiple injections
    if (this.injectedTabs.has(tabId)) {
      console.log('[X1Flox] Tab', tabId, 'already injected, skipping');
      return;
    }

    try {
      // Inject the loader script which will load Store accessor and page script
      console.log('[X1Flox] Injecting script loader...');
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        files: ['content/script-loader.js']
      });

      // Mark tab as injected
      this.injectedTabs.add(tabId);
      console.log('[X1Flox] ✅ Loader script injected into tab', tabId);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[X1Flox] ❌ Failed to inject loader into tab', tabId, ':', errorMessage, error);
      throw error;
    }
  }

  /**
   * Create sample data on first install
   */
  private async createSampleData() {
    try {
      // Create a sample tag
      const sampleTag = {
        id: `tag-${Date.now()}`,
        name: 'Exemplo',
        color: '#10b981',
      };
      await db.saveTag(sampleTag);

      // Create a sample text message
      const sampleMessage = {
        id: `msg-${Date.now()}`,
        type: 'text' as const,
        content: 'Olá! Esta é uma mensagem de exemplo. Você pode editá-la ou excluí-la.',
        tags: [sampleTag.id],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.saveMessage(sampleMessage);

      console.log('[X1Flox] Sample data created');
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[X1Flox] Error creating sample data:', errorMessage, error);
    }
  }

  /**
   * Check if incoming message matches any trigger and execute script
   */
  private async checkTriggersAndExecute(payload: any, tabId: number) {
    const { messageText, chatId } = payload;

    console.log('[X1Flox] Checking triggers for message:', messageText, 'from chat:', chatId);

    // Get all enabled triggers
    const allTriggers = await db.getAllTriggers();
    const enabledTriggers = allTriggers.filter(t => t.enabled);

    if (enabledTriggers.length === 0) {
      console.log('[X1Flox] No enabled triggers found');
      return;
    }

    // Check each trigger
    for (const trigger of enabledTriggers) {
      if (this.messageMatchesTrigger(messageText, trigger.conditions)) {
        console.log('[X1Flox] Trigger matched:', trigger.name);

        // Send to content script to execute (fire-and-forget)
        // Don't await - this allows us to respond immediately to the original message
        // The script execution can take a long time (delays, animations, etc.)
        // and we don't want to keep the message channel open that long
        chrome.tabs.sendMessage(tabId, {
          type: 'EXECUTE_SCRIPT',
          payload: {
            scriptId: trigger.scriptId,
            chatId: chatId  // Chat that sent the triggering message
          }
        }).then(() => {
          console.log('[X1Flox] Triggered script execution for trigger:', trigger.name, 'to chat:', chatId);
        }).catch((error: any) => {
          const errorMessage = error?.message || String(error);
          console.error('[X1Flox] Error executing triggered script:', errorMessage, error);
        });

        // Only execute first matching trigger
        break;
      }
    }
  }

  /**
   * Check if message text matches trigger conditions
   */
  private messageMatchesTrigger(messageText: string, conditions: any[]): boolean {
    // All conditions must match (AND logic)
    return conditions.every(condition => {
      const text = condition.caseSensitive ? messageText : messageText.toLowerCase();
      const value = condition.caseSensitive ? condition.value : condition.value.toLowerCase();

      switch (condition.type) {
        case 'equals':
          return text === value;

        case 'contains':
          return text.includes(value);

        case 'starts_with':
          return text.startsWith(value);

        case 'ends_with':
          return text.endsWith(value);

        case 'regex':
          try {
            const regex = new RegExp(value, condition.caseSensitive ? '' : 'i');
            return regex.test(messageText);
          } catch {
            return false;
          }

        default:
          return false;
      }
    });
  }

  /**
   * Get storage statistics
   */
  private async getStorageStats() {
    const messages = await db.getAllMessages();
    const scripts = await db.getAllScripts();
    const triggers = await db.getAllTriggers();
    const tags = await db.getAllTags();

    return {
      messages: messages.length,
      scripts: scripts.length,
      triggers: triggers.length,
      tags: tags.length,
    };
  }

  /**
   * Get scripts and messages for UI overlay
   */
  private async getScriptsAndMessages() {
    const scripts = await db.getAllScripts();
    const messages = await db.getAllMessages();

    // Convert Blobs to Base64 before sending through chrome.runtime.sendMessage
    // Blobs cannot be serialized and become empty objects {}
    const processedMessages = await Promise.all(
      messages.map(async (message) => {
        const processedMessage: any = { ...message };

        // Convert Blob data to Base64 for transmission
        if (message.type === 'audio' && message.audioData instanceof Blob) {
          processedMessage.audioData = await this.blobToBase64(message.audioData);
        } else if (message.type === 'image' && message.imageData instanceof Blob) {
          processedMessage.imageData = await this.blobToBase64(message.imageData);
        } else if (message.type === 'video' && message.videoData instanceof Blob) {
          processedMessage.videoData = await this.blobToBase64(message.videoData);
        }

        return processedMessage;
      })
    );

    return {
      scripts,
      messages: processedMessages,
    };
  }

  /**
   * Convert Blob to Base64 string
   */
  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert blob to base64'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Get script with all message data embedded (for content script execution)
   * Content scripts can't access extension's IndexedDB due to origin isolation
   */
  private async getScriptWithMessages(scriptId: string): Promise<any> {
    console.log('[X1Flox] Service worker fetching script with messages:', scriptId);

    // Get the script
    const script = await db.getScript(scriptId);
    if (!script) {
      throw new Error(`Script ${scriptId} not found`);
    }

    console.log('[X1Flox] Script loaded:', script.name, 'with', script.steps.length, 'steps');

    // Get all messages
    const allMessages = await db.getAllMessages();

    // Build steps with embedded message data
    const stepsWithMessages = await Promise.all(
      script.steps.map(async (step) => {
        const message = allMessages.find(m => m.id === step.messageId);
        if (!message) {
          throw new Error(`Message ${step.messageId} not found`);
        }

        const messageData: any = {
          type: message.type,
          content: message.content,
          caption: message.caption
        };

        // Convert Blob data to Base64 for transmission
        if (message.type === 'audio' && message.audioData) {
          if (message.audioData instanceof Blob) {
            messageData.audioData = await this.blobToBase64(message.audioData);
          } else {
            messageData.audioData = message.audioData;
          }
          messageData.duration = message.duration;
        } else if (message.type === 'image' && message.imageData) {
          if (message.imageData instanceof Blob) {
            messageData.imageData = await this.blobToBase64(message.imageData);
          } else {
            messageData.imageData = message.imageData;
          }
        } else if (message.type === 'video' && message.videoData) {
          if (message.videoData instanceof Blob) {
            messageData.videoData = await this.blobToBase64(message.videoData);
          } else {
            messageData.videoData = message.videoData;
          }
        }

        return {
          message: messageData,
          delayAfter: step.delayAfter
        };
      })
    );

    const result = {
      id: script.id,
      name: script.name,
      steps: stepsWithMessages
    };

    console.log('[X1Flox] Script prepared with', stepsWithMessages.length, 'steps containing message data');
    return result;
  }


  /**
   * Set up triggers monitoring (Beta feature)
   * This would monitor incoming messages and trigger scripts based on conditions
   * Currently not implemented as it requires more complex WhatsApp Web integration
   */
  // Commented out for now - will be implemented in future versions
  // private async setupTriggersMonitoring() {
  //   // TODO: Implement triggers monitoring
  //   // This feature would require:
  //   // 1. Content script to monitor incoming messages
  //   // 2. Message passing to background to check trigger conditions
  //   // 3. Execution of scripts when triggers match
  //   // 4. User notification system
  //   console.log('[X1Flox] Triggers monitoring setup (feature in development)');
  // }
}

// Initialize the background service
new BackgroundService();

// Export for potential testing
export default BackgroundService;
