/**
 * Kanban Leads Store
 * Extracted from DatabaseService (db.ts) — Story 1.3
 */

import type { IDBPDatabase } from 'idb';
import type { PrinChatDB } from '../db';
import type { LeadContact } from '../../types/kanban';
import { syncService } from '../../services/sync-service';
import { buildScopedLeadId } from '../../utils/instance-scope';
import {
    normalizeScope,
    matchesScope,
    normalizeLeadIdentity,
    normalizeLeadChatId,
    hasRenderablePhoto,
    normalizeAndMergeKanbanColumns,
    normalizeAndMergeLeads,
    resolveLeadStorageKey,
    resolveScopedLeadAliases,
} from '../lead-utils';

export async function createLead(
    db: IDBPDatabase<PrinChatDB>,
    lead: Omit<LeadContact, 'id' | 'createdAt' | 'updatedAt'>
): Promise<LeadContact> {
    const now = Date.now();
    const scopedInstanceId = normalizeScope(lead.instanceId);
    const identity = normalizeLeadIdentity(lead.chatId || lead.phone) || lead.phone;
    const normalizedChatId = normalizeLeadChatId(lead.chatId || lead.phone || identity) || (lead.chatId || lead.phone);
    const scopedId = buildScopedLeadId(scopedInstanceId, identity);

    // MERGE-ON-COLLISION: If a lead with this ID already exists, preserve
    // existing non-empty data (photo, tags, labels, columnId) that the
    // caller might not have
    let existingLead: LeadContact | undefined;
    try {
        existingLead = await db.get('kanban_leads', scopedId);
    } catch (_e) { /* not found, that's fine */ }

    const newLead: LeadContact = {
        ...lead,
        instanceId: scopedInstanceId,
        chatId: normalizedChatId,
        phone: normalizeLeadIdentity(lead.phone || lead.chatId || identity) || lead.phone,
        id: scopedId,
        order: lead.order ?? -now,
        createdAt: existingLead?.createdAt || now,
        updatedAt: now,
    };

    // Preserve existing non-empty fields when the incoming data is empty
    if (existingLead) {
        console.log('[PrinChat DB] createLead: lead already exists, merging with existing data:', scopedId);

        if (!hasRenderablePhoto(newLead.photo) && hasRenderablePhoto(existingLead.photo)) {
            newLead.photo = existingLead.photo;
        }

        if ((!Array.isArray(newLead.tags) || newLead.tags.length === 0) && Array.isArray(existingLead.tags) && existingLead.tags.length > 0) {
            newLead.tags = existingLead.tags;
        }

        if ((!Array.isArray((newLead as any).labels) || (newLead as any).labels.length === 0) && Array.isArray((existingLead as any).labels) && (existingLead as any).labels.length > 0) {
            (newLead as any).labels = (existingLead as any).labels;
        }

        if (existingLead.columnId && lead.columnId !== existingLead.columnId) {
            newLead.columnId = existingLead.columnId;
        }
    }

    await db.put('kanban_leads', newLead);
    console.log('[PrinChat DB] Lead created:', newLead.id, existingLead ? '(merged with existing)' : '(new)');

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

export async function saveLead(
    db: IDBPDatabase<PrinChatDB>,
    lead: LeadContact
): Promise<void> {
    const scopedInstanceId = normalizeScope(lead.instanceId);
    const identity = normalizeLeadIdentity(lead.chatId || lead.phone || lead.id) || lead.id;
    const updatedLead = {
        ...lead,
        instanceId: scopedInstanceId,
        chatId: normalizeLeadChatId(lead.chatId || lead.phone || identity) || lead.chatId,
        phone: normalizeLeadIdentity(lead.phone || lead.chatId || identity) || lead.phone,
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

export async function updateLead(
    db: IDBPDatabase<PrinChatDB>,
    id: string,
    updates: Partial<LeadContact>,
    instanceId?: string
): Promise<void> {
    const storageKey = await resolveLeadStorageKey(db, id, instanceId);
    if (!storageKey) {
        throw new Error(`Lead with id ${id} not found`);
    }
    const lead = await db.get('kanban_leads', storageKey);

    if (!lead) {
        throw new Error(`Lead with id ${id} not found`);
    }

    const sanitizedUpdates: Partial<LeadContact> = { ...updates };
    if (Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'photo')) {
        const incomingPhoto = (sanitizedUpdates as any).photo;
        if (!hasRenderablePhoto(incomingPhoto) && hasRenderablePhoto(lead.photo)) {
            delete (sanitizedUpdates as any).photo;
        }
    }

    const scopedInstanceId = normalizeScope((updates as any).instanceId || lead.instanceId || instanceId);
    const targetIdentity = normalizeLeadIdentity(
        sanitizedUpdates.chatId || sanitizedUpdates.phone || lead.chatId || lead.phone || lead.id
    ) || (sanitizedUpdates.chatId || sanitizedUpdates.phone || lead.chatId || lead.phone || lead.id);

    const updatedLead: LeadContact = {
        ...lead,
        ...sanitizedUpdates,
        instanceId: scopedInstanceId,
        chatId: normalizeLeadChatId(sanitizedUpdates.chatId || sanitizedUpdates.phone || lead.chatId || lead.phone || targetIdentity) || (sanitizedUpdates.chatId || lead.chatId),
        phone: normalizeLeadIdentity(sanitizedUpdates.phone || sanitizedUpdates.chatId || lead.phone || lead.chatId || targetIdentity) || (sanitizedUpdates.phone || lead.phone),
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

export async function getLead(
    db: IDBPDatabase<PrinChatDB>,
    id: string,
    instanceId?: string
): Promise<LeadContact | undefined> {
    const storageKey = await resolveLeadStorageKey(db, id, instanceId);
    if (!storageKey) return undefined;
    return db.get('kanban_leads', storageKey);
}

export async function getAllLeads(
    db: IDBPDatabase<PrinChatDB>,
    kanbanColumnNormalizationLocks: Map<string, Promise<void>>,
    leadNormalizationLocks: Map<string, Promise<void>>,
    instanceId?: string
): Promise<LeadContact[]> {
    if (instanceId) {
        await normalizeAndMergeKanbanColumns(db, kanbanColumnNormalizationLocks, instanceId);
    }
    await normalizeAndMergeLeads(db, leadNormalizationLocks, instanceId);
    const leads = await db.getAll('kanban_leads');
    return leads.filter((lead) => matchesScope(lead, instanceId));
}

export async function getLeadsByColumn(
    db: IDBPDatabase<PrinChatDB>,
    kanbanColumnNormalizationLocks: Map<string, Promise<void>>,
    leadNormalizationLocks: Map<string, Promise<void>>,
    columnId: string,
    instanceId?: string
): Promise<LeadContact[]> {
    if (instanceId) {
        await normalizeAndMergeKanbanColumns(db, kanbanColumnNormalizationLocks, instanceId);
    }
    await normalizeAndMergeLeads(db, leadNormalizationLocks, instanceId);
    const leads = await db.getAllFromIndex('kanban_leads', 'by-columnId', columnId);
    const sorted = leads
        .filter((lead) => matchesScope(lead, instanceId))
        .sort((a, b) => a.order - b.order);

    if (sorted.length > 0) {
        console.log(`[PrinChat DB] Loaded column ${columnId}:`, sorted.map(l => `${l.id.substring(0, 5)}..(${l.order})`));
    }

    return sorted;
}

export async function moveLead(
    db: IDBPDatabase<PrinChatDB>,
    leadId: string,
    newColumnId: string,
    newOrder: number,
    instanceId?: string
): Promise<void> {
    const storageKey = await resolveLeadStorageKey(db, leadId, instanceId);
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

export async function deleteLead(
    db: IDBPDatabase<PrinChatDB>,
    id: string,
    instanceId?: string
): Promise<void> {
    const resolved = await resolveScopedLeadAliases(db, id, instanceId);
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
