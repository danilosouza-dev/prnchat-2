/**
 * IndexedDB wrapper for PrinChat
 * Handles storage of messages (including audio blobs), scripts, triggers, and tags
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Message, Script, Trigger, Tag, Folder, Settings, Signature, Schedule, Note } from '@/types';

interface PrinChatDB extends DBSchema {
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
}

class DatabaseService {
  private db: IDBPDatabase<PrinChatDB> | null = null;
  private readonly DB_NAME = 'princhat-db';
  private readonly DB_VERSION = 7; // Updated to version 7 for notes support

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

        // Audio blobs store (separate for better performance)
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
          const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
          notesStore.createIndex('by-chatId', 'chatId');
          notesStore.createIndex('by-created', 'createdAt');
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
        defaultDelay: 2000, // 2 seconds default delay
        requireSendConfirmation: true, // Require two clicks to send messages
        showShortcuts: true, // Show shortcut bar in WhatsApp Web
        showFloatingButton: true, // Show floating action button in WhatsApp Web
      });
    }
  }

  // ==================== MESSAGES ====================
  async saveMessage(message: Message): Promise<void> {
    const db = await this.init();

    // If message has audio data (Blob), save it separately
    if (message.audioData && message.audioData instanceof Blob) {
      await db.put('audioBlobs', {
        messageId: message.id,
        blob: message.audioData,
        createdAt: Date.now(),
      });
    }

    // If message has image data (Blob), save it separately
    if (message.imageData && message.imageData instanceof Blob) {
      await db.put('imageBlobs', {
        messageId: message.id,
        blob: message.imageData,
        createdAt: Date.now(),
      });
    }

    // If message has video data (Blob), save it separately
    if (message.videoData && message.videoData instanceof Blob) {
      await db.put('videoBlobs', {
        messageId: message.id,
        blob: message.videoData,
        createdAt: Date.now(),
      });
    }

    // If message has file data (Blob), save it separately
    if (message.fileData && message.fileData instanceof Blob) {
      await db.put('fileBlobs', {
        messageId: message.id,
        blob: message.fileData,
        fileName: message.fileName || 'file',
        createdAt: Date.now(),
      });
    }

    // Don't store blobs in the message object (just references)
    const messageToSave = {
      ...message,
      audioData: null,
      imageData: null,
      videoData: null,
      fileData: null
    };
    await db.put('messages', messageToSave);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        messages: Date.now() // Use timestamp to ensure value changes
      });
    }
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const db = await this.init();
    const message = await db.get('messages', id);

    if (message) {
      // Retrieve audio blob if exists
      if (message.type === 'audio') {
        const audioData = await db.get('audioBlobs', id);
        if (audioData) {
          message.audioData = audioData.blob;
        }
      }

      // Retrieve image blob if exists
      if (message.type === 'image') {
        const imageData = await db.get('imageBlobs', id);
        if (imageData) {
          message.imageData = imageData.blob;
        }
      }

      // Retrieve video blob if exists
      if (message.type === 'video') {
        const videoData = await db.get('videoBlobs', id);
        if (videoData) {
          message.videoData = videoData.blob;
        }
      }

      // Retrieve file blob if exists
      if (message.type === 'file') {
        const fileData = await db.get('fileBlobs', id);
        if (fileData) {
          message.fileData = fileData.blob;
          message.fileName = fileData.fileName;
        }
      }
    }

    return message;
  }

  async getAllMessages(): Promise<Message[]> {
    const db = await this.init();
    console.log('[PrinChat DB] getAllMessages calling db.getAll...');
    const messages = await db.getAll('messages');
    console.log(`[PrinChat DB] getAllMessages raw count: ${messages.length}`);

    // Load media blobs for all message types
    const messagesWithMedia = await Promise.all(
      messages.map(async (msg) => {
        if (msg.type === 'audio') {
          const audioData = await db.get('audioBlobs', msg.id);
          if (audioData) {
            msg.audioData = audioData.blob;
          }
        }

        if (msg.type === 'image') {
          const imageData = await db.get('imageBlobs', msg.id);
          if (imageData) {
            msg.imageData = imageData.blob;
          }
        }

        if (msg.type === 'video') {
          const videoData = await db.get('videoBlobs', msg.id);
          if (videoData) {
            msg.videoData = videoData.blob;
          }
        }

        if (msg.type === 'file') {
          console.log('[PrinChat DB] 🔍 Loading file for message:', msg.id);
          const fileData = await db.get('fileBlobs', msg.id);
          console.log('[PrinChat DB] 🔍 fileData from IndexedDB:', fileData ? 'FOUND' : 'NOT FOUND');
          if (fileData) {
            console.log('[PrinChat DB] 🔍 fileData.blob type:', typeof fileData.blob);
            console.log('[PrinChat DB] 🔍 fileData.blob instanceof Blob:', fileData.blob instanceof Blob);
            console.log('[PrinChat DB] 🔍 fileData.blob size:', fileData.blob?.size);
            msg.fileData = fileData.blob;
            msg.fileName = fileData.fileName;
          } else {
            console.warn('[PrinChat DB] ⚠️ No file blob found for message:', msg.id, msg.name);
          }
        }

        return msg;
      })
    );

    return messagesWithMedia;
  }

  async deleteMessage(id: string): Promise<void> {
    const db = await this.init();
    await db.delete('messages', id);
    // Delete associated media blobs if they exist
    await db.delete('audioBlobs', id);
    await db.delete('imageBlobs', id);
    await db.delete('videoBlobs', id);
    await db.delete('fileBlobs', id);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        messages: Date.now() // Use timestamp to ensure value changes
      });
    }
  }

  async getMessagesByType(type: 'text' | 'audio' | 'image' | 'video'): Promise<Message[]> {
    const db = await this.init();
    const messages = await db.getAllFromIndex('messages', 'by-type', type);

    // Load media blobs for messages
    const messagesWithMedia = await Promise.all(
      messages.map(async (msg) => {
        if (msg.type === 'audio') {
          const audioData = await db.get('audioBlobs', msg.id);
          if (audioData) {
            msg.audioData = audioData.blob;
          }
        }

        if (msg.type === 'image') {
          const imageData = await db.get('imageBlobs', msg.id);
          if (imageData) {
            msg.imageData = imageData.blob;
          }
        }

        if (msg.type === 'video') {
          const videoData = await db.get('videoBlobs', msg.id);
          if (videoData) {
            msg.videoData = videoData.blob;
          }
        }

        return msg;
      })
    );

    return messagesWithMedia;
  }

  // ==================== SCRIPTS ====================
  async saveScript(script: Script): Promise<void> {
    const db = await this.init();
    await db.put('scripts', script);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        scripts: Date.now() // Use timestamp to ensure value changes
      });
    }
  }

  async getScript(id: string): Promise<Script | undefined> {
    const db = await this.init();
    return db.get('scripts', id);
  }

  async getAllScripts(): Promise<Script[]> {
    const db = await this.init();
    return db.getAll('scripts');
  }

  async deleteScript(id: string): Promise<void> {
    const db = await this.init();
    await db.delete('scripts', id);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        scripts: Date.now() // Use timestamp to ensure value changes
      });
    }
  }

  // ==================== TRIGGERS ====================
  async saveTrigger(trigger: Trigger): Promise<void> {
    const db = await this.init();
    await db.put('triggers', trigger);
  }

  async getTrigger(id: string): Promise<Trigger | undefined> {
    const db = await this.init();
    return db.get('triggers', id);
  }

  async getAllTriggers(): Promise<Trigger[]> {
    const db = await this.init();
    return db.getAll('triggers');
  }

  async getEnabledTriggers(): Promise<Trigger[]> {
    const db = await this.init();
    return db.getAllFromIndex('triggers', 'by-enabled', 1);
  }

  async deleteTrigger(id: string): Promise<void> {
    const db = await this.init();
    await db.delete('triggers', id);
  }

  // ==================== TAGS ====================
  async saveTag(tag: Tag): Promise<void> {
    const db = await this.init();
    await db.put('tags', tag);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        tags: Date.now() // Use timestamp to ensure value changes
      });
    }
  }

  async getTag(id: string): Promise<Tag | undefined> {
    const db = await this.init();
    return db.get('tags', id);
  }

  async getAllTags(): Promise<Tag[]> {
    const db = await this.init();
    return db.getAll('tags');
  }

  async deleteTag(id: string): Promise<void> {
    const db = await this.init();
    await db.delete('tags', id);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        tags: Date.now() // Use timestamp to ensure value changes
      });
    }
  }

  // ==================== FOLDERS ====================
  async saveFolder(folder: Folder): Promise<void> {
    const db = await this.init();
    await db.put('folders', folder);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        folders: Date.now() // Use timestamp to ensure value changes
      });
    }
  }

  async getFolder(id: string): Promise<Folder | undefined> {
    const db = await this.init();
    return db.get('folders', id);
  }

  async getAllFolders(): Promise<Folder[]> {
    const db = await this.init();
    return db.getAll('folders');
  }

  async deleteFolder(id: string): Promise<void> {
    const db = await this.init();
    await db.delete('folders', id);

    // Remove folderId from all messages that were in this folder
    const messages = await this.getAllMessages();
    const messagesInFolder = messages.filter(msg => msg.folderId === id);

    for (const msg of messagesInFolder) {
      await this.saveMessage({ ...msg, folderId: undefined });
    }

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        folders: Date.now() // Use timestamp to ensure value changes
      });
    }
  }

  // ==================== SETTINGS ====================
  async saveSettings(settings: Settings): Promise<void> {
    const db = await this.init();
    await db.put('settings', { key: 'app-settings', ...settings } as any);

    // Also save to chrome.storage.local to trigger onChanged listeners
    // This enables real-time updates across tabs and content scripts
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ settings });
    }
  }

  async getSettings(): Promise<Settings | undefined> {
    const db = await this.init();
    const result = await db.get('settings', 'app-settings');
    if (!result) return undefined;
    const { key, ...settings } = result as any;

    // Sync to chrome.storage.local if not already there
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const chromeSettings = await chrome.storage.local.get('settings');
      if (!chromeSettings.settings) {
        await chrome.storage.local.set({ settings });
      }
    }

    return settings as Settings;
  }

  // ==================== SIGNATURES ====================
  async saveSignature(signature: Signature): Promise<void> {
    const db = await this.init();
    await db.put('signatures', signature);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        signatures: Date.now() // Use timestamp to ensure value changes
      });
    }
  }

  async getAllSignatures(): Promise<Signature[]> {
    const db = await this.init();
    const signatures = await db.getAllFromIndex('signatures', 'by-created');
    return signatures.reverse(); // Most recent first
  }

  async getSignature(id: string): Promise<Signature | undefined> {
    const db = await this.init();
    return db.get('signatures', id);
  }

  async getActiveSignature(): Promise<Signature | undefined> {
    const db = await this.init();
    try {
      // Query by isActive index using boolean true (not number 1)
      const signatures = await db.getAllFromIndex('signatures', 'by-active', IDBKeyRange.only(true));
      return signatures[0]; // Return first active signature (should only be one)
    } catch (error) {
      // Fallback: get all and filter manually if index fails
      console.warn('[DB] Index query failed, falling back to manual filter:', error);
      const allSignatures = await db.getAll('signatures');
      return allSignatures.find(sig => sig.isActive === true);
    }
  }

  async setActiveSignature(id: string): Promise<void> {
    const db = await this.init();

    // Get all signatures
    const allSignatures = await this.getAllSignatures();

    // Deactivate all signatures
    for (const sig of allSignatures) {
      if (sig.isActive) {
        await db.put('signatures', { ...sig, isActive: false, updatedAt: Date.now() });
      }
    }

    // Activate the selected signature
    const targetSignature = await db.get('signatures', id);
    if (targetSignature) {
      await db.put('signatures', { ...targetSignature, isActive: true, updatedAt: Date.now() });
    }

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        signatures: Date.now()
      });
    }
  }

  async deleteSignature(id: string): Promise<void> {
    const db = await this.init();
    await db.delete('signatures', id);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        signatures: Date.now()
      });
    }
  }

  // ==================== SCHEDULES ====================
  async saveSchedule(schedule: Schedule): Promise<void> {
    const db = await this.init();
    await db.put('schedules', schedule);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        schedules: Date.now()
      });
    }
  }

  async getSchedule(id: string): Promise<Schedule | undefined> {
    const db = await this.init();
    return db.get('schedules', id);
  }

  async getSchedulesByChatId(chatId: string): Promise<Schedule[]> {
    const db = await this.init();
    const schedules = await db.getAllFromIndex('schedules', 'by-chatId', chatId);
    return schedules.sort((a, b) => a.scheduledTime - b.scheduledTime);
  }

  async getPendingSchedules(): Promise<Schedule[]> {
    const db = await this.init();
    const now = Date.now();
    const pendingSchedules = await db.getAllFromIndex('schedules', 'by-status', 'pending');

    // Filter to only return schedules that are due
    return pendingSchedules.filter(schedule => schedule.scheduledTime <= now)
      .sort((a, b) => a.scheduledTime - b.scheduledTime);
  }

  async getAllPendingSchedules(): Promise<Schedule[]> {
    const db = await this.init();
    return db.getAllFromIndex('schedules', 'by-status', 'pending');
  }

  async updateScheduleStatus(id: string, status: 'pending' | 'paused' | 'completed' | 'cancelled' | 'failed'): Promise<void> {
    const db = await this.init();
    const schedule = await db.get('schedules', id);

    if (schedule) {
      await db.put('schedules', {
        ...schedule,
        status,
        updatedAt: Date.now()
      });

      // Trigger chrome.storage change event
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
          schedules: Date.now()
        });
      }
    }
  }

  async getPausedSchedules(): Promise<Schedule[]> {
    const db = await this.init();
    return db.getAllFromIndex('schedules', 'by-status', 'paused');
  }

  async getAllSchedules(): Promise<Schedule[]> {
    const db = await this.init();
    const schedules = await db.getAll('schedules');
    // Sort by scheduled time
    return schedules.sort((a, b) => a.scheduledTime - b.scheduledTime);
  }

  async deleteSchedule(id: string): Promise<void> {
    const db = await this.init();
    await db.delete('schedules', id);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        schedules: Date.now()
      });
    }
  }

  // ==================== NOTES ====================
  async createNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> {
    const db = await this.init();
    const now = Date.now();

    const newNote: Note = {
      ...note,
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      createdAt: now,
      updatedAt: now,
    };

    await db.put('notes', newNote);
    console.log('[PrinChat DB] Note created:', newNote.id);

    // Trigger chrome.storage change event for real-time updates
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        notes: Date.now()
      });
    }

    return newNote;
  }

  async getNotesByChatId(chatId: string): Promise<Note[]> {
    console.log('[DB] getNotesByChatId called with chatId:', chatId);
    const db = await this.init();
    const notes = await db.getAllFromIndex('notes', 'by-chatId', chatId);
    console.log('[DB] getNotesByChatId found', notes.length, 'notes:', notes);
    // Sort by creation date descending (newest first)
    return notes.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getNote(id: string): Promise<Note | undefined> {
    const db = await this.init();
    return db.get('notes', id);
  }

  async updateNote(id: string, updates: Partial<Omit<Note, 'id' | 'createdAt'>>): Promise<void> {
    const db = await this.init();
    const existingNote = await db.get('notes', id);

    if (!existingNote) {
      throw new Error(`Note with id ${id} not found`);
    }

    const updatedNote: Note = {
      ...existingNote,
      ...updates,
      updatedAt: Date.now(),
    };

    await db.put('notes', updatedNote);
    console.log('[PrinChat DB] Note updated:', id);

    // Trigger chrome.storage change event for real-time updates
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        notes: Date.now()
      });
    }
  }

  async deleteNote(id: string): Promise<void> {
    const db = await this.init();
    await db.delete('notes', id);
    console.log('[PrinChat DB] Note deleted:', id);

    // Trigger chrome.storage change event for real-time updates
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        notes: Date.now()
      });
    }
  }

  async getAllNotes(): Promise<Note[]> {
    const db = await this.init();
    const notes = await db.getAll('notes');
    // Sort by creation date descending (newest first)
    return notes.sort((a, b) => b.createdAt - a.createdAt);
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

    // Import messages
    if (data.messages) {
      for (const msg of data.messages) {
        // Convert base64 back to Blob if needed
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

    // Import scripts
    if (data.scripts) {
      for (const script of data.scripts) {
        await this.saveScript(script);
      }
    }

    // Import triggers
    if (data.triggers) {
      for (const trigger of data.triggers) {
        await this.saveTrigger(trigger);
      }
    }

    // Import tags
    if (data.tags) {
      for (const tag of data.tags) {
        await this.saveTag(tag);
      }
    }

    // Import folders
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
