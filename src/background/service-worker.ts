/**
 * Background Service Worker for PrinChat
 * Handles background tasks and message passing between components
 *
 * Architecture Decision:
 * - Uses Manifest V3 service workers (not persistent background pages)
 * - Coordinates communication between popup, options, and content scripts
 * - Handles trigger monitoring (future feature)
 */

import { db } from '../storage/db';
import { syncService } from '../services/sync-service';
import { sessionService } from '../services/session-service';

// Polyfill window for libraries that expect it (e.g. Supabase internals)
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  (self as any).window = self;
}

class BackgroundService {
  private injectedTabs = new Set<number>();
  private executingSchedules = new Set<string>(); // Track schedules currently executing

  constructor() {
    this.init();
  }

  private async init() {
    console.log('[PrinChat] Background service worker initialized');
    console.log('[PrinChat] Current time:', new Date().toISOString());

    // Listen for extension installation
    chrome.runtime.onInstalled.addListener(this.handleInstalled.bind(this));

    // Listen for messages from popup/options/content
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));

    // Listen for alarms (ONLY ONCE during init)
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      // Handle schedule-specific alarms
      if (alarm.name.startsWith('schedule-')) {
        const scheduleId = alarm.name.replace('schedule-', '');
        console.log('[PrinChat] Alarm fired for schedule:', scheduleId);
        await this.executeSchedule(scheduleId);
      }
    });

    // Clean up when tabs are closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      console.log('[PrinChat] Tab closed:', tabId);
      this.injectedTabs.delete(tabId);
    });

    // Initialize database
    await db.init();

    // Trigger initial sync (non-blocking)
    syncService.fetchAndSyncInitialData().catch(console.error);
    sessionService.start().catch(console.error);

    // Set up schedule checker alarm (every minute)
    await this.setupScheduleChecker();

    // Set up triggers monitoring (if enabled)
    // This is a beta feature and will be implemented in future versions
    // await this.setupTriggersMonitoring();

    console.log('[PrinChat] Initialization complete');
  }

  /**
   * Handle extension installation or update
   */
  private async handleInstalled(details: chrome.runtime.InstalledDetails) {
    if (details.reason === 'install') {
      console.log('[PrinChat] Extension installed');

      // Open options page on first install
      chrome.runtime.openOptionsPage();

      // Create sample data (optional)
      await this.createSampleData();
    } else if (details.reason === 'update') {
      console.log('[PrinChat] Extension updated to version', chrome.runtime.getManifest().version);
    }
  }

  private requireInstanceId(payload: any): string {
    const instanceId = payload?.instanceId;
    if (!instanceId || typeof instanceId !== 'string') {
      throw new Error('INSTANCE_REQUIRED: Missing instanceId in payload');
    }
    return instanceId;
  }

  private isLeadNotFoundError(error: any): boolean {
    const message = String(error?.message || error || '');
    return message.includes('Lead with id') && message.includes('not found');
  }

  /**
   * Handle messages from other parts of the extension
   */
  private handleMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ): boolean {
    console.log('[PrinChat] Service worker received message:', message.type, 'from tab:', sender.tab?.id);

    if (typeof message?.payload?.instanceId === 'string') {
      sessionService.setInstance(message.payload.instanceId);
      sessionService.verifyAndHeartbeat().catch((error) => {
        console.warn('[PrinChat Session] On-demand validation failed:', error);
      });
    }

    // Handle different message types
    switch (message.type) {
      case 'PING':
        sendResponse({ success: true, data: 'PONG' });
        break;

      case 'TRIGGER_MANUAL_SYNC':
        console.log('[PrinChat] Manual Sync requested by UI/Content Script');
        syncService.fetchAndSyncInitialData(message.payload?.instanceId)
          .then((result) => sendResponse({ success: true, result }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;

      case 'FORCE_INIT':
        console.log('[PrinChat] Force Init requested by UI');
        syncService.fetchAndSyncInitialData(message.payload?.instanceId)
          .then((result) => sendResponse({ success: true, result })) // Pass result object
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;

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

      case 'FETCH_MEDIA_BLOB':
        // Bypass CSP by fetching from background context
        if (message.payload && message.payload.url) {
          console.log('[PrinChat] Fetching media blob for CSP bypass:', message.payload.url);
          this.fetchMediaBlob(message.payload.url)
            .then((base64) => sendResponse({ success: true, base64 }))
            .catch((err) => {
              console.error('[PrinChat] Failed to fetch media blob:', err);
              sendResponse({ success: false, error: err.toString() });
            });
          return true; // Valid async response
        } else {
          sendResponse({ success: false, error: 'No URL provided' });
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

      case 'GET_SIGNATURES':
        db.getAllSignatures()
          .then((signatures) => sendResponse({ success: true, data: signatures }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;

      case 'SAVE_SIGNATURE':
        db.saveSignature(message.payload)
          .then(() => sendResponse({ success: true }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;

      case 'DELETE_SIGNATURE':
        db.deleteSignature(message.payload.id)
          .then(() => sendResponse({ success: true }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;

      case 'GET_SIGNATURE':
        db.getSignature(message.payload.id)
          .then((signature) => sendResponse({ success: true, data: signature }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;

      case 'SET_ACTIVE_SIGNATURE':
        (async () => {
          try {
            console.log('[PrinChat SW] Setting active signature:', message.payload);
            await db.setActiveSignature(message.payload.id);
            sendResponse({ success: true });
          } catch (error: any) {
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'TOGGLE_SIGNATURE_ACTIVE':
        (async () => {
          try {
            const { id, isActive } = message.payload;
            if (isActive) {
              await db.setActiveSignature(id);
            } else {
              const signature = await db.getSignature(id);
              if (signature) {
                await db.saveSignature({ ...signature, isActive: false, updatedAt: Date.now() });
              }
            }
            sendResponse({ success: true });
          } catch (error: any) {
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'GET_ACTIVE_SIGNATURE':
        console.log('[PrinChat SW] 🔍 GET_ACTIVE_SIGNATURE request received');
        db.getActiveSignature()
          .then((signature) => {
            console.log('[PrinChat SW] 🔍 Active signature from DB:', signature);
            sendResponse({ success: true, data: signature || null });
          })
          .catch((error) => {
            console.error('[PrinChat SW] ❌ Error getting active signature:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true;

      case 'GET_SCRIPT':
        // Content script needs to execute a script but can't access extension's IndexedDB
        // So we fetch it here and return the complete script with all message data
        this.getScriptWithMessages(message.payload.scriptId)
          .then((scriptData) => sendResponse({ success: true, data: scriptData }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response

      case 'SAVE_SCHEDULE':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            const schedulePayload = { ...message.payload, instanceId };
            await db.saveSchedule(schedulePayload);
            // Create a specific alarm for this schedule
            await this.createScheduleAlarm(schedulePayload);
            sendResponse({ success: true });
          } catch (error: any) {
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'GET_SCHEDULES_BY_CHAT':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            const schedules = await db.getSchedulesByChatId(message.payload.chatId, instanceId);
            sendResponse({ success: true, data: schedules });
          } catch (error: any) {
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'GET_ALL_SCHEDULES':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            const schedules = await db.getAllSchedules(instanceId);
            sendResponse({ success: true, data: schedules });
          } catch (error: any) {
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'DELETE_SCHEDULE':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            await db.deleteSchedule(message.payload.id, instanceId);
            // Cancel the alarm for this schedule
            const alarmName = `schedule-${message.payload.id}`;
            await chrome.alarms.clear(alarmName);
            console.log('[PrinChat] Canceled alarm:', alarmName);
            sendResponse({ success: true });
          } catch (error: any) {
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      // ==================== TAGS ====================
      case 'SAVE_TAG':
        db.saveTag(message.payload)
          .then(() => sendResponse({ success: true }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;

      case 'DELETE_TAG':
        db.deleteTag(message.payload.id)
          .then(() => sendResponse({ success: true }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;

      case 'UPDATE_SCHEDULE_STATUS':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            const { id, status } = message.payload;
            await db.updateScheduleStatus(id, status, instanceId);

            // If changing to paused, clear the alarm
            if (status === 'paused') {
              const alarmName = `schedule-${id}`;
              await chrome.alarms.clear(alarmName);
              console.log('[PrinChat] Paused schedule, cleared alarm:', alarmName);
            }

            // If changing from paused to pending, check if we need to send immediately or create new alarm
            if (status === 'pending') {
              const schedule = await db.getSchedule(id, instanceId);
              if (schedule) {
                const now = Date.now();
                if (schedule.scheduledTime <= now) {
                  // Time already passed - execute immediately
                  console.log('[PrinChat] Resuming expired schedule, executing immediately:', id);
                  await this.executeSchedule(id);
                } else {
                  // Time in future - create new alarm
                  console.log('[PrinChat] Resuming schedule, creating new alarm:', id);
                  await this.createScheduleAlarm(schedule);
                }
              }
            }

            sendResponse({ success: true });
          } catch (error: any) {
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;


      case 'CREATE_NOTE':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            const note = await db.createNote({ ...message.payload, instanceId });
            sendResponse({ success: true, data: note });
          } catch (error: any) {
            console.error('[Background] Error creating note:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'UPDATE_NOTE':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            await db.updateNote(message.payload.id, message.payload, instanceId);
            sendResponse({ success: true });
          } catch (error: any) {
            console.error('[Background] Error updating note:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'GET_NOTES_BY_CHAT':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            console.log('[Background] GET_NOTES_BY_CHAT handler called');
            console.log('[Background] Payload:', message.payload);
            console.log('[Background] ChatId:', message.payload.chatId);

            const notes = await db.getNotesByChatId(message.payload.chatId, instanceId);

            console.log('[Background] Notes retrieved:', notes);
            console.log('[Background] Notes count:', notes.length);

            sendResponse({ success: true, data: notes });
          } catch (error: any) {
            console.error('[Background] Error getting notes by chat:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'GET_NOTE':
        (async () => {
          try {
            const note = await db.getNote(message.payload.id, this.requireInstanceId(message.payload));
            sendResponse({ success: true, data: note });
          } catch (error: any) {
            console.error('[Background] Error getting note:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'DELETE_NOTE':
        (async () => {
          try {
            await db.deleteNote(message.payload.id, this.requireInstanceId(message.payload));
            sendResponse({ success: true });
          } catch (error: any) {
            console.error('[Background] Error deleting note:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'GET_ALL_NOTES':
        (async () => {
          try {
            console.log('[Background] GET_ALL_NOTES request received');
            const notes = await db.getAllNotes(this.requireInstanceId(message.payload));
            console.log('[Background] Fetched', notes.length, 'notes:', notes);
            sendResponse({ success: true, data: notes });
          } catch (error: any) {
            console.error('[Background] Error getting all notes:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      // ==================== KANBAN COLUMNS ====================
      case 'GET_KANBAN_COLUMNS':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            console.log('[Background] GET_KANBAN_COLUMNS request received');
            const columns = await db.getAllKanbanColumns(instanceId);
            console.log('[Background] Fetched', columns.length, 'columns');
            sendResponse({ success: true, data: columns });
          } catch (error: any) {
            console.error('[Background] Error getting Kanban columns:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'CREATE_KANBAN_COLUMN':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            console.log('[Background] CREATE_KANBAN_COLUMN request received:', message.payload);
            const { name, color, description } = message.payload;
            const column = await db.createKanbanColumn(name, color, description, instanceId);
            console.log('[Background] Column created:', column.id);
            sendResponse({ success: true, data: column });
          } catch (error: any) {
            console.error('[Background] Error creating Kanban column:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'UPDATE_KANBAN_COLUMN':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            console.log('[Background] UPDATE_KANBAN_COLUMN request received:', message.payload);
            const { id, updates } = message.payload;
            await db.updateKanbanColumn(id, updates, instanceId);
            console.log('[Background] Column updated:', id);
            sendResponse({ success: true });
          } catch (error: any) {
            console.error('[Background] Error updating Kanban column:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'DELETE_KANBAN_COLUMN':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            console.log('[Background] DELETE_KANBAN_COLUMN request received:', message.payload);
            const { id } = message.payload;
            await db.deleteKanbanColumn(id, instanceId);
            console.log('[Background] Column deleted:', id);
            sendResponse({ success: true });
          } catch (error: any) {
            console.error('[Background] Error deleting Kanban column:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'UPDATE_COLUMN_ORDER':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            console.log('[Background] UPDATE_COLUMN_ORDER request received:', message.payload);
            const { columnId, newOrder } = message.payload;
            await db.updateColumnOrder(columnId, newOrder, instanceId);
            console.log('[Background] Column order updated:', columnId, 'to', newOrder);
            sendResponse({ success: true });
          } catch (error: any) {
            console.error('[Background] Error updating column order:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'GET_ALL_KANBAN_LEADS':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            console.log('[Background] GET_ALL_KANBAN_LEADS request received');
            const leads = await db.getAllLeads(instanceId);
            console.log('[Background] Fetched', leads.length, 'leads');
            sendResponse({ success: true, data: leads });
          } catch (error: any) {
            console.error('[Background] Error getting Kanban leads:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'CREATE_KANBAN_LEAD':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            console.log('[Background] CREATE_KANBAN_LEAD request received:', message.payload);
            const lead = await db.createLead({ ...message.payload, instanceId });
            console.log('[Background] Lead created:', lead.id);
            sendResponse({ success: true, data: lead });
          } catch (error: any) {
            console.error('[Background] Error creating Kanban lead:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'UPDATE_KANBAN_LEAD':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            console.log('[Background] UPDATE_KANBAN_LEAD request received:', message.payload);
            const { leadId, updates } = message.payload;

            try {
              // Try exact match first
              await db.updateLead(leadId, updates, instanceId);
              console.log('[Background] Lead updated (exact match):', leadId);
              sendResponse({ success: true, data: { id: leadId } });
            } catch (err: any) {
              console.log('[Background] Exact update failed, trying ID variations...');

              // Try alternatives
              let altId = '';
              if (leadId.includes('@c.us')) {
                altId = leadId.replace('@c.us', '');
              } else if (leadId.includes('@g.us')) {
                altId = leadId.replace('@g.us', ''); // Unlikely for leads but possible
              } else {
                // If pure number, try adding suffix
                altId = `${leadId}@c.us`;
              }

              if (altId && altId !== leadId) {
                try {
                  await db.updateLead(altId, updates, instanceId);
                  console.log('[Background] Lead updated (alternative match):', altId);
                  sendResponse({ success: true, data: { id: altId } });
                  return;
                } catch (e2) {
                  // Both failed
                  throw err; // Throw original error
                }
              } else {
                throw err;
              }
            }
          } catch (error: any) {
            if (this.isLeadNotFoundError(error)) {
              console.debug(
                '[Background] UPDATE_KANBAN_LEAD stale state (lead not found):',
                error?.message || String(error)
              );
            } else {
              console.error('[Background] Error updating Kanban lead:',
                error?.name,
                error?.message
              );
            }
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'MOVE_KANBAN_LEAD':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            console.log('[Background] MOVE_KANBAN_LEAD request received:', message.payload);
            const { leadId, newColumnId, newOrder } = message.payload;
            await db.moveLead(leadId, newColumnId, newOrder, instanceId);
            console.log('[Background] Lead moved:', leadId);
            sendResponse({ success: true });
          } catch (error: any) {
            console.error('[Background] Error moving Kanban lead:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'DELETE_KANBAN_LEAD':
        (async () => {
          try {
            const instanceId = this.requireInstanceId(message.payload);
            console.log('[Background] DELETE_KANBAN_LEAD request received:', message.payload);
            const { leadId } = message.payload;
            await db.deleteLead(leadId, instanceId);
            console.log('[Background] Lead deleted:', leadId);
            sendResponse({ success: true });
          } catch (error: any) {
            console.error('[Background] Error deleting Kanban lead:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case 'OPEN_OPTIONS':
        // Open options page (from profile dropdown)
        chrome.runtime.openOptionsPage();
        sendResponse({ success: true });
        break;

      case 'AUTH_SUCCESS':
        // Handle authentication success from callback
        (async () => {
          try {
            console.log('[PrinChat SW] AUTH_SUCCESS received');
            const { accessToken, refreshToken } = message.data;

            // Save to storage
            await chrome.storage.sync.set({
              auth_session: {
                isAuthenticated: true,
                accessToken,
                refreshToken,
                timestamp: Date.now()
              }
            });

            console.log('[PrinChat SW] Session saved successfully');

            // Trigger initial sync
            syncService.fetchAndSyncInitialData().catch(console.error);
            sessionService.start().catch(console.error);

            sendResponse({ success: true });
          } catch (error: any) {
            console.error('[PrinChat SW] Error saving session:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

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
    console.log('[PrinChat] 🔧 Injecting loader script into tab:', tabId);

    // REMOVED: Prevention of multiple injections
    // This was blocking reinjection after page navigation/reload
    // The page script itself has guards to prevent duplicate execution

    try {
      // Inject the loader script which will load Store accessor and page script
      console.log('[PrinChat] 📥 Injecting script loader...');
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        files: ['content/script-loader.js']
      });

      console.log('[PrinChat] ✅ Loader script injected successfully into tab', tabId);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[PrinChat] ❌ Failed to inject loader into tab', tabId, ':', errorMessage, error);
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

      console.log('[PrinChat] Sample data created');
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[PrinChat] Error creating sample data:', errorMessage, error);
    }
  }

  /**
   * Check if incoming message matches any trigger and execute script
   */
  private async checkTriggersAndExecute(payload: any, tabId: number) {
    const { messageText, chatId } = payload;

    console.log('[PrinChat] Checking triggers for message:', messageText, 'from chat:', chatId);

    // Get all enabled triggers
    const allTriggers = await db.getAllTriggers();
    const enabledTriggers = allTriggers.filter(t => t.enabled);

    if (enabledTriggers.length === 0) {
      console.log('[PrinChat] No enabled triggers found');
      return;
    }

    // Check each trigger
    for (const trigger of enabledTriggers) {
      if (this.messageMatchesTrigger(messageText, trigger.conditions)) {
        console.log('[PrinChat] Trigger matched:', trigger.name);

        // Check if we should skip this trigger based on chat type
        const isGroup = chatId.includes('@g.us');
        const isContact = chatId.includes('@c.us');

        if (trigger.skipGroups && isGroup) {
          console.log('[PrinChat] Skipping trigger for group chat (skipGroups enabled)');
          continue;
        }

        if (trigger.skipContacts && isContact) {
          console.log('[PrinChat] Skipping trigger for contact chat (skipContacts enabled)');
          continue;
        }

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
          console.log('[PrinChat] Triggered script execution for trigger:', trigger.name, 'to chat:', chatId);
        }).catch((error: any) => {
          const errorMessage = error?.message || String(error);
          console.error('[PrinChat] Error executing triggered script:', errorMessage, error);
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
        // Don't copy media fields in spread - they'll become {} if null/undefined
        // Create clean message object without media data
        const processedMessage: any = {
          ...message,
          audioData: null,
          imageData: null,
          videoData: null,
          fileData: null,
          // Ensure fileName is preserved for file type
          fileName: message.fileName
        };

        // Convert Blob data to Base64 for transmission
        if (message.type === 'audio' && message.audioData instanceof Blob) {
          processedMessage.audioData = await this.blobToBase64(message.audioData);
        } else if (message.type === 'image' && message.imageData instanceof Blob) {
          processedMessage.imageData = await this.blobToBase64(message.imageData);
        } else if (message.type === 'video' && message.videoData instanceof Blob) {
          processedMessage.videoData = await this.blobToBase64(message.videoData);
        } else if (message.type === 'file') {
          console.log('[PrinChat SW] 🔍 Processing file message:', message.id);
          console.log('[PrinChat SW] 🔍 message.fileData type:', typeof message.fileData);
          console.log('[PrinChat SW] 🔍 message.fileData instanceof Blob:', message.fileData instanceof Blob);
          console.log('[PrinChat SW] 🔍 message.fileName:', message.fileName);

          if (message.fileData instanceof Blob) {
            console.log('[PrinChat SW] 🔍 Blob size:', message.fileData.size, 'type:', message.fileData.type);
            processedMessage.fileData = await this.blobToBase64(message.fileData);
            console.log('[PrinChat SW] 🔍 Converted to Base64, length:', processedMessage.fileData.length);
            console.log('[PrinChat SW] 🔍 Base64 starts with:', processedMessage.fileData.substring(0, 50));
            processedMessage.fileName = message.fileName || 'file';
          } else {
            console.warn('[PrinChat SW] ⚠️ fileData is NOT a Blob! Value:', message.fileData);
          }
        }

        return processedMessage;
      })
    );

    // Store large media data in chrome.storage.local temporarily
    // chrome.runtime.sendMessage has size limits and large Base64 strings get lost
    const tempMediaStorage: { [key: string]: string } = {};

    for (const msg of processedMessages) {
      if (msg.type === 'file' && msg.fileData && typeof msg.fileData === 'string' && msg.fileData.length > 100000) {
        const storageKey = `temp_file_${msg.id}`;
        tempMediaStorage[storageKey] = msg.fileData;
        msg.fileData = `__TEMP_STORAGE__:${storageKey}`;
      }
      if (msg.type === 'image' && msg.imageData && typeof msg.imageData === 'string' && msg.imageData.length > 100000) {
        const storageKey = `temp_image_${msg.id}`;
        tempMediaStorage[storageKey] = msg.imageData;
        msg.imageData = `__TEMP_STORAGE__:${storageKey}`;
      }
      if (msg.type === 'video' && msg.videoData && typeof msg.videoData === 'string' && msg.videoData.length > 100000) {
        const storageKey = `temp_video_${msg.id}`;
        tempMediaStorage[storageKey] = msg.videoData;
        msg.videoData = `__TEMP_STORAGE__:${storageKey}`;
      }
      if (msg.type === 'audio' && msg.audioData && typeof msg.audioData === 'string' && msg.audioData.length > 100000) {
        const storageKey = `temp_audio_${msg.id}`;
        tempMediaStorage[storageKey] = msg.audioData;
        msg.audioData = `__TEMP_STORAGE__:${storageKey}`;
      }
    }

    // Store all temp media data at once
    if (Object.keys(tempMediaStorage).length > 0) {
      await chrome.storage.local.set(tempMediaStorage);
    }

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
    console.log('[PrinChat] Service worker fetching script with messages:', scriptId);

    // Get the script
    const script = await db.getScript(scriptId);
    if (!script) {
      throw new Error(`Script ${scriptId} not found`);
    }

    console.log('[PrinChat] Script loaded:', script.name, 'with', script.steps.length, 'steps');

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
          caption: message.caption,
          showTyping: message.showTyping,
          showRecording: message.showRecording,
          sendDelay: message.sendDelay
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
        } else if (message.type === 'file') {
          if (message.fileData instanceof Blob) {
            messageData.fileData = await this.blobToBase64(message.fileData);
          } else if (message.fileData && typeof message.fileData === 'string') {
            messageData.fileData = message.fileData;
          }
          messageData.fileName = message.fileName || 'file';
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

    console.log('[PrinChat] Script prepared with', stepsWithMessages.length, 'steps containing message data');
    return result;
  }

  /**
   * Set up schedule checker alarm
   * Checks every minute for schedules that are due
   */
  private async setupScheduleChecker() {
    console.log('[PrinChat] Setting up schedule alarms...');

    // Create alarms for all existing pending schedules (skip paused ones)
    const pendingSchedules = await db.getAllPendingSchedules();
    console.log(`[PrinChat] Found ${pendingSchedules.length} pending schedules`);

    for (const schedule of pendingSchedules) {
      // Only create alarm if schedule is truly pending (not paused)
      if (schedule.status === 'pending') {
        await this.createScheduleAlarm(schedule);
      } else {
        console.log(`[PrinChat] Skipping ${schedule.status} schedule:`, schedule.id);
      }
    }

    console.log('[PrinChat] Schedule alarms created');
  }

  /**
   * Create a specific alarm for a schedule
   */
  private async createScheduleAlarm(schedule: any) {
    const alarmName = `schedule-${schedule.id}`;
    const now = Date.now();

    // Only create alarm if schedule is in the future
    if (schedule.scheduledTime > now) {
      console.log(`[PrinChat] Creating alarm for schedule ${schedule.id} at ${new Date(schedule.scheduledTime).toLocaleString()}`);

      chrome.alarms.create(alarmName, {
        when: schedule.scheduledTime
      });
    } else {
      console.log(`[PrinChat] Schedule ${schedule.id} is already due, executing immediately`);
      await this.executeSchedule(schedule.id);
    }
  }

  /**
   * Execute a single schedule by ID
   */
  private async executeSchedule(scheduleId: string) {
    try {
      console.log('[PrinChat] Executing schedule:', scheduleId);

      // Check if already executing (prevent race condition)
      if (this.executingSchedules.has(scheduleId)) {
        console.log('[PrinChat] ⚠️ Schedule already executing, skipping duplicate:', scheduleId);
        return;
      }

      // Mark as executing
      this.executingSchedules.add(scheduleId);

      // Get the schedule
      const schedule = await db.getSchedule(scheduleId);
      if (!schedule) {
        console.log('[PrinChat] Schedule not found:', scheduleId);
        this.executingSchedules.delete(scheduleId);
        return;
      }

      // Don't execute if paused or already processed
      if (schedule.status === 'paused') {
        console.log('[PrinChat] Schedule is paused, skipping execution:', scheduleId);
        this.executingSchedules.delete(scheduleId);
        return;
      }

      if (schedule.status !== 'pending') {
        console.log('[PrinChat] Schedule already processed:', scheduleId, 'status:', schedule.status);
        this.executingSchedules.delete(scheduleId);
        return;
      }

      // Mark as completed instead of deleting - so it appears in "Enviados" section
      await db.updateScheduleStatus(scheduleId, 'completed');
      console.log('[PrinChat] Schedule marked as completed:', scheduleId);

      // Clear the alarm immediately after deleting schedule
      const alarmName = `schedule-${scheduleId}`;
      await chrome.alarms.clear(alarmName);
      console.log('[PrinChat] Alarm cleared:', alarmName);

      // Find the WhatsApp tab
      const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      if (tabs.length === 0) {
        console.warn('[PrinChat] No WhatsApp tab found');
        await db.updateScheduleStatus(scheduleId, 'failed');
        return;
      }

      const tab = tabs[0];

      // Get the item (message or script)
      let item: any;
      if (schedule.type === 'message') {
        item = await db.getMessage(schedule.itemId);
      } else {
        item = await db.getScript(schedule.itemId);
      }

      if (!item) {
        console.warn('[PrinChat] Item not found for schedule:', scheduleId);
        await db.updateScheduleStatus(scheduleId, 'failed');
        return;
      }

      // Send execution request
      if (schedule.type === 'message') {
        await chrome.tabs.sendMessage(tab.id!, {
          type: 'SEND_SINGLE_MESSAGE',
          payload: {
            messageId: item.id,
            chatId: schedule.chatId
          }
        });
      } else {
        await chrome.tabs.sendMessage(tab.id!, {
          type: 'EXECUTE_SCRIPT',
          payload: {
            scriptId: item.id,
            chatId: schedule.chatId
          }
        });
      }

      console.log('[PrinChat] Schedule executed successfully:', scheduleId);

      // Notify content script
      console.log('[PrinChat] 📨 Attempting to send SCHEDULE_EXECUTED to tab:', tab.id);
      try {
        await chrome.tabs.sendMessage(tab.id!, {
          type: 'SCHEDULE_EXECUTED',
          payload: { scheduleId }
        });
        console.log('[PrinChat] ✅ SCHEDULE_EXECUTED message sent successfully');
      } catch (e) {
        console.error('[PrinChat] ❌ Failed to send SCHEDULE_EXECUTED:', e);
      }

    } catch (error) {
      console.error('[PrinChat] Error executing schedule:', scheduleId, error);
      await db.updateScheduleStatus(scheduleId, 'failed');
    } finally {
      // Always remove from executing set
      this.executingSchedules.delete(scheduleId);
      console.log('[PrinChat] Execution lock released for:', scheduleId);
    }
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
  //   console.log('[PrinChat] Triggers monitoring setup (feature in development)');
  // }
  /**
   * Fetch a URL and convert to Base64 Data URL
   * Used to bypass CSP in content scripts
   */
  private async fetchMediaBlob(url: string): Promise<string> {
    const WORKER_PROXY_URL = 'https://princhat-api.princhat.workers.dev/fetch-media';

    // Commercial Grade Solution: Use backend proxy to bypass CDN origin restrictions
    if (url.includes('.b-cdn.net')) {
      console.log('[PrinChat SW] Using Worker Proxy for:', url);
      const proxyUrl = `${WORKER_PROXY_URL}?url=${encodeURIComponent(url)}`;

      const response = await fetch(proxyUrl);
      if (!response.ok) {
        console.error('[PrinChat SW] Proxy fetch failed:', response.status);
        throw new Error(`Proxy fetch failed: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    // Direct fetch for other URLs (with no-referrer just in case)
    const response = await fetch(url, { referrerPolicy: 'no-referrer' });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); // FileReader works in SW in Chrome
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

// Initialize the background service
new BackgroundService();

// Export for potential testing
export default BackgroundService;
