/**
 * IndexedDB wrapper for PrinChat
 * Orchestrator — delegates to domain-specific stores
 *
 * Story 1.3: Modularizado — schema, init, migrations, e façade.
 * Stores individuais em src/storage/stores/
 * Utilitários de leads em src/storage/lead-utils.ts
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Message, Script, Trigger, Tag, Folder, Settings, Signature, Schedule, Note } from '@/types';
import type { KanbanColumn, LeadContact } from '../types/kanban';

// Store imports
import * as messagesStore from './stores/messages-store';
import * as scriptsStore from './stores/scripts-store';
import * as triggersStore from './stores/triggers-store';
import * as tagsStore from './stores/tags-store';
import * as foldersStore from './stores/folders-store';
import * as settingsStore from './stores/settings-store';
import * as signaturesStore from './stores/signatures-store';
import * as schedulesStore from './stores/schedules-store';
import * as notesStore from './stores/notes-store';
import * as kanbanColumnsStore from './stores/kanban-columns-store';
import * as kanbanLeadsStore from './stores/kanban-leads-store';

export interface PrinChatDB extends DBSchema {
  messages: {
    key: string;
    value: Message;
    indexes: { 'by-type': string; 'by-created': number };
  };
  scripts: {
    key: string;
    value: Script;
    indexes: { 'by-created': number };
  };
  triggers: {
    key: string;
    value: Trigger;
    indexes: { 'by-enabled': number; 'by-created': number };
  };
  tags: {
    key: string;
    value: Tag;
  };
  folders: {
    key: string;
    value: Folder;
    indexes: { 'by-created': number };
  };
  settings: {
    key: string;
    value: Settings;
  };
  signatures: {
    key: string;
    value: Signature;
    indexes: { 'by-active': number; 'by-created': number };
  };
  audioBlobs: {
    key: string;
    value: { messageId: string; blob: Blob; createdAt: number };
    indexes: { 'by-messageId': string };
  };
  imageBlobs: {
    key: string;
    value: { messageId: string; blob: Blob; createdAt: number };
    indexes: { 'by-messageId': string };
  };
  videoBlobs: {
    key: string;
    value: { messageId: string; blob: Blob; createdAt: number };
    indexes: { 'by-messageId': string };
  };
  fileBlobs: {
    key: string;
    value: { messageId: string; blob: Blob; fileName: string; createdAt: number };
    indexes: { 'by-messageId': string };
  };
  schedules: {
    key: string;
    value: Schedule;
    indexes: { 'by-chatId': string; 'by-status': string; 'by-scheduledTime': number };
  };
  notes: {
    key: string;
    value: Note;
    indexes: { 'by-chatId': string; 'by-created': number };
  };
  kanban_columns: {
    key: string;
    value: KanbanColumn;
    indexes: { 'by-order': number };
  };
  kanban_leads: {
    key: string;
    value: LeadContact;
    indexes: { 'by-columnId': string; 'by-order': number };
  };
}

class DatabaseService {
  private db: IDBPDatabase<PrinChatDB> | null = null;
  private readonly DB_NAME = 'princhat-db';
  private readonly DB_VERSION = 8;
  private kanbanInitLocks = new Map<string, Promise<void>>();
  private kanbanColumnNormalizationLocks = new Map<string, Promise<void>>();
  private leadNormalizationLocks = new Map<string, Promise<void>>();

  async init(): Promise<IDBPDatabase<PrinChatDB>> {
    console.log(`[PrinChat DB] Init called. DB: ${this.DB_NAME} v${this.DB_VERSION}`);
    if (this.db) {
      console.log('[PrinChat DB] Returning existing instance');
      return this.db;
    }

    console.log('[PrinChat DB] Opening Database...');
    this.db = await openDB<PrinChatDB>(this.DB_NAME, this.DB_VERSION, {
      upgrade(db, oldVersion, newVersion) {
        console.log(`[PrinChat DB] Upgrading from ${oldVersion} to ${newVersion}`);
        // Messages store
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('by-type', 'type');
          messageStore.createIndex('by-created', 'createdAt');
        }

        // Scripts store
        if (!db.objectStoreNames.contains('scripts')) {
          const scriptStore = db.createObjectStore('scripts', { keyPath: 'id' });
          scriptStore.createIndex('by-created', 'createdAt');
        }

        // Triggers store
        if (!db.objectStoreNames.contains('triggers')) {
          const triggerStore = db.createObjectStore('triggers', { keyPath: 'id' });
          triggerStore.createIndex('by-enabled', 'enabled');
          triggerStore.createIndex('by-created', 'createdAt');
        }

        // Tags store
        if (!db.objectStoreNames.contains('tags')) {
          db.createObjectStore('tags', { keyPath: 'id' });
        }

        // Folders store
        if (!db.objectStoreNames.contains('folders')) {
          const folderStore = db.createObjectStore('folders', { keyPath: 'id' });
          folderStore.createIndex('by-created', 'createdAt');
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Signatures store
        if (!db.objectStoreNames.contains('signatures')) {
          const signatureStore = db.createObjectStore('signatures', { keyPath: 'id' });
          signatureStore.createIndex('by-active', 'isActive');
          signatureStore.createIndex('by-created', 'createdAt');
        }

        // Audio blobs store
        if (!db.objectStoreNames.contains('audioBlobs')) {
          const audioBlobStore = db.createObjectStore('audioBlobs', { keyPath: 'messageId' });
          audioBlobStore.createIndex('by-messageId', 'messageId');
        }

        // Image blobs store
        if (!db.objectStoreNames.contains('imageBlobs')) {
          const imageBlobStore = db.createObjectStore('imageBlobs', { keyPath: 'messageId' });
          imageBlobStore.createIndex('by-messageId', 'messageId');
        }

        // Video blobs store
        if (!db.objectStoreNames.contains('videoBlobs')) {
          const videoBlobStore = db.createObjectStore('videoBlobs', { keyPath: 'messageId' });
          videoBlobStore.createIndex('by-messageId', 'messageId');
        }

        // File blobs store
        if (!db.objectStoreNames.contains('fileBlobs')) {
          const fileBlobStore = db.createObjectStore('fileBlobs', { keyPath: 'messageId' });
          fileBlobStore.createIndex('by-messageId', 'messageId');
        }

        // Schedules store
        if (!db.objectStoreNames.contains('schedules')) {
          const scheduleStore = db.createObjectStore('schedules', { keyPath: 'id' });
          scheduleStore.createIndex('by-chatId', 'chatId');
          scheduleStore.createIndex('by-status', 'status');
          scheduleStore.createIndex('by-scheduledTime', 'scheduledTime');
        }

        // Notes store
        if (!db.objectStoreNames.contains('notes')) {
          const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
          noteStore.createIndex('by-chatId', 'chatId');
          noteStore.createIndex('by-created', 'createdAt');
        }

        // Kanban columns store
        if (!db.objectStoreNames.contains('kanban_columns')) {
          const kanbanColumnsStore = db.createObjectStore('kanban_columns', { keyPath: 'id' });
          kanbanColumnsStore.createIndex('by-order', 'order');
        }

        // Kanban leads store
        if (!db.objectStoreNames.contains('kanban_leads')) {
          const kanbanLeadsStore = db.createObjectStore('kanban_leads', { keyPath: 'id' });
          kanbanLeadsStore.createIndex('by-columnId', 'columnId');
          kanbanLeadsStore.createIndex('by-order', 'order');
        }
      },
    });

    // Initialize default settings if not exists
    await this.initializeDefaults();

    return this.db;
  }

  private async initializeDefaults(): Promise<void> {
    const settings = await this.getSettings();
    if (!settings) {
      await this.saveSettings({
        storageType: 'local',
        autoBackup: false,
        defaultDelay: 2000,
        requireSendConfirmation: true,
        showShortcuts: true,
        showFloatingButton: true,
      });
    }
  }

  // ==================== MESSAGES ====================
  async saveMessage(message: Message): Promise<void> {
    const db = await this.init();
    return messagesStore.saveMessage(db, message);
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const db = await this.init();
    return messagesStore.getMessage(db, id);
  }

  async getAllMessages(): Promise<Message[]> {
    const db = await this.init();
    return messagesStore.getAllMessages(db);
  }

  async deleteMessage(id: string): Promise<void> {
    const db = await this.init();
    return messagesStore.deleteMessage(db, id);
  }

  async getMessagesByType(type: 'text' | 'audio' | 'image' | 'video'): Promise<Message[]> {
    const db = await this.init();
    return messagesStore.getMessagesByType(db, type);
  }

  // ==================== SCRIPTS ====================
  async saveScript(script: Script): Promise<void> {
    const db = await this.init();
    return scriptsStore.saveScript(db, script);
  }

  async getScript(id: string): Promise<Script | undefined> {
    const db = await this.init();
    return scriptsStore.getScript(db, id);
  }

  async getAllScripts(): Promise<Script[]> {
    const db = await this.init();
    return scriptsStore.getAllScripts(db);
  }

  async deleteScript(id: string): Promise<void> {
    const db = await this.init();
    return scriptsStore.deleteScript(db, id);
  }

  // ==================== TRIGGERS ====================
  async saveTrigger(trigger: Trigger): Promise<void> {
    const db = await this.init();
    return triggersStore.saveTrigger(db, trigger);
  }

  async getTrigger(id: string): Promise<Trigger | undefined> {
    const db = await this.init();
    return triggersStore.getTrigger(db, id);
  }

  async getAllTriggers(): Promise<Trigger[]> {
    const db = await this.init();
    return triggersStore.getAllTriggers(db);
  }

  async getEnabledTriggers(): Promise<Trigger[]> {
    const db = await this.init();
    return triggersStore.getEnabledTriggers(db);
  }

  async deleteTrigger(id: string): Promise<void> {
    const db = await this.init();
    return triggersStore.deleteTrigger(db, id);
  }

  // ==================== TAGS ====================
  async saveTag(tag: Tag): Promise<void> {
    const db = await this.init();
    return tagsStore.saveTag(db, tag);
  }

  async getTag(id: string): Promise<Tag | undefined> {
    const db = await this.init();
    return tagsStore.getTag(db, id);
  }

  async getAllTags(): Promise<Tag[]> {
    const db = await this.init();
    return tagsStore.getAllTags(db);
  }

  async deleteTag(id: string): Promise<void> {
    const db = await this.init();
    return tagsStore.deleteTag(db, id);
  }

  // ==================== FOLDERS ====================
  async saveFolder(folder: Folder): Promise<void> {
    const db = await this.init();
    return foldersStore.saveFolder(db, folder);
  }

  async getFolder(id: string): Promise<Folder | undefined> {
    const db = await this.init();
    return foldersStore.getFolder(db, id);
  }

  async getAllFolders(): Promise<Folder[]> {
    const db = await this.init();
    return foldersStore.getAllFolders(db);
  }

  async deleteFolder(id: string): Promise<void> {
    const db = await this.init();
    return foldersStore.deleteFolder(
      db,
      id,
      () => this.getAllMessages(),
      (msg) => this.saveMessage(msg)
    );
  }

  // ==================== SETTINGS ====================
  async saveSettings(settings: Settings): Promise<void> {
    const db = await this.init();
    return settingsStore.saveSettings(db, settings);
  }

  async getSettings(): Promise<Settings | undefined> {
    const db = await this.init();
    return settingsStore.getSettings(db);
  }

  // ==================== SIGNATURES ====================
  async saveSignature(signature: Signature): Promise<void> {
    const db = await this.init();
    return signaturesStore.saveSignature(db, signature);
  }

  async getAllSignatures(): Promise<Signature[]> {
    const db = await this.init();
    return signaturesStore.getAllSignatures(db);
  }

  async getSignature(id: string): Promise<Signature | undefined> {
    const db = await this.init();
    return signaturesStore.getSignature(db, id);
  }

  async getActiveSignature(): Promise<Signature | undefined> {
    const db = await this.init();
    return signaturesStore.getActiveSignature(db);
  }

  async setActiveSignature(id: string): Promise<void> {
    const db = await this.init();
    return signaturesStore.setActiveSignature(db, id);
  }

  async deleteSignature(id: string): Promise<void> {
    const db = await this.init();
    return signaturesStore.deleteSignature(db, id);
  }

  // ==================== SCHEDULES ====================
  async saveSchedule(schedule: Schedule): Promise<void> {
    const db = await this.init();
    return schedulesStore.saveSchedule(db, schedule);
  }

  async getSchedule(id: string, instanceId?: string): Promise<Schedule | undefined> {
    const db = await this.init();
    return schedulesStore.getSchedule(db, id, instanceId);
  }

  async getSchedulesByChatId(chatId: string, instanceId?: string): Promise<Schedule[]> {
    const db = await this.init();
    return schedulesStore.getSchedulesByChatId(db, chatId, instanceId);
  }

  async getPendingSchedules(instanceId?: string): Promise<Schedule[]> {
    const db = await this.init();
    return schedulesStore.getPendingSchedules(db, instanceId);
  }

  async getAllPendingSchedules(instanceId?: string): Promise<Schedule[]> {
    const db = await this.init();
    return schedulesStore.getAllPendingSchedules(db, instanceId);
  }

  async updateScheduleStatus(id: string, status: 'pending' | 'paused' | 'completed' | 'cancelled' | 'failed', instanceId?: string): Promise<void> {
    const db = await this.init();
    return schedulesStore.updateScheduleStatus(db, id, status, instanceId);
  }

  async getPausedSchedules(instanceId?: string): Promise<Schedule[]> {
    const db = await this.init();
    return schedulesStore.getPausedSchedules(db, instanceId);
  }

  async getAllSchedules(instanceId?: string): Promise<Schedule[]> {
    const db = await this.init();
    return schedulesStore.getAllSchedules(db, instanceId);
  }

  async deleteSchedule(id: string, instanceId?: string): Promise<void> {
    const db = await this.init();
    return schedulesStore.deleteSchedule(db, id, instanceId);
  }

  // ==================== NOTES ====================
  async createNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> {
    const db = await this.init();
    return notesStore.createNote(db, note);
  }

  async getNotesByChatId(chatId: string, instanceId?: string): Promise<Note[]> {
    const db = await this.init();
    return notesStore.getNotesByChatId(db, chatId, instanceId);
  }

  async getNote(id: string, instanceId?: string): Promise<Note | undefined> {
    const db = await this.init();
    return notesStore.getNote(db, id, instanceId);
  }

  async updateNote(id: string, updates: Partial<Omit<Note, 'id' | 'createdAt'>>, instanceId?: string): Promise<void> {
    const db = await this.init();
    return notesStore.updateNote(db, id, updates, instanceId);
  }

  async deleteNote(id: string, instanceId?: string): Promise<void> {
    const db = await this.init();
    return notesStore.deleteNote(db, id, instanceId);
  }

  async getAllNotes(instanceId?: string): Promise<Note[]> {
    const db = await this.init();
    return notesStore.getAllNotes(db, instanceId);
  }

  // ==================== KANBAN COLUMNS ====================
  async saveKanbanColumn(column: KanbanColumn): Promise<void> {
    const db = await this.init();
    return kanbanColumnsStore.saveKanbanColumn(db, column);
  }

  async getKanbanColumn(id: string, instanceId?: string): Promise<KanbanColumn | undefined> {
    const db = await this.init();
    return kanbanColumnsStore.getKanbanColumn(db, id, instanceId);
  }

  async getAllKanbanColumns(instanceId?: string): Promise<KanbanColumn[]> {
    const db = await this.init();
    return kanbanColumnsStore.getAllKanbanColumns(db, this.kanbanInitLocks, this.kanbanColumnNormalizationLocks, instanceId);
  }

  async deleteKanbanColumn(id: string, instanceId?: string): Promise<void> {
    const db = await this.init();
    return kanbanColumnsStore.deleteKanbanColumn(db, id, instanceId);
  }

  async updateColumnOrder(columnId: string, newOrder: number, instanceId?: string): Promise<void> {
    const db = await this.init();
    return kanbanColumnsStore.updateColumnOrder(db, this.kanbanInitLocks, this.kanbanColumnNormalizationLocks, columnId, newOrder, instanceId);
  }

  async createKanbanColumn(name: string, color: string, description?: string, instanceId?: string): Promise<KanbanColumn> {
    const db = await this.init();
    return kanbanColumnsStore.createKanbanColumn(db, this.kanbanInitLocks, this.kanbanColumnNormalizationLocks, name, color, description, instanceId);
  }

  async updateKanbanColumn(id: string, updates: { name?: string; color?: string }, instanceId?: string): Promise<void> {
    const db = await this.init();
    return kanbanColumnsStore.updateKanbanColumn(db, this.kanbanInitLocks, this.kanbanColumnNormalizationLocks, id, updates, instanceId);
  }

  // ==================== KANBAN LEADS ====================
  async createLead(lead: Omit<LeadContact, 'id' | 'createdAt' | 'updatedAt'>): Promise<LeadContact> {
    const db = await this.init();
    return kanbanLeadsStore.createLead(db, lead);
  }

  async saveLead(lead: LeadContact): Promise<void> {
    const db = await this.init();
    return kanbanLeadsStore.saveLead(db, lead);
  }

  async updateLead(id: string, updates: Partial<LeadContact>, instanceId?: string): Promise<void> {
    const db = await this.init();
    return kanbanLeadsStore.updateLead(db, id, updates, instanceId);
  }

  async getLead(id: string, instanceId?: string): Promise<LeadContact | undefined> {
    const db = await this.init();
    return kanbanLeadsStore.getLead(db, id, instanceId);
  }

  async getAllLeads(instanceId?: string): Promise<LeadContact[]> {
    const db = await this.init();
    return kanbanLeadsStore.getAllLeads(db, this.kanbanColumnNormalizationLocks, this.leadNormalizationLocks, instanceId);
  }

  async getLeadsByColumn(columnId: string, instanceId?: string): Promise<LeadContact[]> {
    const db = await this.init();
    return kanbanLeadsStore.getLeadsByColumn(db, this.kanbanColumnNormalizationLocks, this.leadNormalizationLocks, columnId, instanceId);
  }

  async moveLead(leadId: string, newColumnId: string, newOrder: number, instanceId?: string): Promise<void> {
    const db = await this.init();
    return kanbanLeadsStore.moveLead(db, leadId, newColumnId, newOrder, instanceId);
  }

  async deleteLead(id: string, instanceId?: string): Promise<void> {
    const db = await this.init();
    return kanbanLeadsStore.deleteLead(db, id, instanceId);
  }

  // ==================== UTILITY ====================
  async clearAll(): Promise<void> {
    const db = await this.init();
    await db.clear('messages');
    await db.clear('scripts');
    await db.clear('triggers');
    await db.clear('tags');
    await db.clear('folders');
    await db.clear('audioBlobs');
    await db.clear('imageBlobs');
    await db.clear('videoBlobs');
    // Don't clear settings
  }

  async exportData(): Promise<string> {
    const messages = await this.getAllMessages();
    const scripts = await this.getAllScripts();
    const triggers = await this.getAllTriggers();
    const tags = await this.getAllTags();
    const folders = await this.getAllFolders();
    const settings = await this.getSettings();

    // Convert blobs to base64 for export
    const messagesForExport = await Promise.all(
      messages.map(async (msg) => {
        const exportMsg: any = { ...msg };

        if (msg.audioData && msg.audioData instanceof Blob) {
          exportMsg.audioData = await this.blobToBase64(msg.audioData);
        }

        if (msg.imageData && msg.imageData instanceof Blob) {
          exportMsg.imageData = await this.blobToBase64(msg.imageData);
        }

        if (msg.videoData && msg.videoData instanceof Blob) {
          exportMsg.videoData = await this.blobToBase64(msg.videoData);
        }

        return exportMsg;
      })
    );

    return JSON.stringify({
      messages: messagesForExport,
      scripts,
      triggers,
      tags,
      folders,
      settings,
      exportedAt: Date.now(),
    }, null, 2);
  }

  async importData(jsonData: string): Promise<void> {
    const data = JSON.parse(jsonData);

    if (data.messages) {
      for (const msg of data.messages) {
        if (msg.audioData && typeof msg.audioData === 'string') {
          msg.audioData = await this.base64ToBlob(msg.audioData);
        }
        if (msg.imageData && typeof msg.imageData === 'string') {
          msg.imageData = await this.base64ToBlob(msg.imageData);
        }
        if (msg.videoData && typeof msg.videoData === 'string') {
          msg.videoData = await this.base64ToBlob(msg.videoData);
        }
        await this.saveMessage(msg);
      }
    }

    if (data.scripts) {
      for (const script of data.scripts) {
        await this.saveScript(script);
      }
    }

    if (data.triggers) {
      for (const trigger of data.triggers) {
        await this.saveTrigger(trigger);
      }
    }

    if (data.tags) {
      for (const tag of data.tags) {
        await this.saveTag(tag);
      }
    }

    if (data.folders) {
      for (const folder of data.folders) {
        await this.saveFolder(folder);
      }
    }
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async base64ToBlob(base64: string): Promise<Blob> {
    const response = await fetch(base64);
    return response.blob();
  }
}

// Export singleton instance
export const db = new DatabaseService();
