/**
 * Signatures Store
 * Extracted from DatabaseService (db.ts) — Story 1.3
 */

import type { IDBPDatabase } from 'idb';
import type { PrinChatDB } from '../db';
import type { Signature } from '@/types';
import { syncService } from '../../services/sync-service';

export async function saveSignature(
    db: IDBPDatabase<PrinChatDB>,
    signature: Signature
): Promise<void> {
    await db.put('signatures', signature);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            signatures: Date.now()
        });
    }

    // Trigger sync
    syncService.syncSignature(signature).catch(console.error);
}

export async function getAllSignatures(
    db: IDBPDatabase<PrinChatDB>
): Promise<Signature[]> {
    const signatures = await db.getAllFromIndex('signatures', 'by-created');
    return signatures.reverse(); // Most recent first
}

export async function getSignature(
    db: IDBPDatabase<PrinChatDB>,
    id: string
): Promise<Signature | undefined> {
    return db.get('signatures', id);
}

export async function getActiveSignature(
    db: IDBPDatabase<PrinChatDB>
): Promise<Signature | undefined> {
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

export async function setActiveSignature(
    db: IDBPDatabase<PrinChatDB>,
    id: string
): Promise<void> {
    // Get all signatures
    const allSignatures = await getAllSignatures(db);

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

export async function deleteSignature(
    db: IDBPDatabase<PrinChatDB>,
    id: string
): Promise<void> {
    await db.delete('signatures', id);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            signatures: Date.now()
        });
    }
}
