/**
 * Schedules Store
 * Extracted from DatabaseService (db.ts) — Story 1.3
 */

import type { IDBPDatabase } from 'idb';
import type { PrinChatDB } from '../db';
import type { Schedule } from '@/types';
import { syncService } from '../../services/sync-service';
import { normalizeScope, matchesScope } from '../lead-utils';

export async function saveSchedule(
    db: IDBPDatabase<PrinChatDB>,
    schedule: Schedule
): Promise<void> {
    const scopedSchedule: Schedule = {
        ...schedule,
        instanceId: normalizeScope(schedule.instanceId),
    };
    await db.put('schedules', scopedSchedule);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            schedules: Date.now()
        });
    }

    // Trigger sync
    syncService.syncSchedule(scopedSchedule).catch(console.error);
}

export async function getSchedule(
    db: IDBPDatabase<PrinChatDB>,
    id: string,
    instanceId?: string
): Promise<Schedule | undefined> {
    const schedule = await db.get('schedules', id);
    if (!schedule) return undefined;
    return matchesScope(schedule, instanceId) ? schedule : undefined;
}

export async function getSchedulesByChatId(
    db: IDBPDatabase<PrinChatDB>,
    chatId: string,
    instanceId?: string
): Promise<Schedule[]> {
    const schedules = await db.getAllFromIndex('schedules', 'by-chatId', chatId);
    return schedules
        .filter((s) => matchesScope(s, instanceId))
        .sort((a, b) => a.scheduledTime - b.scheduledTime);
}

export async function getPendingSchedules(
    db: IDBPDatabase<PrinChatDB>,
    instanceId?: string
): Promise<Schedule[]> {
    const now = Date.now();
    const pendingSchedules = await db.getAllFromIndex('schedules', 'by-status', 'pending');

    // Filter to only return schedules that are due
    return pendingSchedules
        .filter((schedule) => matchesScope(schedule, instanceId))
        .filter(schedule => schedule.scheduledTime <= now)
        .sort((a, b) => a.scheduledTime - b.scheduledTime);
}

export async function getAllPendingSchedules(
    db: IDBPDatabase<PrinChatDB>,
    instanceId?: string
): Promise<Schedule[]> {
    const pending = await db.getAllFromIndex('schedules', 'by-status', 'pending');
    return pending.filter((schedule) => matchesScope(schedule, instanceId));
}

export async function updateScheduleStatus(
    db: IDBPDatabase<PrinChatDB>,
    id: string,
    status: 'pending' | 'paused' | 'completed' | 'cancelled' | 'failed',
    instanceId?: string
): Promise<void> {
    const schedule = await db.get('schedules', id);

    if (schedule && matchesScope(schedule, instanceId)) {
        await db.put('schedules', {
            ...schedule,
            status,
            updatedAt: Date.now()
        });

        // Trigger chrome.storage change event
        if (typeof chrome !== 'undefined' && chrome.storage) {
            await chrome.storage.local.set({
                schedules: Date.now()
            });
        }
    }
}

export async function getPausedSchedules(
    db: IDBPDatabase<PrinChatDB>,
    instanceId?: string
): Promise<Schedule[]> {
    const paused = await db.getAllFromIndex('schedules', 'by-status', 'paused');
    return paused.filter((schedule) => matchesScope(schedule, instanceId));
}

export async function getAllSchedules(
    db: IDBPDatabase<PrinChatDB>,
    instanceId?: string
): Promise<Schedule[]> {
    const schedules = await db.getAll('schedules');
    return schedules
        .filter((s) => matchesScope(s, instanceId))
        .sort((a, b) => a.scheduledTime - b.scheduledTime);
}

export async function deleteSchedule(
    db: IDBPDatabase<PrinChatDB>,
    id: string,
    instanceId?: string
): Promise<void> {
    const schedule = await db.get('schedules', id);
    if (!schedule || !matchesScope(schedule, instanceId)) {
        return;
    }
    await db.delete('schedules', id);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            schedules: Date.now()
        });
    }

    // Trigger sync
    syncService.deleteSchedule(id, schedule.instanceId).catch(console.error);
}
