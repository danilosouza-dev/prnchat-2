import { describe, it, expect } from 'vitest';
import {
    normalizeInstanceId,
    normalizeChatIdentity,
    buildScopedLeadId,
    LEGACY_INSTANCE_ID,
} from '../instance-scope';

describe('normalizeInstanceId', () => {
    it('returns LEGACY_INSTANCE_ID for undefined', () => {
        expect(normalizeInstanceId(undefined)).toBe(LEGACY_INSTANCE_ID);
    });

    it('returns LEGACY_INSTANCE_ID for null', () => {
        expect(normalizeInstanceId(null)).toBe(LEGACY_INSTANCE_ID);
    });

    it('returns LEGACY_INSTANCE_ID for empty string', () => {
        expect(normalizeInstanceId('')).toBe(LEGACY_INSTANCE_ID);
    });

    it('returns LEGACY_INSTANCE_ID for whitespace-only string', () => {
        expect(normalizeInstanceId('   ')).toBe(LEGACY_INSTANCE_ID);
    });

    it('returns trimmed value for valid instance ID', () => {
        expect(normalizeInstanceId('wa:5511999999999')).toBe('wa:5511999999999');
    });

    it('trims whitespace from valid ID', () => {
        expect(normalizeInstanceId('  wa:123  ')).toBe('wa:123');
    });
});

describe('normalizeChatIdentity', () => {
    it('returns empty string for undefined', () => {
        expect(normalizeChatIdentity(undefined)).toBe('');
    });

    it('returns empty string for null', () => {
        expect(normalizeChatIdentity(null)).toBe('');
    });

    it('returns empty string for empty string', () => {
        expect(normalizeChatIdentity('')).toBe('');
    });

    it('does not strip bare wa: prefix (only wai:/waid:)', () => {
        // ^waid?: matches wai: or waid: but NOT wa:
        // wa:5511999999999 treats : as separator, returns 'wa'
        expect(normalizeChatIdentity('wa:5511999999999')).toBe('wa');
    });

    it('strips wai: prefix', () => {
        expect(normalizeChatIdentity('wai:5511999999999')).toBe('5511999999999');
    });

    it('strips waid: prefix (case insensitive)', () => {
        expect(normalizeChatIdentity('WAID:5511999999999')).toBe('5511999999999');
    });

    it('strips @c.us domain', () => {
        expect(normalizeChatIdentity('5511999999999@c.us')).toBe('5511999999999');
    });

    it('removes device suffix from chat ID', () => {
        expect(normalizeChatIdentity('5511999999999:12@c.us')).toBe('5511999999999');
    });

    it('extracts identity from scoped ID (:: separator)', () => {
        expect(normalizeChatIdentity('wa:inst::5511999999999@c.us')).toBe('5511999999999');
    });
});

describe('buildScopedLeadId', () => {
    it('combines instanceId and chat identity', () => {
        expect(buildScopedLeadId('wa:123', '5511999999999')).toBe('wa:123::5511999999999');
    });

    it('normalizes the instanceId if empty', () => {
        const result = buildScopedLeadId('', '5511999999999');
        expect(result).toBe(`${LEGACY_INSTANCE_ID}::5511999999999`);
    });

    it('normalizes the chat identity', () => {
        const result = buildScopedLeadId('wa:123', '5511999999999@c.us');
        expect(result).toBe('wa:123::5511999999999');
    });
});
