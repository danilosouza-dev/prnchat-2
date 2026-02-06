/**
 * IndexedDB wrapper for PrinChat
 * Handles storage of messages (including audio blobs), scripts, triggers, and tags
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Message, Script, Trigger, Tag, Folder, Settings, Signature, Schedule, Note } from '@/types';
import type { KanbanColumn, LeadContact } from '../types/kanban';
import { DEFAULT_KANBAN_COLUMNS } from '../types/kanban';
import { syncService } from '../services/sync-service';
import { buildScopedLeadId, normalizeChatIdentity, normalizeInstanceId } from '../utils/instance-scope';

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
  private readonly DB_VERSION = 8; // Updated to version 8 for Kanban support
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

  private normalizeScope(instanceId?: string): string {
    return normalizeInstanceId(instanceId);
  }

  private normalizeRecordScope(record: any): string {
    return normalizeInstanceId(record?.instanceId);
  }

  private matchesScope(record: any, instanceId?: string): boolean {
    if (!instanceId) return true;
    return this.normalizeRecordScope(record) === this.normalizeScope(instanceId);
  }

  private normalizeLeadIdentity(value?: string): string {
    return normalizeChatIdentity(value);
  }

  private normalizeLeadChatId(value?: string): string {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return '';

    let normalized = raw;
    const scopedSeparator = normalized.lastIndexOf('::');
    if (scopedSeparator >= 0) {
      normalized = normalized.slice(scopedSeparator + 2);
    }

    normalized = normalized.replace(/^waid?:/i, '');

    const atIndex = normalized.indexOf('@');
    const domain = atIndex >= 0 ? normalized.slice(atIndex).toLowerCase() : '';
    const identity = this.normalizeLeadIdentity(normalized);
    if (!identity) return '';

    if (domain) return `${identity}${domain}`;
    if (/^\d+$/.test(identity)) return `${identity}@c.us`;
    return identity;
  }

  private hasRenderablePhoto(photo?: string): boolean {
    if (typeof photo !== 'string') return false;
    const src = photo.trim();
    if (!src) return false;
    if (src === 'data:' || src.startsWith('data:image/svg')) return false;
    return src.startsWith('http') || src.startsWith('blob:') || src.startsWith('data:image/');
  }

  private hasValidLeadName(value?: string): boolean {
    if (typeof value !== 'string') return false;
    const normalized = value.trim();
    if (!normalized) return false;
    if (normalized.includes('::') || normalized.startsWith('wa:') || normalized.startsWith('waid:')) {
      return false;
    }
    return normalized.toLowerCase() !== 'desconhecido';
  }

  private getLeadQualityScore(lead: LeadContact): number {
    let score = 0;
    if (this.hasRenderablePhoto(lead.photo)) score += 40;
    if (this.hasValidLeadName(lead.name)) score += 25;
    if (typeof lead.lastMessageTime === 'number' && lead.lastMessageTime > 0) score += 15;
    if (typeof lead.lastMessage === 'string' && lead.lastMessage.trim()) score += 10;
    if ((lead.unreadCount || 0) > 0) score += 5;
    score += Math.min(Math.max(lead.updatedAt || 0, 0), Number.MAX_SAFE_INTEGER) / 1e13;
    return score;
  }

  private buildCanonicalChatIdForLead(identity: string, candidates: LeadContact[]): string {
    const preferredDomains = ['@c.us', '@s.whatsapp.net', '@lid', '@g.us'];

    for (const domain of preferredDomains) {
      const matching = candidates.find((lead) => {
        const normalized = this.normalizeLeadChatId(lead.chatId || lead.phone || lead.id);
        return normalized.endsWith(domain);
      });
      if (matching) return `${identity}${domain}`;
    }

    if (/^\d+$/.test(identity)) {
      return `${identity}@c.us`;
    }

    return identity;
  }

  private async normalizeAndMergeKanbanColumns(instanceId?: string): Promise<void> {
    const scope = this.normalizeScope(instanceId);
    const lockKey = scope || '__all__';

    const pending = this.kanbanColumnNormalizationLocks.get(lockKey);
    if (pending) {
      await pending;
      return;
    }

    const run = (async () => {
      const db = await this.init();
      const allColumns = await db.getAll('kanban_columns');
      const scopedColumns = allColumns.filter((column) => this.matchesScope(column, scope));
      if (scopedColumns.length <= 1) return;

      const groupedByName = new Map<string, KanbanColumn[]>();
      for (const column of scopedColumns) {
        const key = (column.name || '')
          .trim()
          .toLowerCase() || column.id;
        const group = groupedByName.get(key) || [];
        group.push(column);
        groupedByName.set(key, group);
      }

      const allLeads = await db.getAll('kanban_leads');
      const scopedLeads = allLeads.filter((lead) => this.matchesScope(lead, scope));

      const replacementByColumnId = new Map<string, string>();
      const duplicateColumnIds = new Set<string>();
      let changed = false;

      for (const group of groupedByName.values()) {
        if (group.length <= 1) continue;

        const sorted = [...group].sort((a, b) => {
          if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
          const orderDiff = (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
          if (orderDiff !== 0) return orderDiff;
          const createdDiff = (a.createdAt || 0) - (b.createdAt || 0);
          if (createdDiff !== 0) return createdDiff;
          return String(a.id).localeCompare(String(b.id));
        });

        const primary = sorted[0];
        if (!primary) continue;

        const desiredOrder = Math.min(...sorted.map((col) => col.order ?? Number.MAX_SAFE_INTEGER));
        const shouldBeDefault = sorted.some((col) => !!col.isDefault);
        const primaryNeedsUpdate =
          primary.order !== desiredOrder ||
          (!!primary.isDefault) !== shouldBeDefault ||
          this.normalizeScope(primary.instanceId) !== scope;

        if (primaryNeedsUpdate) {
          await db.put('kanban_columns', {
            ...primary,
            instanceId: scope,
            order: desiredOrder,
            isDefault: shouldBeDefault,
            updatedAt: Date.now(),
          });
          changed = true;
        }

        for (const duplicate of sorted.slice(1)) {
          replacementByColumnId.set(duplicate.id, primary.id);
          duplicateColumnIds.add(duplicate.id);
        }
      }

      for (const lead of scopedLeads) {
        const replacementColumnId = replacementByColumnId.get(lead.columnId);
        if (!replacementColumnId) continue;

        await db.put('kanban_leads', {
          ...lead,
          columnId: replacementColumnId,
          updatedAt: Date.now(),
        });
        changed = true;
      }

      for (const duplicateId of duplicateColumnIds) {
        await db.delete('kanban_columns', duplicateId);
        changed = true;
      }

      const refreshedColumns = (await db.getAll('kanban_columns'))
        .filter((column) => this.matchesScope(column, scope))
        .sort((a, b) => a.order - b.order);
      const validColumnIds = new Set(refreshedColumns.map((column) => column.id));
      const fallbackColumnId =
        refreshedColumns.find((column) => column.isDefault)?.id
        || refreshedColumns[0]?.id
        || null;

      if (fallbackColumnId) {
        for (const lead of scopedLeads) {
          if (lead.columnId && validColumnIds.has(lead.columnId)) continue;
          await db.put('kanban_leads', {
            ...lead,
            columnId: fallbackColumnId,
            updatedAt: Date.now(),
          });
          changed = true;
        }
      }

      if (changed && typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
          kanban_columns: Date.now(),
          kanban_leads: Date.now(),
        });
      }
    })();

    this.kanbanColumnNormalizationLocks.set(lockKey, run);
    try {
      await run;
    } finally {
      this.kanbanColumnNormalizationLocks.delete(lockKey);
    }
  }

  private async normalizeAndMergeLeads(instanceId?: string): Promise<void> {
    const scope = this.normalizeScope(instanceId);
    const lockKey = scope || '__all__';

    const pending = this.leadNormalizationLocks.get(lockKey);
    if (pending) {
      await pending;
      return;
    }

    const run = (async () => {
      const db = await this.init();
      const allLeads = await db.getAll('kanban_leads');
      const scopedLeads = allLeads.filter((lead) => this.matchesScope(lead, scope));
      if (scopedLeads.length <= 1) return;

      const groups = new Map<string, LeadContact[]>();
      for (const lead of scopedLeads) {
        const identity = this.normalizeLeadIdentity(lead.chatId || lead.phone || lead.id);
        if (!identity) continue;
        const group = groups.get(identity) || [];
        group.push(lead);
        groups.set(identity, group);
      }

      let changed = false;
      for (const [identity, leads] of groups.entries()) {
        const canonicalId = buildScopedLeadId(scope, identity);
        const mustNormalize =
          leads.length > 1 ||
          leads.some((lead) => lead.id !== canonicalId) ||
          leads.some((lead) => {
            const normalizedChatId = this.normalizeLeadChatId(lead.chatId || lead.phone || lead.id);
            return !!normalizedChatId && normalizedChatId !== lead.chatId;
          }) ||
          leads.some((lead) => {
            const normalizedPhone = this.normalizeLeadIdentity(lead.phone || lead.chatId || lead.id);
            return !!normalizedPhone && normalizedPhone !== lead.phone;
          });
        if (!mustNormalize) continue;

        const sortedByQuality = [...leads].sort((a, b) => {
          const scoreDiff = this.getLeadQualityScore(b) - this.getLeadQualityScore(a);
          if (scoreDiff !== 0) return scoreDiff;
          return (b.lastMessageTime || b.updatedAt || 0) - (a.lastMessageTime || a.updatedAt || 0);
        });
        const primary = sortedByQuality[0];
        if (!primary) continue;

        const newestMessageLead = [...leads]
          .filter((lead) => typeof lead.lastMessageTime === 'number' && lead.lastMessageTime! > 0)
          .sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0))[0];
        const bestNamedLead = sortedByQuality.find((lead) => this.hasValidLeadName(lead.name));
        const bestPhotoLead = sortedByQuality.find((lead) => this.hasRenderablePhoto(lead.photo));

        const mergedTags = Array.from(
          new Set(
            leads.flatMap((lead) => (Array.isArray(lead.tags) ? lead.tags : []))
          )
        );

        const mergedLead: LeadContact = {
          ...primary,
          id: canonicalId,
          instanceId: scope,
          chatId: this.buildCanonicalChatIdForLead(identity, leads),
          phone: identity,
          name: bestNamedLead?.name || primary.name || identity,
          photo: bestPhotoLead?.photo || primary.photo,
          tags: mergedTags.length > 0 ? mergedTags : primary.tags,
          unreadCount: Math.max(...leads.map((lead) => lead.unreadCount || 0)),
          notesCount: Math.max(...leads.map((lead) => lead.notesCount || 0)),
          schedulesCount: Math.max(...leads.map((lead) => lead.schedulesCount || 0)),
          scriptsCount: Math.max(...leads.map((lead) => lead.scriptsCount || 0)),
          lastMessage: newestMessageLead?.lastMessage || primary.lastMessage,
          lastMessageTime: newestMessageLead?.lastMessageTime || primary.lastMessageTime,
          order: Math.min(...leads.map((lead) => lead.order ?? Number.MAX_SAFE_INTEGER)),
          createdAt: Math.min(...leads.map((lead) => lead.createdAt || Date.now())),
          updatedAt: Date.now()
        };

        await db.put('kanban_leads', mergedLead);

        const duplicateKeys = new Set<string>();
        for (const lead of leads) {
          if (lead.id !== canonicalId) {
            duplicateKeys.add(lead.id);
          }
        }

        for (const duplicateKey of duplicateKeys) {
          await db.delete('kanban_leads', duplicateKey);
        }

        changed = true;

        // Best-effort cloud consistency.
        syncService.syncLead(mergedLead).catch(console.warn);
        for (const duplicateLead of leads) {
          if (!duplicateKeys.has(duplicateLead.id)) continue;
          syncService
            .deleteLead(duplicateLead.id, scope, duplicateLead.chatId || duplicateLead.phone || duplicateLead.id)
            .catch(console.warn);
        }
      }

      if (changed && typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
          kanban_leads: Date.now()
        });
      }
    })();

    this.leadNormalizationLocks.set(lockKey, run);

    try {
      await run;
    } finally {
      this.leadNormalizationLocks.delete(lockKey);
    }
  }

  private async resolveLeadStorageKey(dbHandle: IDBPDatabase<PrinChatDB>, leadId: string, instanceId?: string): Promise<string | null> {
    if (!leadId) return null;

    const leads = await dbHandle.getAll('kanban_leads');
    const scope = this.normalizeScope(instanceId);
    const normalizedInput = this.normalizeLeadIdentity(leadId) || leadId;
    const scopedCandidate = buildScopedLeadId(scope, normalizedInput);

    const directMatch = leads.find((lead) => {
      if (instanceId && !this.matchesScope(lead, instanceId)) return false;
      return lead.id === leadId || lead.id === scopedCandidate;
    });
    if (directMatch) return directMatch.id;

    const byIdentity = leads.find((lead) => {
      if (instanceId && !this.matchesScope(lead, instanceId)) return false;
      const leadIdentity = this.normalizeLeadIdentity(lead.chatId || lead.phone || lead.id);
      return leadIdentity === normalizedInput;
    });
    if (byIdentity) return byIdentity.id;

    return null;
  }

  private async resolveScopedLeadAliases(
    dbHandle: IDBPDatabase<PrinChatDB>,
    leadId: string,
    instanceId?: string
  ): Promise<{
    scope: string;
    canonicalIdentity: string;
    canonicalLeadId: string;
    canonicalChatId: string;
    aliases: LeadContact[];
  } | null> {
    if (!leadId) return null;

    const scope = this.normalizeScope(instanceId);
    const storageKey = await this.resolveLeadStorageKey(dbHandle, leadId, scope);
    if (!storageKey) return null;

    const allLeads = await dbHandle.getAll('kanban_leads');
    const targetLead = allLeads.find((lead) => lead.id === storageKey);
    if (!targetLead) return null;

    const canonicalIdentity = this.normalizeLeadIdentity(
      targetLead.chatId || targetLead.phone || targetLead.id
    );
    if (!canonicalIdentity) return null;

    const aliases = allLeads.filter((lead) => {
      if (!this.matchesScope(lead, scope)) return false;
      const identity = this.normalizeLeadIdentity(lead.chatId || lead.phone || lead.id);
      return identity === canonicalIdentity;
    });

    const canonicalLeadId = buildScopedLeadId(scope, canonicalIdentity);
    const canonicalChatId = this.buildCanonicalChatIdForLead(canonicalIdentity, aliases.length > 0 ? aliases : [targetLead]);

    return {
      scope,
      canonicalIdentity,
      canonicalLeadId,
      canonicalChatId,
      aliases: aliases.length > 0 ? aliases : [targetLead]
    };
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

    // Kanban defaults are now initialized lazily per WhatsApp instance.
  }

  // ==================== MESSAGES ====================

  async saveMessage(message: Message): Promise<void> {
    const db = await this.init();

    // Helper to handle media upload logic
    const handleMediaUpload = async (
      blob: Blob,
      type: 'audio' | 'image' | 'video' | 'file',
      filename?: string
    ): Promise<string | null> => {
      try {
        console.log(`[PrinChat DB] Uploading ${type} to cloud...`);
        // Import dynamically to avoid circular dependencies just in case
        const { mediaService } = await import('../services/media-service');
        const url = await mediaService.uploadMedia(blob, filename);
        console.log(`[PrinChat DB] Upload successful: ${url}`);
        return url;
      } catch (error) {
        console.warn(`[PrinChat DB] Upload failed for ${type}, falling back to local storage:`, error);
        return null;
      }
    };

    // 1. AUDIO
    if (message.audioData && message.audioData instanceof Blob) {
      const url = await handleMediaUpload(message.audioData, 'audio', `audio-${message.id}.mp3`); // Extension estimation
      if (url) {
        message.audioUrl = url;
        message.audioData = null; // Don't store local blob
      } else {
        // Fallback: Save to local IDB
        await db.put('audioBlobs', {
          messageId: message.id,
          blob: message.audioData,
          createdAt: Date.now(),
        });
      }
    }

    // 2. IMAGE
    if (message.imageData && message.imageData instanceof Blob) {
      const url = await handleMediaUpload(message.imageData, 'image', `image-${message.id}`);
      if (url) {
        message.imageUrl = url;
        message.imageData = null;
      } else {
        await db.put('imageBlobs', {
          messageId: message.id,
          blob: message.imageData,
          createdAt: Date.now(),
        });
      }
    }

    // 3. VIDEO
    if (message.videoData && message.videoData instanceof Blob) {
      const url = await handleMediaUpload(message.videoData, 'video', `video-${message.id}`);
      if (url) {
        message.videoUrl = url;
        message.videoData = null;
      } else {
        await db.put('videoBlobs', {
          messageId: message.id,
          blob: message.videoData,
          createdAt: Date.now(),
        });
      }
    }

    // 4. FILE
    if (message.fileData && message.fileData instanceof Blob) {
      const url = await handleMediaUpload(message.fileData, 'file', message.fileName || `file-${message.id}`);
      if (url) {
        message.fileUrl = url;
        message.fileData = null;
      } else {
        await db.put('fileBlobs', {
          messageId: message.id,
          blob: message.fileData,
          fileName: message.fileName || 'file',
          createdAt: Date.now(),
        });
      }
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
          }
          // Note: If no blob found, file is in Bunny CDN (expected behavior)
        }

        return msg;
      })
    );

    return messagesWithMedia;
  }

  async deleteMessage(id: string): Promise<void> {
    const db = await this.init();

    // CLEANUP: Delete file from Bunny CDN before deleting from DB
    try {
      const message = await db.get('messages', id);

      if (message) {
        // Check if message has media URLs (uploaded to Bunny)
        const mediaUrls: string[] = [];

        if (message.audioUrl) mediaUrls.push(message.audioUrl);
        if (message.imageUrl) mediaUrls.push(message.imageUrl);
        if (message.videoUrl) mediaUrls.push(message.videoUrl);
        if (message.fileUrl) mediaUrls.push(message.fileUrl);

        if (mediaUrls.length > 0) {
          console.log(`[PrinChat DB] Message ${id} has ${mediaUrls.length} media file(s) in Bunny. Deleting...`);

          // Import media service and delete files
          const { mediaService } = await import('../services/media-service');

          for (const url of mediaUrls) {
            const deleted = await mediaService.deleteMedia(url);
            if (deleted) {
              console.log(`[PrinChat DB] ✅ Deleted from Bunny: ${url}`);
            } else {
              console.warn(`[PrinChat DB] ⚠️ Failed to delete from Bunny: ${url}`);
            }
          }
        }
      }
    } catch (cleanupError) {
      console.warn('[PrinChat DB] Error cleaning up Bunny files (continuing with deletion):', cleanupError);
      // Don't throw - we still want to delete from DB even if Bunny cleanup fails
    }

    // Delete from IndexedDB
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

    // Trigger sync
    syncService.syncTag(tag).catch(console.error);
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

    // Trigger sync
    syncService.deleteTag(id).catch(console.error);
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

    // Trigger sync
    syncService.syncSignature(signature).catch(console.error);
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
        const updatedSig = { ...sig, isActive: false, updatedAt: Date.now() };
        await db.put('signatures', updatedSig);
        syncService.syncSignature(updatedSig).catch(console.error);
      }
    }

    // Activate the selected signature
    const targetSignature = await db.get('signatures', id);
    if (targetSignature) {
      const updatedTarget = { ...targetSignature, isActive: true, updatedAt: Date.now() };
      await db.put('signatures', updatedTarget);
      syncService.syncSignature(updatedTarget).catch(console.error);
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
    const scopedSchedule: Schedule = {
      ...schedule,
      instanceId: this.normalizeScope(schedule.instanceId),
    };
    await db.put('schedules', scopedSchedule);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        schedules: Date.now()
      });
    }

    // Trigger sync
    syncService.syncSchedule(scopedSchedule).catch(console.error);
  }

  async getSchedule(id: string, instanceId?: string): Promise<Schedule | undefined> {
    const db = await this.init();
    const schedule = await db.get('schedules', id);
    if (!schedule) return undefined;
    return this.matchesScope(schedule, instanceId) ? schedule : undefined;
  }

  async getSchedulesByChatId(chatId: string, instanceId?: string): Promise<Schedule[]> {
    const db = await this.init();
    const schedules = await db.getAllFromIndex('schedules', 'by-chatId', chatId);
    return schedules
      .filter((s) => this.matchesScope(s, instanceId))
      .sort((a, b) => a.scheduledTime - b.scheduledTime);
  }

  async getPendingSchedules(instanceId?: string): Promise<Schedule[]> {
    const db = await this.init();
    const now = Date.now();
    const pendingSchedules = await db.getAllFromIndex('schedules', 'by-status', 'pending');

    // Filter to only return schedules that are due
    return pendingSchedules
      .filter((schedule) => this.matchesScope(schedule, instanceId))
      .filter(schedule => schedule.scheduledTime <= now)
      .sort((a, b) => a.scheduledTime - b.scheduledTime);
  }

  async getAllPendingSchedules(instanceId?: string): Promise<Schedule[]> {
    const db = await this.init();
    const pending = await db.getAllFromIndex('schedules', 'by-status', 'pending');
    return pending.filter((schedule) => this.matchesScope(schedule, instanceId));
  }

  async updateScheduleStatus(id: string, status: 'pending' | 'paused' | 'completed' | 'cancelled' | 'failed', instanceId?: string): Promise<void> {
    const db = await this.init();
    const schedule = await db.get('schedules', id);

    if (schedule && this.matchesScope(schedule, instanceId)) {
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

  async getPausedSchedules(instanceId?: string): Promise<Schedule[]> {
    const db = await this.init();
    const paused = await db.getAllFromIndex('schedules', 'by-status', 'paused');
    return paused.filter((schedule) => this.matchesScope(schedule, instanceId));
  }

  async getAllSchedules(instanceId?: string): Promise<Schedule[]> {
    const db = await this.init();
    const schedules = await db.getAll('schedules');
    // Sort by scheduled time
    return schedules
      .filter((s) => this.matchesScope(s, instanceId))
      .sort((a, b) => a.scheduledTime - b.scheduledTime);
  }

  async deleteSchedule(id: string, instanceId?: string): Promise<void> {
    const db = await this.init();
    const schedule = await db.get('schedules', id);
    if (!schedule || !this.matchesScope(schedule, instanceId)) {
      return;
    }
    await db.delete('schedules', id);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        schedules: Date.now()
      });
    }

    // Trigger sync
    syncService.deleteSchedule(id, schedule.instanceId).catch(console.error);
  }

  // ==================== NOTES ====================
  async createNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> {
    const db = await this.init();
    const now = Date.now();

    const newNote: Note = {
      ...note,
      instanceId: this.normalizeScope(note.instanceId),
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

    // Trigger sync
    syncService.syncNote(newNote).catch(console.error);

    return newNote;
  }

  async getNotesByChatId(chatId: string, instanceId?: string): Promise<Note[]> {
    console.log('[DB] getNotesByChatId called with chatId:', chatId);
    const db = await this.init();
    const notes = await db.getAllFromIndex('notes', 'by-chatId', chatId);
    console.log('[DB] getNotesByChatId found', notes.length, 'notes:', notes);
    // Sort by creation date descending (newest first)
    return notes
      .filter((n) => this.matchesScope(n, instanceId))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getNote(id: string, instanceId?: string): Promise<Note | undefined> {
    const db = await this.init();
    const note = await db.get('notes', id);
    if (!note) return undefined;
    return this.matchesScope(note, instanceId) ? note : undefined;
  }

  async updateNote(id: string, updates: Partial<Omit<Note, 'id' | 'createdAt'>>, instanceId?: string): Promise<void> {
    const db = await this.init();
    const existingNote = await db.get('notes', id);

    if (!existingNote || !this.matchesScope(existingNote, instanceId)) {
      throw new Error(`Note with id ${id} not found`);
    }

    const updatedNote: Note = {
      ...existingNote,
      ...updates,
      instanceId: this.normalizeScope((updates as any)?.instanceId || existingNote.instanceId),
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

    // Trigger sync
    syncService.syncNote(updatedNote).catch(console.error);
  }

  async deleteNote(id: string, instanceId?: string): Promise<void> {
    const db = await this.init();
    const note = await db.get('notes', id);
    if (!note || !this.matchesScope(note, instanceId)) {
      return;
    }
    await db.delete('notes', id);
    console.log('[PrinChat DB] Note deleted:', id);

    // Trigger chrome.storage change event for real-time updates
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        notes: Date.now()
      });
    }

    // Trigger sync
    syncService.deleteNote(id, note.instanceId).catch(console.error);
  }

  async getAllNotes(instanceId?: string): Promise<Note[]> {
    const db = await this.init();
    const notes = await db.getAll('notes');
    // Sort by creation date descending (newest first)
    return notes
      .filter((n) => this.matchesScope(n, instanceId))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  // ==================== KANBAN COLUMNS ====================
  /**
   * Initialize default Kanban columns if none exist for a given instance
   */
  private async initializeDefaultKanbanColumns(instanceId: string): Promise<void> {
    const scopedInstanceId = this.normalizeScope(instanceId);
    const inFlight = this.kanbanInitLocks.get(scopedInstanceId);
    if (inFlight) {
      await inFlight;
      return;
    }

    const initPromise = (async () => {
      const db = await this.init();
      const allColumns = await db.getAll('kanban_columns');
      const existingColumns = allColumns.filter((col) => this.matchesScope(col, scopedInstanceId));

      if (existingColumns.length === 0) {
        console.log('[PrinChat DB] Initializing default Kanban columns for instance:', scopedInstanceId);

        const now = Date.now();
        const instanceToken = scopedInstanceId.replace(/[^a-zA-Z0-9]/g, '_');

        for (const column of DEFAULT_KANBAN_COLUMNS) {
          const slug = column.name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') || 'default';

          const kanbanColumn: KanbanColumn = {
            ...column,
            // Deterministic default IDs avoid race-created duplicates.
            id: `kanban_col_${instanceToken}_${slug}`,
            instanceId: scopedInstanceId,
            createdAt: now,
            updatedAt: now,
          };
          await db.put('kanban_columns', kanbanColumn);
          console.log('[PrinChat DB] Created default column:', kanbanColumn.name);
        }

        console.log('[PrinChat DB] ✅ Default Kanban columns initialized');
      }
    })();

    this.kanbanInitLocks.set(scopedInstanceId, initPromise);
    try {
      await initPromise;
    } finally {
      this.kanbanInitLocks.delete(scopedInstanceId);
    }
  }

  /**
   * Save or update a Kanban column
   */
  async saveKanbanColumn(column: KanbanColumn): Promise<void> {
    const db = await this.init();
    const scopedColumn: KanbanColumn = {
      ...column,
      instanceId: this.normalizeScope(column.instanceId),
    };
    await db.put('kanban_columns', scopedColumn);

    // Trigger chrome.storage change event for real-time updates
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        kanban_columns: Date.now()
      });
    }

    // Trigger sync
    syncService.syncKanbanColumn(scopedColumn).catch(console.error);
  }

  /**
   * Get a Kanban column by ID
   */
  async getKanbanColumn(id: string, instanceId?: string): Promise<KanbanColumn | undefined> {
    const db = await this.init();
    const column = await db.get('kanban_columns', id);
    if (!column) return undefined;
    return this.matchesScope(column, instanceId) ? column : undefined;
  }

  /**
   * Get all Kanban columns sorted by order
   */
  async getAllKanbanColumns(instanceId?: string): Promise<KanbanColumn[]> {
    const db = await this.init();
    if (instanceId) {
      await this.initializeDefaultKanbanColumns(instanceId);
      await this.normalizeAndMergeKanbanColumns(instanceId);
    }

    const columns = await db.getAllFromIndex('kanban_columns', 'by-order');
    const scoped = columns.filter((column) => this.matchesScope(column, instanceId));

    // Keep first column per normalized name to avoid duplicated defaults from legacy race conditions.
    const byName = new Map<string, KanbanColumn>();
    for (const column of scoped) {
      const key = column.name.trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, column);
    }

    return Array.from(byName.values()).sort((a, b) => a.order - b.order);
  }

  /**
   * Delete a Kanban column
   * @param id Column ID to delete
   * @throws Error if column is not deletable or has leads
   */
  async deleteKanbanColumn(id: string, instanceId?: string): Promise<void> {
    const db = await this.init();
    const column = await db.get('kanban_columns', id);

    if (!column || !this.matchesScope(column, instanceId)) {
      throw new Error('Column not found');
    }

    if (!column.canDelete) {
      throw new Error('Cannot delete default column');
    }

    // Check if column has any leads
    const leads = await db.getAllFromIndex('kanban_leads', 'by-columnId', id);
    const scopedLeads = leads.filter((lead) => this.matchesScope(lead, instanceId));
    if (scopedLeads.length > 0) {
      throw new Error('Cannot delete column with leads. Move leads first.');
    }

    await db.delete('kanban_columns', id);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        kanban_columns: Date.now()
      });
    }

    // Trigger sync
    syncService.deleteKanbanColumn(id, column.instanceId).catch(console.error);
  }

  /**
   * Update column order
   * @param columnId Column to move
   * @param newOrder New order position (0-based)
   */
  async updateColumnOrder(columnId: string, newOrder: number, instanceId?: string): Promise<void> {
    const db = await this.init();
    const allColumns = await this.getAllKanbanColumns(instanceId);

    // Find the column to move
    const columnToMove = allColumns.find(c => c.id === columnId);
    if (!columnToMove) {
      throw new Error('Column not found');
    }

    const oldOrder = columnToMove.order;

    // Reorder columns
    const updatedColumns = allColumns.map(col => {
      if (col.id === columnId) {
        return { ...col, order: newOrder, updatedAt: Date.now() };
      } else {
        // Shift other columns
        if (oldOrder < newOrder) {
          // Moving right
          if (col.order > oldOrder && col.order <= newOrder) {
            return { ...col, order: col.order - 1, updatedAt: Date.now() };
          }
        } else {
          // Moving left
          if (col.order >= newOrder && col.order < oldOrder) {
            return { ...col, order: col.order + 1, updatedAt: Date.now() };
          }
        }
        return col;
      }
    });

    // Save all updated columns
    for (const col of updatedColumns) {
      await db.put('kanban_columns', col);
    }

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        kanban_columns: Date.now()
      });
    }

    // Sync all updated columns (for order update)
    // Optimisation: Could receive array in syncService
    for (const col of updatedColumns) {
      syncService.syncKanbanColumn(col).catch(console.error);
    }
  }

  /**
   * Create a new Kanban column
   */
  async createKanbanColumn(
    name: string,
    color: string,
    description?: string,
    instanceId?: string
  ): Promise<KanbanColumn> {
    const db = await this.init();
    const scopedInstanceId = this.normalizeScope(instanceId);
    const existingColumns = await this.getAllKanbanColumns(scopedInstanceId);

    // Check for duplicate names
    if (existingColumns.some(col => col.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Column name already exists');
    }

    const now = Date.now();
    const instanceToken = scopedInstanceId.replace(/[^a-zA-Z0-9]/g, '_');
    const newColumn: KanbanColumn = {
      id: `kanban_col_${instanceToken}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      instanceId: scopedInstanceId,
      name,
      color,
      description,
      order: existingColumns.length, // Add to end
      isDefault: false,
      canDelete: true,
      canEdit: true,
      createdAt: now,
      updatedAt: now,
    };

    await db.put('kanban_columns', newColumn);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        kanban_columns: Date.now()
      });
    }

    // Trigger sync
    syncService.syncKanbanColumn(newColumn).catch(console.error);

    return newColumn;
  }

  /**
   * Update Kanban column (name and/or color)
   */
  async updateKanbanColumn(
    id: string,
    updates: { name?: string; color?: string },
    instanceId?: string
  ): Promise<void> {
    const db = await this.init();
    const column = await db.get('kanban_columns', id);

    if (!column || !this.matchesScope(column, instanceId)) {
      throw new Error('Column not found');
    }

    if (!column.canEdit) {
      throw new Error('Cannot edit default column');
    }

    // Check for duplicate names if name is being updated
    if (updates.name && updates.name !== column.name) {
      const existingColumns = await this.getAllKanbanColumns(instanceId);
      if (existingColumns.some(col => col.id !== id && col.name.toLowerCase() === updates.name!.toLowerCase())) {
        throw new Error('Column name already exists');
      }
    }

    const updatedColumn: KanbanColumn = {
      ...column,
      ...updates,
      instanceId: this.normalizeScope(column.instanceId),
      updatedAt: Date.now(),
    };

    await db.put('kanban_columns', updatedColumn);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        kanban_columns: Date.now()
      });
    }

    // Trigger sync
    syncService.syncKanbanColumn(updatedColumn).catch(console.error);
  }

  // ==================== KANBAN LEADS ====================
  /**
   * Create a new lead contact
   */
  async createLead(lead: Omit<LeadContact, 'id' | 'createdAt' | 'updatedAt'>): Promise<LeadContact> {
    const db = await this.init();
    const now = Date.now();
    const scopedInstanceId = this.normalizeScope(lead.instanceId);
    const identity = this.normalizeLeadIdentity(lead.chatId || lead.phone) || lead.phone;
    const normalizedChatId = this.normalizeLeadChatId(lead.chatId || lead.phone || identity) || (lead.chatId || lead.phone);

    const newLead: LeadContact = {
      ...lead,
      instanceId: scopedInstanceId,
      chatId: normalizedChatId,
      phone: this.normalizeLeadIdentity(lead.phone || lead.chatId || identity) || lead.phone,
      id: buildScopedLeadId(scopedInstanceId, identity), // Scope lead key by WhatsApp instance
      order: lead.order ?? -now, // Default to top of list if order is missing
      createdAt: now,
      updatedAt: now,
    };

    await db.put('kanban_leads', newLead);
    console.log('[PrinChat DB] Lead created:', newLead.id);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        kanban_leads: Date.now()
      });
    }

    // Trigger sync
    syncService.syncLead(newLead).catch(console.error);

    return newLead;
  }

  /**
   * Save/update a lead
   */
  async saveLead(lead: LeadContact): Promise<void> {
    const db = await this.init();
    const scopedInstanceId = this.normalizeScope(lead.instanceId);
    const identity = this.normalizeLeadIdentity(lead.chatId || lead.phone || lead.id) || lead.id;
    const updatedLead = {
      ...lead,
      instanceId: scopedInstanceId,
      chatId: this.normalizeLeadChatId(lead.chatId || lead.phone || identity) || lead.chatId,
      phone: this.normalizeLeadIdentity(lead.phone || lead.chatId || identity) || lead.phone,
      id: lead.id?.includes('::') ? lead.id : buildScopedLeadId(scopedInstanceId, identity),
      updatedAt: Date.now()
    };
    await db.put('kanban_leads', updatedLead);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        kanban_leads: Date.now()
      });
    }

    // Trigger sync
    syncService.syncLead(updatedLead).catch(console.error);
  }

  /**
   * Update a lead partially
   */
  async updateLead(id: string, updates: Partial<LeadContact>, instanceId?: string): Promise<void> {
    const db = await this.init();
    const storageKey = await this.resolveLeadStorageKey(db, id, instanceId);
    if (!storageKey) {
      throw new Error(`Lead with id ${id} not found`);
    }
    const lead = await db.get('kanban_leads', storageKey);

    if (!lead) {
      throw new Error(`Lead with id ${id} not found`);
    }

    const scopedInstanceId = this.normalizeScope((updates as any).instanceId || lead.instanceId || instanceId);
    const targetIdentity = this.normalizeLeadIdentity(
      updates.chatId || updates.phone || lead.chatId || lead.phone || lead.id
    ) || (updates.chatId || updates.phone || lead.chatId || lead.phone || lead.id);

    const updatedLead: LeadContact = {
      ...lead,
      ...updates,
      instanceId: scopedInstanceId,
      chatId: this.normalizeLeadChatId(updates.chatId || updates.phone || lead.chatId || lead.phone || targetIdentity) || (updates.chatId || lead.chatId),
      phone: this.normalizeLeadIdentity(updates.phone || updates.chatId || lead.phone || lead.chatId || targetIdentity) || (updates.phone || lead.phone),
      id: storageKey.includes('::') ? storageKey : buildScopedLeadId(scopedInstanceId, targetIdentity),
      updatedAt: Date.now(),
    };

    await db.put('kanban_leads', updatedLead);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        kanban_leads: Date.now()
      });
    }

    // Trigger sync
    syncService.syncLead(updatedLead).catch(console.error);
  }

  /**
   * Get a single lead by ID
   */
  async getLead(id: string, instanceId?: string): Promise<LeadContact | undefined> {
    const db = await this.init();
    const storageKey = await this.resolveLeadStorageKey(db, id, instanceId);
    if (!storageKey) return undefined;
    return db.get('kanban_leads', storageKey);
  }

  /**
   * Get all leads
   */
  async getAllLeads(instanceId?: string): Promise<LeadContact[]> {
    if (instanceId) {
      await this.normalizeAndMergeKanbanColumns(instanceId);
    }
    await this.normalizeAndMergeLeads(instanceId);
    const db = await this.init();
    const leads = await db.getAll('kanban_leads');
    return leads.filter((lead) => this.matchesScope(lead, instanceId));
  }

  /**
   * Get leads for a specific column
   */
  async getLeadsByColumn(columnId: string, instanceId?: string): Promise<LeadContact[]> {
    if (instanceId) {
      await this.normalizeAndMergeKanbanColumns(instanceId);
    }
    await this.normalizeAndMergeLeads(instanceId);
    const db = await this.init();
    const leads = await db.getAllFromIndex('kanban_leads', 'by-columnId', columnId);
    const sorted = leads
      .filter((lead) => this.matchesScope(lead, instanceId))
      .sort((a, b) => a.order - b.order);

    // Debug: Log first 3 leads to verify order
    if (sorted.length > 0) {
      console.log(`[PrinChat DB] Loaded column ${columnId}:`, sorted.map(l => `${l.id.substring(0, 5)}..(${l.order})`));
    }

    return sorted;
  }

  /**
   * Move a lead to a different column
   */
  async moveLead(leadId: string, newColumnId: string, newOrder: number, instanceId?: string): Promise<void> {
    const db = await this.init();
    const storageKey = await this.resolveLeadStorageKey(db, leadId, instanceId);
    if (!storageKey) {
      console.warn('[PrinChat DB] Lead not found:', leadId);
      return;
    }
    const lead = await db.get('kanban_leads', storageKey);

    if (!lead) {
      console.warn('[PrinChat DB] Lead not found:', leadId);
      return;
    }

    const updatedLead: LeadContact = {
      ...lead,
      columnId: newColumnId,
      order: newOrder,
      updatedAt: Date.now()
    };

    await db.put('kanban_leads', updatedLead);
    console.log('[PrinChat DB] Lead moved:', leadId, '→', newColumnId);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        kanban_leads: Date.now()
      });
    }

    // Trigger sync
    syncService.syncLead(updatedLead).catch(console.error);
  }

  /**
   * Delete a lead
   */
  async deleteLead(id: string, instanceId?: string): Promise<void> {
    const db = await this.init();
    const resolved = await this.resolveScopedLeadAliases(db, id, instanceId);
    if (!resolved) return;

    const { aliases, canonicalLeadId, canonicalChatId, scope } = resolved;

    for (const alias of aliases) {
      await db.delete('kanban_leads', alias.id);
    }

    console.log('[PrinChat DB] Lead delete completed', {
      phase: 'delete',
      rawLeadId: id,
      canonicalLeadId,
      canonicalChatId,
      aliasesDeletedCount: aliases.length
    });

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        kanban_leads: Date.now()
      });
    }

    // Trigger sync
    for (const alias of aliases) {
      syncService
        .deleteLead(alias.id, scope, canonicalChatId)
        .catch(console.error);
    }
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
