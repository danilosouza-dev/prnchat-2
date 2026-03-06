/**
 * Folders Store
 * Extracted from DatabaseService (db.ts) — Story 1.3
 *
 * Note: deleteFolder calls saveMessage and getAllMessages internally.
 * These are passed as callbacks to avoid circular imports.
 */

import type { IDBPDatabase } from 'idb';
import type { PrinChatDB } from '../db';
import type { Folder, Message } from '@/types';

export async function saveFolder(
    db: IDBPDatabase<PrinChatDB>,
    folder: Folder
): Promise<void> {
    await db.put('folders', folder);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            folders: Date.now()
        });
    }
}

export async function getFolder(
    db: IDBPDatabase<PrinChatDB>,
    id: string
): Promise<Folder | undefined> {
    return db.get('folders', id);
}

export async function getAllFolders(
    db: IDBPDatabase<PrinChatDB>
): Promise<Folder[]> {
    return db.getAll('folders');
}

export async function deleteFolder(
    db: IDBPDatabase<PrinChatDB>,
    id: string,
    getAllMessagesFn: () => Promise<Message[]>,
    saveMessageFn: (message: Message) => Promise<void>
): Promise<void> {
    await db.delete('folders', id);

    // Remove folderId from all messages that were in this folder
    const messages = await getAllMessagesFn();
    const messagesInFolder = messages.filter(msg => msg.folderId === id);

    for (const msg of messagesInFolder) {
        await saveMessageFn({ ...msg, folderId: undefined });
    }

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            folders: Date.now()
        });
    }
}
