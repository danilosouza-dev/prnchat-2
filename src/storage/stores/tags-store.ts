/**
 * Tags Store
 * Extracted from DatabaseService (db.ts) — Story 1.3
 */

import type { IDBPDatabase } from 'idb';
import type { PrinChatDB } from '../db';
import type { Tag } from '@/types';
import { syncService } from '../../services/sync-service';

export async function saveTag(
    db: IDBPDatabase<PrinChatDB>,
    tag: Tag
): Promise<void> {
    await db.put('tags', tag);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            tags: Date.now()
        });
    }

    // Trigger sync
    syncService.syncTag(tag).catch(console.error);
}

export async function getTag(
    db: IDBPDatabase<PrinChatDB>,
    id: string
): Promise<Tag | undefined> {
    return db.get('tags', id);
}

export async function getAllTags(
    db: IDBPDatabase<PrinChatDB>
): Promise<Tag[]> {
    return db.getAll('tags');
}

export async function deleteTag(
    db: IDBPDatabase<PrinChatDB>,
    id: string
): Promise<void> {
    await db.delete('tags', id);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            tags: Date.now()
        });
    }

    // Trigger sync
    syncService.deleteTag(id).catch(console.error);
}
