/**
 * Scripts Store
 * Extracted from DatabaseService (db.ts) — Story 1.3
 */

import type { IDBPDatabase } from 'idb';
import type { PrinChatDB } from '../db';
import type { Script } from '@/types';

export async function saveScript(
    db: IDBPDatabase<PrinChatDB>,
    script: Script
): Promise<void> {
    await db.put('scripts', script);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            scripts: Date.now()
        });
    }
}

export async function getScript(
    db: IDBPDatabase<PrinChatDB>,
    id: string
): Promise<Script | undefined> {
    return db.get('scripts', id);
}

export async function getAllScripts(
    db: IDBPDatabase<PrinChatDB>
): Promise<Script[]> {
    return db.getAll('scripts');
}

export async function deleteScript(
    db: IDBPDatabase<PrinChatDB>,
    id: string
): Promise<void> {
    await db.delete('scripts', id);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            scripts: Date.now()
        });
    }
}
