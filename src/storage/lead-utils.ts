/**
 * Lead Normalization and Merge Utilities
 * Extracted from DatabaseService (db.ts) — Story 1.3
 *
 * Pure functions for normalizing lead identities, chat IDs, photos,
 * and merging duplicate leads in the Kanban board.
 */

import type { IDBPDatabase } from 'idb';
import type { KanbanColumn, LeadContact } from '../types/kanban';
import { buildScopedLeadId, normalizeChatIdentity, normalizeInstanceId } from '../utils/instance-scope';
import { syncService } from '../services/sync-service';

// Re-export PrinChatDB type from db.ts for store modules
// (imported dynamically to avoid circular dependency)

export function normalizeScope(instanceId?: string): string {
    return normalizeInstanceId(instanceId);
}

export function normalizeRecordScope(record: any): string {
    return normalizeInstanceId(record?.instanceId);
}

export function matchesScope(record: any, instanceId?: string): boolean {
    if (!instanceId) return true;
    return normalizeRecordScope(record) === normalizeScope(instanceId);
}

export function normalizeLeadIdentity(value?: string): string {
    return normalizeChatIdentity(value);
}

export function normalizeLeadChatId(value?: string): string {
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
    const identity = normalizeLeadIdentity(normalized);
    if (!identity) return '';

    if (domain) return `${identity}${domain}`;
    if (/^\d+$/.test(identity)) return `${identity}@c.us`;
    return identity;
}

