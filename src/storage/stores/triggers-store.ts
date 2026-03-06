/**
 * Triggers Store
 * Extracted from DatabaseService (db.ts) — Story 1.3
 */

import type { IDBPDatabase } from 'idb';
import type { PrinChatDB } from '../db';
import type { Trigger } from '@/types';

export async function saveTrigger(
    db: IDBPDatabase<PrinChatDB>,
    trigger: Trigger
): Promise<void> {
    await db.put('triggers', trigger);
}

export async function getTrigger(
    db: IDBPDatabase<PrinChatDB>,
    id: string
): Promise<Trigger | undefined> {
    return db.get('triggers', id);
}

export async function getAllTriggers(
    db: IDBPDatabase<PrinChatDB>
): Promise<Trigger[]> {
    return db.getAll('triggers');
}

export async function getEnabledTriggers(
    db: IDBPDatabase<PrinChatDB>
): Promise<Trigger[]> {
    return db.getAllFromIndex('triggers', 'by-enabled', 1);
}

export async function deleteTrigger(
    db: IDBPDatabase<PrinChatDB>,
    id: string
): Promise<void> {
    await db.delete('triggers', id);
}
