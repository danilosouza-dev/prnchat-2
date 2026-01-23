import { getSupabaseClient } from './supabase-client';
import type { LeadContact, KanbanColumn } from '../types/kanban';
import type { Note, Schedule } from '../types';

class SyncService {

    // ==================== LEADS (Kanban Cards) ====================

    async syncLead(lead: LeadContact) {
        try {
            const supabase = await getSupabaseClient();
            if (!supabase) return; // Not logged in or offline

            let photoUrl = lead.photo;

            // Check if photo needs upload (is Base64)
            if (photoUrl && photoUrl.startsWith('data:')) {
                try {
                    console.log('[PrinChat Sync] Uploading lead photo...');
                    // Convert Base64 to Blob
                    const response = await fetch(photoUrl);
                    const blob = await response.blob();

                    // Upload
                    const { mediaService } = await import('./media-service');
                    const publicUrl = await mediaService.uploadMedia(blob, `lead-photo-${lead.id}`);
                    photoUrl = publicUrl;

                    // Update Local DB with the new URL so we don't upload again
                    const { db } = await import('../storage/db');
                    await db.updateLead(lead.id, { photo: photoUrl });
                    console.log('[PrinChat Sync] Local lead photo updated to URL');

                } catch (uploadError) {
                    console.error('[PrinChat Sync] Failed to upload photo, skipping photo sync:', uploadError);
                    photoUrl = undefined;
                }
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.warn('[PrinChat Sync] No authenticated user found for syncLead');
                return;
            }

            const { error } = await supabase
                .from('leads')
                .upsert({
                    chat_id: lead.id, // lead.id is phone number/chatId
                    user_id: user.id, // REQUIRED for RLS
                    column_id: lead.columnId,
                    order: lead.order,
                    name: lead.name,
                    phone: lead.phone,
                    photo_url: photoUrl,
                    unread_count: lead.unreadCount,
                    last_message: lead.lastMessage ? { content: lead.lastMessage } : null,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id, chat_id' });

            if (error) throw error;
            console.log('[PrinChat Sync] Lead synced:', lead.name);
        } catch (error) {
            console.error('[PrinChat Sync] Error syncing lead:', JSON.stringify(error, null, 2));
            // Also log raw in case stringify fails
            console.error('[PrinChat Sync] Raw lead error:', error);
        }
    }

    async deleteLead(leadId: string) {
        try {
            const supabase = await getSupabaseClient();
            if (!supabase) return;

            const { error } = await supabase
                .from('leads')
                .delete()
                .eq('chat_id', leadId);

            if (error) throw error;
            console.log('[PrinChat Sync] Lead deleted:', leadId);
        } catch (error) {
            console.error('[PrinChat Sync] Error deleting lead:', JSON.stringify(error, null, 2));
        }
    }

    // ==================== KANBAN COLUMNS ====================

    async syncKanbanColumn(column: KanbanColumn) {
        try {
            const supabase = await getSupabaseClient();
            if (!supabase) return;

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase
                .from('kanban_columns')
                .upsert({
                    id: column.id, // TEXT ID
                    user_id: user.id, // REQUIRED for RLS
                    name: column.name,
                    color: column.color,
                    order: column.order,
                    is_default: column.isDefault,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;
            console.log('[PrinChat Sync] Column synced:', column.name);
        } catch (error) {
            console.error('[PrinChat Sync] Error syncing column:', JSON.stringify(error, null, 2));
        }
    }

    async deleteKanbanColumn(columnId: string) {
        try {
            const supabase = await getSupabaseClient();
            if (!supabase) return;

            const { error } = await supabase
                .from('kanban_columns')
                .delete()
                .eq('id', columnId);

            if (error) throw error;
            console.log('[PrinChat Sync] Column deleted:', columnId);
        } catch (error) {
            console.error('[PrinChat Sync] Error deleting column:', JSON.stringify(error, null, 2));
        }
    }

    // ==================== NOTES ====================

    async syncNote(note: Note) {
        try {
            const supabase = await getSupabaseClient();
            if (!supabase) return;

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase
                .from('notes')
                .upsert({
                    id: note.id,
                    user_id: user.id, // REQUIRED for RLS
                    chat_id: note.chatId,
                    content: note.content,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;
            console.log('[PrinChat Sync] Note synced:', note.id);
        } catch (error) {
            console.error('[PrinChat Sync] Error syncing note:', JSON.stringify(error, null, 2));
        }
    }

    async deleteNote(noteId: string) {
        try {
            const supabase = await getSupabaseClient();
            if (!supabase) return;

            const { error } = await supabase
                .from('notes')
                .delete()
                .eq('id', noteId);

            if (error) throw error;
            console.log('[PrinChat Sync] Note deleted:', noteId);
        } catch (error) {
            console.error('[PrinChat Sync] Error deleting note:', JSON.stringify(error, null, 2));
        }
    }

    // ==================== SCHEDULES ====================

    async syncSchedule(schedule: Schedule) {
        try {
            const supabase = await getSupabaseClient();
            if (!supabase) return;

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase
                .from('schedules')
                .upsert({
                    id: schedule.id,
                    user_id: user.id, // REQUIRED for RLS
                    chat_id: schedule.chatId,
                    content: schedule.itemName || 'Scheduled Item',
                    scheduled_time: new Date(schedule.scheduledTime).toISOString(),
                    status: schedule.status,
                    attachment_url: null,
                    media_type: schedule.type,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;
            console.log('[PrinChat Sync] Schedule synced:', schedule.id);
        } catch (error) {
            console.error('[PrinChat Sync] Error syncing schedule:', JSON.stringify(error, null, 2));
        }
    }

    async deleteSchedule(scheduleId: string) {
        try {
            const supabase = await getSupabaseClient();
            if (!supabase) return;

            const { error } = await supabase
                .from('schedules')
                .delete()
                .eq('id', scheduleId);

            if (error) throw error;
            console.log('[PrinChat Sync] Schedule deleted:', scheduleId);
        } catch (error) {
            console.error('[PrinChat Sync] Error deleting schedule:', JSON.stringify(error, null, 2));
        }
    }

    // ==================== INITIAL SYNC ====================

    /**
     * Fetch all data from Supabase and populate local IndexedDB
     * Used on login or extension startup
     */
    async fetchAndSyncInitialData() {
        console.log('[PrinChat Sync] Starting initial data sync...');
        const supabase = await getSupabaseClient();
        if (!supabase) {
            console.warn('[PrinChat Sync] Cannot sync: Supabase client not available (check auth)');
            return;
        }

        try {
            // Dynamic import to avoid circular dependency
            const { db } = await import('../storage/db');
            const database = await db.init();
            const tx = database.transaction(
                ['kanban_columns', 'kanban_leads', 'notes', 'schedules'],
                'readwrite'
            );

            // 1. Kanban Columns
            const { data: columns, error: colError } = await supabase
                .from('kanban_columns')
                .select('*')
                .order('order');

            if (colError) throw colError;
            if (columns) {
                console.log(`[PrinChat Sync] Fetched ${columns.length} columns`);
                for (const col of columns) {
                    await tx.objectStore('kanban_columns').put({
                        id: col.id,
                        name: col.name,
                        color: col.color,
                        description: '',
                        order: col.order,
                        isDefault: col.is_default,
                        canDelete: !col.is_default,
                        canEdit: !col.is_default,
                        createdAt: new Date(col.created_at).getTime(),
                        updatedAt: new Date(col.updated_at).getTime()
                    });
                }
            }

            // 2. Leads
            const { data: leads, error: leadError } = await supabase
                .from('leads')
                .select('*');

            if (leadError) throw leadError;
            if (leads) {
                console.log(`[PrinChat Sync] Fetched ${leads.length} leads`);
                for (const lead of leads) {
                    // Parse last message if it's JSON
                    let lastMessageStr = '';
                    if (lead.last_message && typeof lead.last_message === 'object') {
                        lastMessageStr = (lead.last_message as any).content || '';
                    } else if (typeof lead.last_message === 'string') {
                        try {
                            const parsed = JSON.parse(lead.last_message);
                            lastMessageStr = parsed.content || parsed;
                        } catch {
                            lastMessageStr = lead.last_message;
                        }
                    }

                    await tx.objectStore('kanban_leads').put({
                        id: lead.chat_id,
                        chatId: lead.chat_id,
                        name: lead.name,
                        phone: lead.phone,
                        photo: lead.photo_url,
                        columnId: lead.column_id,
                        order: lead.order,
                        unreadCount: lead.unread_count,
                        lastMessage: lastMessageStr,
                        createdAt: new Date(lead.created_at).getTime(),
                        updatedAt: new Date(lead.updated_at).getTime(),
                        // Defaults
                        notes: '',
                        tags: [],
                    });
                }
            }

            // 3. Notes
            const { data: notes, error: noteError } = await supabase
                .from('notes')
                .select('*');

            if (noteError) throw noteError;
            if (notes) {
                console.log(`[PrinChat Sync] Fetched ${notes.length} notes`);
                for (const note of notes) {
                    await tx.objectStore('notes').put({
                        id: note.id,
                        chatId: note.chat_id,
                        content: note.content,
                        chatName: note.chat_id, // Fallback
                        title: '',
                        createdAt: new Date(note.created_at).getTime(),
                        updatedAt: new Date(note.updated_at).getTime()
                    });
                }
            }

            // 4. Schedules
            const { data: schedules, error: schedError } = await supabase
                .from('schedules')
                .select('*');

            if (schedError) throw schedError;
            if (schedules) {
                console.log(`[PrinChat Sync] Fetched ${schedules.length} schedules`);
                for (const s of schedules) {
                    await tx.objectStore('schedules').put({
                        id: s.id,
                        itemId: s.id, // Fallback
                        chatId: s.chat_id,
                        itemName: s.content,
                        chatName: s.chat_id, // Fallback
                        scheduledTime: new Date(s.scheduled_time).getTime(),
                        status: s.status as any,
                        // Mapping fallback
                        type: (s.media_type as any) || 'message',
                        // fileName: removed as it doesn't exist in Schedule type
                        createdAt: new Date(s.created_at).getTime(),
                        updatedAt: new Date(s.updated_at).getTime()
                    });
                }
            }

            console.log('[PrinChat Sync] Initial sync complete.');

        } catch (error) {
            console.error('[PrinChat Sync] Error during initial sync:', JSON.stringify(error, null, 2));
            // Also log raw error in case it's an Error object which stringify might miss
            console.error('[PrinChat Sync] Raw error:', error);
        }
    }
}

export const syncService = new SyncService();