export function hasRenderablePhoto(photo?: string): boolean {
    if (typeof photo !== 'string') return false;
    const src = photo.trim();
    if (!src) return false;
    if (src === 'data:' || src === 'about:blank') return false;
    if (isLikelyPlaceholderPhotoUrl(src)) return false;
    if (/^https?:\/\//i.test(src)) return true;
    if (src.startsWith('blob:')) return true;
    if (/^data:image\//i.test(src) && !/^data:image\/svg/i.test(src)) return true;
    if (src.startsWith('//')) return true;
    return false;
}

export function isLikelyPlaceholderPhotoUrl(photo?: string): boolean {
    if (typeof photo !== 'string') return true;
    const src = photo.trim();
    if (!src) return true;

    const lower = src.toLowerCase();
    if (lower.includes('ui-avatars.com')) return true;

    try {
        const parsed = new URL(
            src.startsWith('//') ? `https:${src}` : src
        );
        const host = parsed.hostname.toLowerCase();
        const path = parsed.pathname.toLowerCase();
        const looksAvatarPath =
            path.includes('avatar')
            || path.includes('default-user')
            || path.includes('default-group')
            || path.includes('profile-placeholder');

        if (host === 'web.whatsapp.com' && (looksAvatarPath || path.endsWith('.svg'))) {
            return true;
        }
        if (looksAvatarPath && path.endsWith('.svg')) {
            return true;
        }
    } catch (_error) {
        if (lower.includes('avatar') && lower.includes('.svg')) return true;
    }

    return false;
}

export function hasValidLeadName(value?: string): boolean {
    if (typeof value !== 'string') return false;
    const normalized = value.trim();
    if (!normalized) return false;
    if (normalized.includes('::') || normalized.startsWith('wa:') || normalized.startsWith('waid:')) {
        return false;
    }
    return normalized.toLowerCase() !== 'desconhecido';
}

export function getLeadQualityScore(lead: LeadContact): number {
    let score = 0;
    if (hasRenderablePhoto(lead.photo)) score += 40;
    if (hasValidLeadName(lead.name)) score += 25;
    if (typeof lead.lastMessageTime === 'number' && lead.lastMessageTime > 0) score += 15;
    if (typeof lead.lastMessage === 'string' && lead.lastMessage.trim()) score += 10;
    if ((lead.unreadCount || 0) > 0) score += 5;
    score += Math.min(Math.max(lead.updatedAt || 0, 0), Number.MAX_SAFE_INTEGER) / 1e13;
    return score;
}

export function buildCanonicalChatIdForLead(identity: string, candidates: LeadContact[]): string {
    const preferredDomains = ['@c.us', '@s.whatsapp.net', '@lid', '@g.us'];

    for (const domain of preferredDomains) {
        const matching = candidates.find((lead) => {
            const normalized = normalizeLeadChatId(lead.chatId || lead.phone || lead.id);
            return normalized.endsWith(domain);
        });
        if (matching) return `${identity}${domain}`;
    }

    if (/^\d+$/.test(identity)) {
        return `${identity}@c.us`;
    }

    return identity;
}

export async function normalizeAndMergeKanbanColumns(
    db: IDBPDatabase<any>,
    kanbanColumnNormalizationLocks: Map<string, Promise<void>>,
    instanceId?: string
): Promise<void> {
    const scope = normalizeScope(instanceId);
    const lockKey = scope || '__all__';

    const pending = kanbanColumnNormalizationLocks.get(lockKey);
    if (pending) {
        await pending;
        return;
    }

    const run = (async () => {
        const allColumns = await db.getAll('kanban_columns');
        const scopedColumns = allColumns.filter((column: KanbanColumn) => matchesScope(column, scope));
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
        const scopedLeads = allLeads.filter((lead: LeadContact) => matchesScope(lead, scope));

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
                normalizeScope(primary.instanceId) !== scope;

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
            .filter((column: KanbanColumn) => matchesScope(column, scope))
            .sort((a: KanbanColumn, b: KanbanColumn) => a.order - b.order);
        const validColumnIds = new Set(refreshedColumns.map((column: KanbanColumn) => column.id));
        const fallbackColumnId =
            refreshedColumns.find((column: KanbanColumn) => column.isDefault)?.id
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

    kanbanColumnNormalizationLocks.set(lockKey, run);
    try {
        await run;
    } finally {
        kanbanColumnNormalizationLocks.delete(lockKey);
    }
}

export async function normalizeAndMergeLeads(
    db: IDBPDatabase<any>,
    leadNormalizationLocks: Map<string, Promise<void>>,
    instanceId?: string
): Promise<void> {
    const scope = normalizeScope(instanceId);
    const lockKey = scope || '__all__';

    const pending = leadNormalizationLocks.get(lockKey);
    if (pending) {
        await pending;
        return;
    }

    const run = (async () => {
        const allLeads = await db.getAll('kanban_leads');
        const scopedLeads = allLeads.filter((lead: LeadContact) => matchesScope(lead, scope));
        if (scopedLeads.length <= 1) return;

        const groups = new Map<string, LeadContact[]>();
        for (const lead of scopedLeads) {
            const identity = normalizeLeadIdentity(lead.chatId || lead.phone || lead.id);
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
                    const normalizedChatId = normalizeLeadChatId(lead.chatId || lead.phone || lead.id);
                    return !!normalizedChatId && normalizedChatId !== lead.chatId;
                }) ||
                leads.some((lead) => {
                    const normalizedPhone = normalizeLeadIdentity(lead.phone || lead.chatId || lead.id);
                    return !!normalizedPhone && normalizedPhone !== lead.phone;
                });
            if (!mustNormalize) continue;

            const sortedByQuality = [...leads].sort((a, b) => {
                const scoreDiff = getLeadQualityScore(b) - getLeadQualityScore(a);
                if (scoreDiff !== 0) return scoreDiff;
                return (b.lastMessageTime || b.updatedAt || 0) - (a.lastMessageTime || a.updatedAt || 0);
            });
            const primary = sortedByQuality[0];
            if (!primary) continue;

            const newestMessageLead = [...leads]
                .filter((lead) => typeof lead.lastMessageTime === 'number' && lead.lastMessageTime! > 0)
                .sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0))[0];
            const bestNamedLead = sortedByQuality.find((lead) => hasValidLeadName(lead.name));
            const bestPhotoLead = sortedByQuality.find((lead) => hasRenderablePhoto(lead.photo));

            const mergedTags = Array.from(
                new Set(
                    leads.flatMap((lead) => (Array.isArray(lead.tags) ? lead.tags : []))
                )
            );

            const mergedLead: LeadContact = {
                ...primary,
                id: canonicalId,
                instanceId: scope,
                chatId: buildCanonicalChatIdForLead(identity, leads),
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

    leadNormalizationLocks.set(lockKey, run);

    try {
        await run;
    } finally {
        leadNormalizationLocks.delete(lockKey);
    }
}

export async function resolveLeadStorageKey(
    dbHandle: IDBPDatabase<any>,
    leadId: string,
    instanceId?: string
): Promise<string | null> {
    if (!leadId) return null;

    const leads = await dbHandle.getAll('kanban_leads');
    const scope = normalizeScope(instanceId);
    const normalizedInput = normalizeLeadIdentity(leadId) || leadId;
    const scopedCandidate = buildScopedLeadId(scope, normalizedInput);

    const directMatch = leads.find((lead: LeadContact) => {
        if (instanceId && !matchesScope(lead, instanceId)) return false;
        return lead.id === leadId || lead.id === scopedCandidate;
    });
    if (directMatch) return directMatch.id;

    const byIdentity = leads.find((lead: LeadContact) => {
        if (instanceId && !matchesScope(lead, instanceId)) return false;
        const leadIdentity = normalizeLeadIdentity(lead.chatId || lead.phone || lead.id);
        return leadIdentity === normalizedInput;
    });
    if (byIdentity) return byIdentity.id;

    return null;
}

export async function resolveScopedLeadAliases(
    dbHandle: IDBPDatabase<any>,
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

    const scope = normalizeScope(instanceId);
    const storageKey = await resolveLeadStorageKey(dbHandle, leadId, scope);
    if (!storageKey) return null;

    const allLeads = await dbHandle.getAll('kanban_leads');
    const targetLead = allLeads.find((lead: LeadContact) => lead.id === storageKey);
    if (!targetLead) return null;

    const canonicalIdentity = normalizeLeadIdentity(
        targetLead.chatId || targetLead.phone || targetLead.id
    );
    if (!canonicalIdentity) return null;

    const aliases = allLeads.filter((lead: LeadContact) => {
        if (!matchesScope(lead, scope)) return false;
        const identity = normalizeLeadIdentity(lead.chatId || lead.phone || lead.id);
        return identity === canonicalIdentity;
    });

    const canonicalLeadId = buildScopedLeadId(scope, canonicalIdentity);
    const canonicalChatId = buildCanonicalChatIdForLead(canonicalIdentity, aliases.length > 0 ? aliases : [targetLead]);

    return {
        scope,
        canonicalIdentity,
        canonicalLeadId,
        canonicalChatId,
        aliases: aliases.length > 0 ? aliases : [targetLead]
    };
}
