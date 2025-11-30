/**
 * IndexedDB wrapper for X1Flox
 * Handles storage of messages (including audio blobs), scripts, triggers, and tags
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Message, Script, Trigger, Tag, Settings } from '@/types';

interface X1FloxDB extends DBSchema {
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
  settings: {
    key: string;
    value: Settings;
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
}

class DatabaseService {
  private db: IDBPDatabase<X1FloxDB> | null = null;
  private readonly DB_NAME = 'x1flox-db';
  private readonly DB_VERSION = 2; // Updated to version 2 for image/video blob stores

  async init(): Promise<IDBPDatabase<X1FloxDB>> {
    if (this.db) return this.db;

    this.db = await openDB<X1FloxDB>(this.DB_NAME, this.DB_VERSION, {
      upgrade(db) {
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

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
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

    // Don't store blobs in the message object (just references)
    const messageToSave = {
      ...message,
      audioData: null,
      imageData: null,
      videoData: null
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
    }

    return message;
  }

  async getAllMessages(): Promise<Message[]> {
    const db = await this.init();
    const messages = await db.getAll('messages');

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

  // ==================== UTILITY ====================
  async clearAll(): Promise<void> {
    const db = await this.init();
    await db.clear('messages');
    await db.clear('scripts');
    await db.clear('triggers');
    await db.clear('tags');
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
