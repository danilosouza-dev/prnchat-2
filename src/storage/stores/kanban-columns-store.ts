/**
 * Kanban Columns Store
 * Extracted from DatabaseService (db.ts) — Story 1.3
 */

import type { IDBPDatabase } from 'idb';
import type { PrinChatDB } from '../db';
import type { KanbanColumn } from '../../types/kanban';
import { DEFAULT_KANBAN_COLUMNS } from '../../types/kanban';
import { syncService } from '../../services/sync-service';
import { normalizeScope, matchesScope, normalizeAndMergeKanbanColumns } from '../lead-utils';

export async function initializeDefaultKanbanColumns(
    db: IDBPDatabase<PrinChatDB>,
    kanbanInitLocks: Map<string, Promise<void>>,
    instanceId: string
): Promise<void> {
    const scopedInstanceId = normalizeScope(instanceId);
    const inFlight = kanbanInitLocks.get(scopedInstanceId);
    if (inFlight) {
        await inFlight;
        return;
    }

    const initPromise = (async () => {
        const allColumns = await db.getAll('kanban_columns');
        const existingColumns = allColumns.filter((col) => matchesScope(col, scopedInstanceId));

        if (existingColumns.length === 0) {
            console.log('[PrinChat DB] Initializing default Kanban columns for instance:', scopedInstanceId);

            const now = Date.now();
            const instanceToken = scopedInstanceId.replace(/[^a-zA-Z0-9]/g, '_');

            for (const column of DEFAULT_KANBAN_COLUMNS) {
                const slug = column.name
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/^_+|_+$/g, '') || 'default';

                const kanbanColumn: KanbanColumn = {
                    ...column,
                    id: `kanban_col_${instanceToken}_${slug}`,
                    instanceId: scopedInstanceId,
                    createdAt: now,
                    updatedAt: now,
                };
                await db.put('kanban_columns', kanbanColumn);
                console.log('[PrinChat DB] Created default column:', kanbanColumn.name);
            }

            console.log('[PrinChat DB] ✅ Default Kanban columns initialized');
        }
    })();

    kanbanInitLocks.set(scopedInstanceId, initPromise);
    try {
        await initPromise;
    } finally {
        kanbanInitLocks.delete(scopedInstanceId);
    }
}

export async function saveKanbanColumn(
    db: IDBPDatabase<PrinChatDB>,
    column: KanbanColumn
): Promise<void> {
    const scopedColumn: KanbanColumn = {
        ...column,
        instanceId: normalizeScope(column.instanceId),
    };
    await db.put('kanban_columns', scopedColumn);

    // Trigger chrome.storage change event for real-time updates
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            kanban_columns: Date.now()
        });
    }

    // Trigger sync
    syncService.syncKanbanColumn(scopedColumn).catch(console.error);
}

export async function getKanbanColumn(
    db: IDBPDatabase<PrinChatDB>,
    id: string,
    instanceId?: string
): Promise<KanbanColumn | undefined> {
    const column = await db.get('kanban_columns', id);
    if (!column) return undefined;
    return matchesScope(column, instanceId) ? column : undefined;
}

export async function getAllKanbanColumns(
    db: IDBPDatabase<PrinChatDB>,
    kanbanInitLocks: Map<string, Promise<void>>,
    kanbanColumnNormalizationLocks: Map<string, Promise<void>>,
    instanceId?: string
): Promise<KanbanColumn[]> {
    if (instanceId) {
        await initializeDefaultKanbanColumns(db, kanbanInitLocks, instanceId);
        await normalizeAndMergeKanbanColumns(db, kanbanColumnNormalizationLocks, instanceId);
    }

    const columns = await db.getAllFromIndex('kanban_columns', 'by-order');
    const scoped = columns.filter((column) => matchesScope(column, instanceId));

    // Keep first column per normalized name to avoid duplicated defaults from legacy race conditions.
    const byName = new Map<string, KanbanColumn>();
    for (const column of scoped) {
        const key = column.name.trim().toLowerCase();
        if (!byName.has(key)) byName.set(key, column);
    }

    return Array.from(byName.values()).sort((a, b) => a.order - b.order);
}

export async function deleteKanbanColumn(
    db: IDBPDatabase<PrinChatDB>,
    id: string,
    instanceId?: string
): Promise<void> {
    const column = await db.get('kanban_columns', id);

    if (!column || !matchesScope(column, instanceId)) {
        throw new Error('Column not found');
    }

    if (!column.canDelete) {
        throw new Error('Cannot delete default column');
    }

    // Check if column has any leads
    const leads = await db.getAllFromIndex('kanban_leads', 'by-columnId', id);
    const scopedLeads = leads.filter((lead) => matchesScope(lead, instanceId));
    if (scopedLeads.length > 0) {
        throw new Error('Cannot delete column with leads. Move leads first.');
    }

    await db.delete('kanban_columns', id);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            kanban_columns: Date.now()
        });
    }

    // Trigger sync
    syncService.deleteKanbanColumn(id, column.instanceId).catch(console.error);
}

