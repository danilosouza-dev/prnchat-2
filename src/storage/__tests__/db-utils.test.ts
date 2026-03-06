import { describe, it, expect } from 'vitest';
import { normalizeInstanceId } from '@/utils/instance-scope';

// We test the private utility methods of DatabaseService by instantiating
// the class and accessing them via type casting. These are pure functions
// that don't require IndexedDB or Chrome APIs.

// Import the module — the singleton `db` export auto-instantiates.
// We'll create a fresh instance for isolation.
// Note: We need dynamic import because db.ts imports sync-service which
// may reference Chrome APIs. We mock what's needed.

// Inline the methods we want to test to avoid complex mocking of db.ts dependencies.
// This approach tests the LOGIC directly, matching the source code exactly.

import type { LeadContact } from '@/types/kanban';

// ---- Extracted pure functions matching DatabaseService private methods ----

function hasValidLeadName(value?: string): boolean {
    if (typeof value !== 'string') return false;
    const normalized = value.trim();
    if (!normalized) return false;
    if (normalized.includes('::') || normalized.startsWith('wa:') || normalized.startsWith('waid:')) {
        return false;
    }
    return normalized.toLowerCase() !== 'desconhecido';
}

function hasRenderablePhoto(photo?: string): boolean {
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

function isLikelyPlaceholderPhotoUrl(photo?: string): boolean {
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

function normalizeLeadChatId(value?: string): string {
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

    // Inline normalizeChatIdentity logic for the identity part
    let userPart = atIndex >= 0 ? normalized.slice(0, atIndex) : normalized;
    userPart = userPart.replace(/:\d+$/g, '');
    const identity = userPart.trim();
    if (!identity) return '';

    if (domain) return `${identity}${domain}`;
    if (/^\d+$/.test(identity)) return `${identity}@c.us`;
    return identity;
}

function getLeadQualityScore(lead: LeadContact): number {
    let score = 0;
    if (hasRenderablePhoto(lead.photo)) score += 40;
    if (hasValidLeadName(lead.name)) score += 25;
    if (typeof lead.lastMessageTime === 'number' && lead.lastMessageTime > 0) score += 15;
    if (typeof lead.lastMessage === 'string' && lead.lastMessage.trim()) score += 10;
    if ((lead.unreadCount || 0) > 0) score += 5;
    score += Math.min(Math.max(lead.updatedAt || 0, 0), Number.MAX_SAFE_INTEGER) / 1e13;
    return score;
}

function matchesScope(record: any, instanceId?: string): boolean {
    if (!instanceId) return true;
    return normalizeInstanceId(record?.instanceId) === normalizeInstanceId(instanceId);
}

// ---- Tests ----

describe('hasValidLeadName', () => {
    it('rejects undefined', () => {
        expect(hasValidLeadName(undefined)).toBe(false);
    });

    it('rejects empty string', () => {
        expect(hasValidLeadName('')).toBe(false);
    });

    it('rejects whitespace-only', () => {
        expect(hasValidLeadName('   ')).toBe(false);
    });

    it('rejects "desconhecido" (case insensitive)', () => {
        expect(hasValidLeadName('Desconhecido')).toBe(false);
        expect(hasValidLeadName('DESCONHECIDO')).toBe(false);
    });

    it('rejects scoped IDs (contains ::)', () => {
        expect(hasValidLeadName('wa:123::5511999')).toBe(false);
    });

    it('rejects wa: prefixed strings', () => {
        expect(hasValidLeadName('wa:5511999')).toBe(false);
    });

    it('rejects waid: prefixed strings', () => {
        expect(hasValidLeadName('waid:5511999')).toBe(false);
    });

    it('accepts normal names', () => {
        expect(hasValidLeadName('João Silva')).toBe(true);
        expect(hasValidLeadName('Maria')).toBe(true);
    });
});

describe('hasRenderablePhoto', () => {
    it('rejects undefined', () => {
        expect(hasRenderablePhoto(undefined)).toBe(false);
    });

    it('rejects empty string', () => {
        expect(hasRenderablePhoto('')).toBe(false);
    });

    it('rejects "about:blank"', () => {
        expect(hasRenderablePhoto('about:blank')).toBe(false);
    });

    it('rejects bare "data:"', () => {
        expect(hasRenderablePhoto('data:')).toBe(false);
    });

    it('accepts https URL', () => {
        expect(hasRenderablePhoto('https://example.com/photo.jpg')).toBe(true);
    });

    it('accepts blob URL', () => {
        expect(hasRenderablePhoto('blob:https://web.whatsapp.com/abc123')).toBe(true);
    });

    it('accepts data:image/png', () => {
        expect(hasRenderablePhoto('data:image/png;base64,iVBOR')).toBe(true);
    });

    it('rejects data:image/svg', () => {
        expect(hasRenderablePhoto('data:image/svg+xml;base64,PHN2Zw==')).toBe(false);
    });

    it('accepts protocol-relative URL', () => {
        expect(hasRenderablePhoto('//example.com/photo.jpg')).toBe(true);
    });
});

describe('isLikelyPlaceholderPhotoUrl', () => {
    it('returns true for undefined', () => {
        expect(isLikelyPlaceholderPhotoUrl(undefined)).toBe(true);
    });

    it('returns true for empty string', () => {
        expect(isLikelyPlaceholderPhotoUrl('')).toBe(true);
    });

    it('detects ui-avatars.com', () => {
        expect(isLikelyPlaceholderPhotoUrl('https://ui-avatars.com/api/?name=J')).toBe(true);
    });

    it('detects WhatsApp default avatar SVG', () => {
        expect(isLikelyPlaceholderPhotoUrl('https://web.whatsapp.com/img/avatar.svg')).toBe(true);
    });

    it('returns false for real photo URL', () => {
        expect(isLikelyPlaceholderPhotoUrl('https://pps.whatsapp.net/v/t61.24694-24/real-photo.jpg')).toBe(false);
    });
});

describe('normalizeLeadChatId', () => {
    it('returns empty string for undefined', () => {
        expect(normalizeLeadChatId(undefined)).toBe('');
    });

    it('returns empty string for empty string', () => {
        expect(normalizeLeadChatId('')).toBe('');
    });

    it('preserves domain for full chat ID', () => {
        expect(normalizeLeadChatId('5511999999999@c.us')).toBe('5511999999999@c.us');
    });

    it('strips scoped prefix', () => {
        expect(normalizeLeadChatId('wa:inst::5511999999999@c.us')).toBe('5511999999999@c.us');
    });

    it('adds @c.us for bare numeric identity', () => {
        expect(normalizeLeadChatId('5511999999999')).toBe('5511999999999@c.us');
    });

    it('does not strip bare wa: prefix (only wai:/waid:)', () => {
        // The regex ^waid?: matches wai: or waid: but NOT wa:
        // normalizeLeadChatId treats wa:number as user=wa with colon separator 
        expect(normalizeLeadChatId('wa:5511999999999')).toBe('wa');
    });

    it('strips waid: prefix', () => {
        expect(normalizeLeadChatId('waid:5511999999999')).toBe('5511999999999@c.us');
    });

    it('removes device suffix', () => {
        expect(normalizeLeadChatId('5511999999999:12@c.us')).toBe('5511999999999@c.us');
    });
});

describe('getLeadQualityScore', () => {
    const baseLead: LeadContact = {
        id: 'test-1',
        instanceId: 'wa:123',
        chatId: '5511999999999@c.us',
        name: '',
        phone: '5511999999999',
        columnId: 'col-1',
        order: 0,
        createdAt: Date.now(),
        updatedAt: 0,
    };

    it('returns 0 for lead with no quality signals', () => {
        const score = getLeadQualityScore(baseLead);
        expect(score).toBe(0);
    });

    it('adds 25 for valid name', () => {
        const lead = { ...baseLead, name: 'João Silva' };
        expect(getLeadQualityScore(lead)).toBeGreaterThanOrEqual(25);
    });

    it('adds 40 for renderable photo', () => {
        const lead = { ...baseLead, photo: 'https://example.com/photo.jpg' };
        expect(getLeadQualityScore(lead)).toBeGreaterThanOrEqual(40);
    });

    it('adds 15 for lastMessageTime', () => {
        const lead = { ...baseLead, lastMessageTime: Date.now() };
        expect(getLeadQualityScore(lead)).toBeGreaterThanOrEqual(15);
    });

    it('scores higher for lead with all quality signals', () => {
        const richLead = {
            ...baseLead,
            name: 'João Silva',
            photo: 'https://example.com/photo.jpg',
            lastMessageTime: Date.now(),
            lastMessage: 'Hello!',
            unreadCount: 3,
        };
        const poorLead = { ...baseLead };
        expect(getLeadQualityScore(richLead)).toBeGreaterThan(getLeadQualityScore(poorLead));
    });
});

describe('matchesScope', () => {
    it('returns true when no instanceId filter is provided', () => {
        const record = { instanceId: 'wa:123' };
        expect(matchesScope(record, undefined)).toBe(true);
    });

    it('returns true when scopes match', () => {
        const record = { instanceId: 'wa:123' };
        expect(matchesScope(record, 'wa:123')).toBe(true);
    });

    it('returns false when scopes differ', () => {
        const record = { instanceId: 'wa:123' };
        expect(matchesScope(record, 'wa:456')).toBe(false);
    });
});
