/**
 * Settings Store
 * Extracted from DatabaseService (db.ts) — Story 1.3
 */

import type { IDBPDatabase } from 'idb';
import type { PrinChatDB } from '../db';
import type { Settings } from '@/types';

export async function saveSettings(
    db: IDBPDatabase<PrinChatDB>,
    settings: Settings
): Promise<void> {
    await db.put('settings', { key: 'app-settings', ...settings } as any);

    // Also save to chrome.storage.local to trigger onChanged listeners
    // This enables real-time updates across tabs and content scripts
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ settings });
    }
}

export async function getSettings(
    db: IDBPDatabase<PrinChatDB>
): Promise<Settings | undefined> {
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