export async function updateColumnOrder(
    db: IDBPDatabase<PrinChatDB>,
    kanbanInitLocks: Map<string, Promise<void>>,
    kanbanColumnNormalizationLocks: Map<string, Promise<void>>,
    columnId: string,
    newOrder: number,
    instanceId?: string
): Promise<void> {
    const allColumns = await getAllKanbanColumns(db, kanbanInitLocks, kanbanColumnNormalizationLocks, instanceId);

    // Find the column to move
    const columnToMove = allColumns.find(c => c.id === columnId);
    if (!columnToMove) {
        throw new Error('Column not found');
    }

    const oldOrder = columnToMove.order;

    // Reorder columns
    const updatedColumns = allColumns.map(col => {
        if (col.id === columnId) {
            return { ...col, order: newOrder, updatedAt: Date.now() };
        } else {
            // Shift other columns
            if (oldOrder < newOrder) {
                // Moving right
                if (col.order > oldOrder && col.order <= newOrder) {
                    return { ...col, order: col.order - 1, updatedAt: Date.now() };
                }
            } else {
                // Moving left
                if (col.order >= newOrder && col.order < oldOrder) {
                    return { ...col, order: col.order + 1, updatedAt: Date.now() };
                }
            }
            return col;
        }
    });

    // Save all updated columns
    for (const col of updatedColumns) {
        await db.put('kanban_columns', col);
    }

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            kanban_columns: Date.now()
        });
    }

    // Sync all updated columns (for order update)
    for (const col of updatedColumns) {
        syncService.syncKanbanColumn(col).catch(console.error);
    }
}

export async function createKanbanColumn(
    db: IDBPDatabase<PrinChatDB>,
    kanbanInitLocks: Map<string, Promise<void>>,
    kanbanColumnNormalizationLocks: Map<string, Promise<void>>,
    name: string,
    color: string,
    description?: string,
    instanceId?: string
): Promise<KanbanColumn> {
    const scopedInstanceId = normalizeScope(instanceId);
    const existingColumns = await getAllKanbanColumns(db, kanbanInitLocks, kanbanColumnNormalizationLocks, scopedInstanceId);

    // Check for duplicate names
    if (existingColumns.some(col => col.name.toLowerCase() === name.toLowerCase())) {
        throw new Error('Column name already exists');
    }

    const now = Date.now();
    const instanceToken = scopedInstanceId.replace(/[^a-zA-Z0-9]/g, '_');
    const newColumn: KanbanColumn = {
        id: `kanban_col_${instanceToken}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        instanceId: scopedInstanceId,
        name,
        color,
        description,
        order: existingColumns.length,
        isDefault: false,
        canDelete: true,
        canEdit: true,
        createdAt: now,
        updatedAt: now,
    };

    await db.put('kanban_columns', newColumn);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            kanban_columns: Date.now()
        });
    }

    // Trigger sync
    syncService.syncKanbanColumn(newColumn).catch(console.error);

    return newColumn;
}

export async function updateKanbanColumn(
    db: IDBPDatabase<PrinChatDB>,
    kanbanInitLocks: Map<string, Promise<void>>,
    kanbanColumnNormalizationLocks: Map<string, Promise<void>>,
    id: string,
    updates: { name?: string; color?: string },
    instanceId?: string
): Promise<void> {
    const column = await db.get('kanban_columns', id);

    if (!column || !matchesScope(column, instanceId)) {
        throw new Error('Column not found');
    }

    if (!column.canEdit) {
        throw new Error('Cannot edit default column');
    }

    // Check for duplicate names if name is being updated
    if (updates.name && updates.name !== column.name) {
        const existingColumns = await getAllKanbanColumns(db, kanbanInitLocks, kanbanColumnNormalizationLocks, instanceId);
        if (existingColumns.some(col => col.id !== id && col.name.toLowerCase() === updates.name!.toLowerCase())) {
            throw new Error('Column name already exists');
        }
    }

    const updatedColumn: KanbanColumn = {
        ...column,
        ...updates,
        instanceId: normalizeScope(column.instanceId),
        updatedAt: Date.now(),
    };

    await db.put('kanban_columns', updatedColumn);

    // Trigger chrome.storage change event
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            kanban_columns: Date.now()
        });
    }

    // Trigger sync
    syncService.syncKanbanColumn(updatedColumn).catch(console.error);
}
