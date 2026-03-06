/**
 * Notes Store
 * Extracted from DatabaseService (db.ts) — Story 1.3
 */

import type { IDBPDatabase } from 'idb';
import type { PrinChatDB } from '../db';
import type { Note } from '@/types';
import { syncService } from '../../services/sync-service';
import { normalizeScope, matchesScope } from '../lead-utils';

export async function createNote(
    db: IDBPDatabase<PrinChatDB>,
    note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Note> {
    const now = Date.now();

    const newNote: Note = {
        ...note,
        instanceId: normalizeScope(note.instanceId),
        id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        createdAt: now,
        updatedAt: now,
    };

    await db.put('notes', newNote);
    console.log('[PrinChat DB] Note created:', newNote.id);

    // Trigger chrome.storage change event for real-time updates
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            notes: Date.now()
        });
    }

    // Trigger sync
    syncService.syncNote(newNote).catch(console.error);

    return newNote;
}

export async function getNotesByChatId(
    db: IDBPDatabase<PrinChatDB>,
    chatId: string,
    instanceId?: string
): Promise<Note[]> {
    console.log('[DB] getNotesByChatId called with chatId:', chatId);
    const notes = await db.getAllFromIndex('notes', 'by-chatId', chatId);
    console.log('[DB] getNotesByChatId found', notes.length, 'notes:', notes);
    // Sort by creation date descending (newest first)
    return notes
        .filter((n) => matchesScope(n, instanceId))
        .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getNote(
    db: IDBPDatabase<PrinChatDB>,
    id: string,
    instanceId?: string
): Promise<Note | undefined> {
    const note = await db.get('notes', id);
    if (!note) return undefined;
    return matchesScope(note, instanceId) ? note : undefined;
}

export async function updateNote(
    db: IDBPDatabase<PrinChatDB>,
    id: string,
    updates: Partial<Omit<Note, 'id' | 'createdAt'>>,
    instanceId?: string
): Promise<void> {
    const existingNote = await db.get('notes', id);

    if (!existingNote || !matchesScope(existingNote, instanceId)) {
        throw new Error(`Note with id ${id} not found`);
    }

    const updatedNote: Note = {
        ...existingNote,
        ...updates,
        instanceId: normalizeScope((updates as any)?.instanceId || existingNote.instanceId),
        updatedAt: Date.now(),
    };

    await db.put('notes', updatedNote);
    console.log('[PrinChat DB] Note updated:', id);

    // Trigger chrome.storage change event for real-time updates
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            notes: Date.now()
        });
    }

    // Trigger sync
    syncService.syncNote(updatedNote).catch(console.error);
}

export async function deleteNote(
    db: IDBPDatabase<PrinChatDB>,
    id: string,
    instanceId?: string
): Promise<void> {
    const note = await db.get('notes', id);
    if (!note || !matchesScope(note, instanceId)) {
        return;
    }
    await db.delete('notes', id);
    console.log('[PrinChat DB] Note deleted:', id);

    // Trigger chrome.storage change event for real-time updates
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            notes: Date.now()
        });
    }

    // Trigger sync
    syncService.deleteNote(id, note.instanceId).catch(console.error);
}

export async function getAllNotes(
    db: IDBPDatabase<PrinChatDB>,
    instanceId?: string
): Promise<Note[]> {
    const notes = await db.getAll('notes');
    // Sort by creation date descending (newest first)
    return notes
        .filter((n) => matchesScope(n, instanceId))
        .sort((a, b) => b.createdAt - a.createdAt);
}
