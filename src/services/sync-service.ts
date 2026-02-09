import { getSupabaseClient } from './supabase-client';
import { type LeadContact, type KanbanColumn, DEFAULT_KANBAN_COLUMNS } from '../types/kanban';
import type { Note, Schedule, Script, Signature, Trigger, Tag } from '../types';
import { mediaService } from './media-service';
import { db } from '../storage/db';
import { buildScopedLeadId, normalizeChatIdentity, normalizeInstanceId } from '../utils/instance-scope';

class SyncService {
    private readonly scopedColumnName = 'whatsapp_instance_id';
    private cloudSyncDisabledByPermission = false;
    private loggedPermissionDisable = false;

    private getScopeOrNull(instanceId?: string): string | null {
        if (typeof instanceId !== 'string' || !instanceId.trim()) {
            return null;
        }
        return normalizeInstanceId(instanceId);
    }

    private getLeadIdentity(lead: Pick<LeadContact, 'id' | 'chatId' | 'phone'>): string {
        const identity = normalizeChatIdentity(lead.chatId || lead.phone || lead.id);
        return identity || String(lead.chatId || lead.phone || lead.id || '');
    }

    private hasRenderablePhoto(photo?: string): boolean {
        if (typeof photo !== 'string') return false;
        const src = photo.trim();
        if (!src || src === 'data:' || src === 'about:blank') return false;
        if (this.isLikelyPlaceholderPhotoUrl(src)) return false;
        if (/^https?:\/\//i.test(src)) return true;
        if (src.startsWith('blob:')) return true;
        if (/^data:image\//i.test(src) && !/^data:image\/svg/i.test(src)) return true;
        if (src.startsWith('//')) return true;
        return false;
    }

    private isLikelyPlaceholderPhotoUrl(photo?: string): boolean {
        if (typeof photo !== 'string') return true;
        const src = photo.trim();
        if (!src) return true;

        const lower = src.toLowerCase();
        if (lower.includes('ui-avatars.com')) return true;

        try {
            const parsed = new URL(src.startsWith('//') ? `https:${src}` : src);
            const host = parsed.hostname.toLowerCase();
            const path = parsed.pathname.toLowerCase();
            const looksAvatarPath =
                path.includes('avatar')
                || path.includes('default-user')
                || path.includes('default-group')
                || path.includes('profile-placeholder');

            if (host === 'web.whatsapp.com' && (looksAvatarPath || path.endsWith('.svg'))) {
                return true;
            }
            if (looksAvatarPath && path.endsWith('.svg')) {
                return true;
            }
        } catch (_error) {
            if (lower.includes('avatar') && lower.includes('.svg')) return true;
        }

        return false;
    }

    private isMissingScopedColumn(error: any): boolean {
        const msg = String(error?.message || error || '').toLowerCase();
        return msg.includes(this.scopedColumnName) && msg.includes('column');
    }

    private isPermissionDenied(error: any): boolean {
        const code = String(error?.code || '');
        const msg = String(error?.message || error || '').toLowerCase();
        return code === '42501' || msg.includes('permission denied');
    }

    private disableCloudSyncByPermission(context: string, error: any): void {
        this.cloudSyncDisabledByPermission = true;
        if (!this.loggedPermissionDisable) {
            this.loggedPermissionDisable = true;
            console.warn(`[PrinChat Sync] Cloud sync disabled due to permission error (${context}). Local mode remains active.`, error);
        }
    }

    private handlePermissionDenied(context: string, error: any): boolean {
        if (!this.isPermissionDenied(error)) return false;
        this.disableCloudSyncByPermission(context, error);
        return true;
    }

    // ==================== LEADS (Kanban Cards) ====================

    async syncLead(lead: LeadContact) {
        try {
            if (this.cloudSyncDisabledByPermission) return;
            const supabase = await getSupabaseClient();
            if (!supabase) return; // Not logged in or offline
            const scope = this.getScopeOrNull(lead.instanceId);
            if (!scope) {
                console.warn('[PrinChat Sync] Skipping lead sync: missing instanceId');
                return;
            }
            const leadIdentity = this.getLeadIdentity(lead);
            const scopedLeadId = lead.id?.includes('::') ? lead.id : buildScopedLeadId(scope, leadIdentity);

            let photoUrl = lead.photo;

            // Check if photo needs upload (is Base64)
            if (photoUrl && photoUrl.startsWith('data:')) {
                try {
                    console.log('[PrinChat Sync] Uploading lead photo...');
                    // Convert Base64 to Blob
                    const response = await fetch(photoUrl);
                    const blob = await response.blob();

                    // Upload
                    const publicUrl = await mediaService.uploadMedia(blob, `lead-photo-${lead.id}`);
                    photoUrl = publicUrl;

                    // Update Local DB with the new URL so we don't upload again
                    await db.updateLead(lead.id, { photo: photoUrl }, scope);
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

            // VALIDATION: Check if column_id exists in Supabase before syncing
            let validColumnId: string | undefined = lead.columnId;

            if (validColumnId) {
                const { data: columnCheck, error: columnCheckError } = await supabase
                    .from('kanban_columns')
                    .select('id')
                    .eq('id', validColumnId)
                    .eq(this.scopedColumnName, scope)
                    .single();

                if (columnCheckError && this.isMissingScopedColumn(columnCheckError)) {
                    console.warn('[PrinChat Sync] Scoped columns not migrated yet. Skipping lead cloud sync to avoid data mixing.');
                    return;
                }
                if (columnCheckError && this.handlePermissionDenied('leads.column-check', columnCheckError)) {
                    return;
                }

                if (!columnCheck) {
                    console.warn(`[PrinChat Sync] ⚠️ Column ${validColumnId} not found in Supabase. Setting to NULL to prevent foreign key error.`);
                    validColumnId = undefined;

                    // Also update local DB to reflect this change
                    try {
                        await db.updateLead(lead.id, { columnId: undefined }, scope);
                        console.log(`[PrinChat Sync] 🔄 Updated local lead ${lead.name} to have NULL column_id`);
                    } catch (localUpdateError) {
                        console.warn('[PrinChat Sync] Could not update local column_id:', localUpdateError);
                    }
                }
            }

            const { data, error } = await supabase
                .from('leads')
                .upsert({
                    id: scopedLeadId,
                    chat_id: leadIdentity,
                    whatsapp_instance_id: scope,
                    user_id: user.id, // REQUIRED for RLS
                    column_id: validColumnId, // Use validated column_id (may be null)
                    order: lead.order,
                    name: lead.name,
                    phone: lead.phone,
                    photo_url: photoUrl,
                    unread_count: lead.unreadCount,
                    last_message: lead.lastMessage ? { content: lead.lastMessage } : null,
                    tags: lead.tags || [], // Fix: Include tags
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id, whatsapp_instance_id, chat_id' })
                .select();

            if (error) {
                if (this.isMissingScopedColumn(error)) {
                    console.warn('[PrinChat Sync] Scoped leads not migrated yet. Skipping lead cloud sync to avoid data mixing.');
                    return;
                }
                if (this.handlePermissionDenied('leads.upsert', error)) {
                    return;
                }
                throw error;
            }
            if (!data || data.length === 0) {
                throw new Error(`RLS Verification Failed: Lead not saved for ${lead.name}`);
            }

            console.log('[PrinChat Sync] Lead synced:', lead.name);
        } catch (error) {
            if (this.handlePermissionDenied('leads.catch', error)) {
                return;
            }
            console.error('[PrinChat Sync] Error syncing lead:', JSON.stringify(error, null, 2));
            throw error;
        }
    }

    async deleteLead(leadId: string, instanceId?: string, chatId?: string) {
        try {
            if (this.cloudSyncDisabledByPermission) return;
            const supabase = await getSupabaseClient();
            if (!supabase) return;
            const scope = this.getScopeOrNull(instanceId);
            if (!scope) {
                console.warn('[PrinChat Sync] Skipping lead delete sync: missing instanceId');
                return;
            }

            const leadIdentity = normalizeChatIdentity(chatId || leadId) || String(chatId || leadId || '');
            const fallbackScopedId = buildScopedLeadId(scope, leadIdentity);

            const { error } = await supabase
                .from('leads')
                .delete()
                .eq(this.scopedColumnName, scope)
                .eq('chat_id', leadIdentity);

            if (error) {
                if (this.isMissingScopedColumn(error)) {
                    console.warn('[PrinChat Sync] Scoped leads not migrated yet. Skipping lead delete cloud sync.');
                    return;
                }
                if (this.handlePermissionDenied('leads.delete', error)) {
                    return;
                }
                throw error;
            }

            // Cleanup compatibility rows stored by incorrect keying in older versions.
            if (leadId) {
                await supabase
                    .from('leads')
                    .delete()
                    .eq(this.scopedColumnName, scope)
                    .eq('id', leadId);
            }

            if (fallbackScopedId !== leadId) {
                await supabase
                    .from('leads')
                    .delete()
                    .eq(this.scopedColumnName, scope)
                    .eq('id', fallbackScopedId);
            }

            console.log('[PrinChat Sync] Lead deleted:', leadId);
        } catch (error) {
            if (this.handlePermissionDenied('leads.delete.catch', error)) {
                return;
            }
            console.error('[PrinChat Sync] Error deleting lead:', JSON.stringify(error, null, 2));
        }
    }

    // ==================== KANBAN COLUMNS ====================

    async syncKanbanColumn(column: KanbanColumn): Promise<boolean> {
        try {
            if (this.cloudSyncDisabledByPermission) return false;
            const supabase = await getSupabaseClient();
            if (!supabase) return false;
            const scope = this.getScopeOrNull(column.instanceId);
            if (!scope) {
                console.warn('[PrinChat Sync] Skipping column sync: missing instanceId');
                return false;
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return false;

            console.log('[PrinChat Sync] Syncing column with User ID:', user.id);

            const { data, error } = await supabase
                .from('kanban_columns')
                .upsert({
                    id: column.id, // TEXT ID
                    whatsapp_instance_id: scope,
                    user_id: user.id, // REQUIRED for RLS
                    name: column.name,
                    color: column.color,
                    order: column.order,
                    is_default: column.isDefault,
                    updated_at: new Date().toISOString()
                })
                .select(); // IMPORTANT: Request return data to verify RLS

            if (error) {
                if (this.isMissingScopedColumn(error)) {
                    console.warn('[PrinChat Sync] Scoped kanban_columns not migrated yet. Skipping column cloud sync.');
                    return false;
                }
                if (this.handlePermissionDenied('kanban_columns.upsert', error)) {
                    return false;
                }
                throw error;
            }

            // If RLS allows INSERT but denies SELECT, data might be empty depending on policy
            // If RLS denies INSERT, error should be thrown.
            // If data is empty but no error, it might mean the row wasn't inserted?
            if (!data || data.length === 0) {
                console.warn('[PrinChat Sync] Warning: Column synced but no data returned. RLS Policy issue?');
                // Don't throw yet, just log. Or should we throw?
                // If the policy "Users can view their own columns" exists, we SHOULD see data.
                // If we don't, it implies the insert didn't happen or we can't see it.
                throw new Error(`RLS Verification Failed: Row not returned for column ${column.name}`);
            }

            console.log('[PrinChat Sync] Column synced:', column.name);
            return true;
        } catch (error) {
            if (this.handlePermissionDenied('kanban_columns.catch', error)) {
                return false;
            }
            console.error('[PrinChat Sync] Error syncing column:', JSON.stringify(error, null, 2));
            throw error;
        }
    }

    async deleteKanbanColumn(columnId: string, instanceId?: string) {
        try {
            const supabase = await getSupabaseClient();
            if (!supabase) return;
            const scope = this.getScopeOrNull(instanceId);
            if (!scope) {
                console.warn('[PrinChat Sync] Skipping column delete sync: missing instanceId');
                return;
            }

            const { error } = await supabase
                .from('kanban_columns')
                .delete()
                .eq('id', columnId)
                .eq(this.scopedColumnName, scope);

            if (error) throw error;
            console.log('[PrinChat Sync] Column deleted:', columnId);
        } catch (error) {
            console.error('[PrinChat Sync] Error deleting column:', JSON.stringify(error, null, 2));
        }
    }

    // ==================== NOTES ====================

    async syncNote(note: Note) {
        try {
            if (this.cloudSyncDisabledByPermission) return { outcome: 'local_only', details: 'Cloud sync disabled by permission' };
            const supabase = await getSupabaseClient();
            if (!supabase) return;
            const scope = this.getScopeOrNull(note.instanceId);
            if (!scope) {
                console.warn('[PrinChat Sync] Skipping note sync: missing instanceId');
                return { outcome: 'skipped', details: 'Missing instanceId' };
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase
                .from('notes')
                .upsert({
                    id: note.id,
                    whatsapp_instance_id: scope,
                    user_id: user.id, // REQUIRED for RLS
                    chat_id: note.chatId,
                    content: note.content,
                    updated_at: new Date().toISOString()
                });

            if (error) {
                if (this.isMissingScopedColumn(error)) {
                    console.warn('[PrinChat Sync] Scoped notes not migrated yet. Skipping note cloud sync.');
                    return { outcome: 'skipped', details: 'Scoped notes column not available yet' };
                }
                if (this.handlePermissionDenied('notes.upsert', error)) {
                    return { outcome: 'local_only', details: 'Cloud permission denied' };
                }
                throw error;
            }
            console.log('[PrinChat Sync] Note synced:', note.id);
            return { outcome: 'success', details: `Note ${note.id} synced successfully` };

        } catch (error: any) {
            if (this.handlePermissionDenied('notes.catch', error)) {
                return { outcome: 'local_only', details: 'Cloud permission denied' };
            }
            console.error('[PrinChat Sync] Error syncing note:', JSON.stringify(error, null, 2));
            return { outcome: 'error', details: error.message || String(error) };
        }
    }

    async deleteNote(noteId: string, instanceId?: string) {
        try {
            const supabase = await getSupabaseClient();
            if (!supabase) return;
            const scope = this.getScopeOrNull(instanceId);
            if (!scope) {
                console.warn('[PrinChat Sync] Skipping note delete sync: missing instanceId');
                return;
            }

            const { error } = await supabase
                .from('notes')
                .delete()
                .eq('id', noteId)
                .eq(this.scopedColumnName, scope);

            if (error) throw error;
            console.log('[PrinChat Sync] Note deleted:', noteId);
        } catch (error) {
            console.error('[PrinChat Sync] Error deleting note:', JSON.stringify(error, null, 2));
        }
    }

    // ==================== SCHEDULES ====================

    async syncSchedule(schedule: Schedule) {
        try {
            if (this.cloudSyncDisabledByPermission) return;
            const supabase = await getSupabaseClient();
            if (!supabase) return;
            const scope = this.getScopeOrNull(schedule.instanceId);
            if (!scope) {
                console.warn('[PrinChat Sync] Skipping schedule sync: missing instanceId');
                return;
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase
                .from('schedules')
                .upsert({
                    id: schedule.id,
                    whatsapp_instance_id: scope,
                    user_id: user.id, // REQUIRED for RLS
                    chat_id: schedule.chatId,
                    content: schedule.itemName || 'Scheduled Item',
                    scheduled_time: new Date(schedule.scheduledTime).toISOString(),
                    status: schedule.status,
                    attachment_url: null,
                    media_type: schedule.type,
                    updated_at: new Date().toISOString()
                });

            if (error) {
                if (this.isMissingScopedColumn(error)) {
                    console.warn('[PrinChat Sync] Scoped schedules not migrated yet. Skipping schedule cloud sync.');
                    return;
                }
                if (this.handlePermissionDenied('schedules.upsert', error)) {
                    return;
                }
                throw error;
            }
            console.log('[PrinChat Sync] Schedule synced:', schedule.id);
        } catch (error) {
            if (this.handlePermissionDenied('schedules.catch', error)) {
                return;
            }
            console.error('[PrinChat Sync] Error syncing schedule:', JSON.stringify(error, null, 2));
        }
    }

    async deleteSchedule(scheduleId: string, instanceId?: string) {
        try {
            const supabase = await getSupabaseClient();
            if (!supabase) return;
            const scope = this.getScopeOrNull(instanceId);
            if (!scope) {
                console.warn('[PrinChat Sync] Skipping schedule delete sync: missing instanceId');
                return;
            }

            const { error } = await supabase
                .from('schedules')
                .delete()
                .eq('id', scheduleId)
                .eq(this.scopedColumnName, scope);

            if (error) throw error;
            console.log('[PrinChat Sync] Schedule deleted:', scheduleId);
        } catch (error) {
            console.error('[PrinChat Sync] Error deleting schedule:', JSON.stringify(error, null, 2));
        }
    }

    // ==================== SCRIPTS ====================

    async syncScript(script: Script) {
        try {
            if (this.cloudSyncDisabledByPermission) return;
            const supabase = await getSupabaseClient();
            if (!supabase) return;

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('scripts')
                .upsert({
                    id: script.id,
                    user_id: user.id,
                    title: script.title || script.name || 'Sem Título',
                    content: script.content || JSON.stringify(script.steps || []),
                    tags: script.tags || [],
                    usage_count: script.usageCount || 0,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' }) // ID is PK, sufficient
                .select();

            if (error) {
                if (this.handlePermissionDenied('scripts.upsert', error)) {
                    return;
                }
                throw error;
            }
            if (!data || data.length === 0) {
                throw new Error(`RLS Verification Failed: Script not saved for ${script.title || script.name}`);
            }

            console.log('[PrinChat Sync] Script synced:', script.title || script.name);
        } catch (error) {
            if (this.handlePermissionDenied('scripts.catch', error)) {
                return;
            }
            console.error('[PrinChat Sync] Error syncing script:', JSON.stringify(error, null, 2));
            throw error;
        }
    }

    async deleteScript(scriptId: string) {
        try {
            const supabase = await getSupabaseClient();
            if (!supabase) return;

            const { error } = await supabase
                .from('scripts')
                .delete()
                .eq('id', scriptId);

            if (error) throw error;
            console.log('[PrinChat Sync] Script deleted:', scriptId);
        } catch (error) {
            console.error('[PrinChat Sync] Error deleting script:', JSON.stringify(error, null, 2));
        }
    }

    // ==================== SIGNATURES ====================

    async syncSignature(signature: Signature) {
        try {
            if (this.cloudSyncDisabledByPermission) return;
            const supabase = await getSupabaseClient();
            if (!supabase) return;

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('signatures')
                .upsert({
                    id: signature.id,
                    user_id: user.id,
                    title: signature.title || 'Assinatura',
                    content: signature.content || signature.text || '',
                    is_active: signature.isActive,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' }) // ID is PK
                .select();

            if (error) {
                if (this.handlePermissionDenied('signatures.upsert', error)) {
                    return;
                }
                throw error;
            }
            if (!data || data.length === 0) {
                throw new Error(`RLS Verification Failed: Signature not saved for ${signature.title}`);
            }

            console.log('[PrinChat Sync] Signature synced:', signature.title);
        } catch (error) {
            if (this.handlePermissionDenied('signatures.catch', error)) {
                return;
            }
            console.error('[PrinChat Sync] Error syncing signature:', JSON.stringify(error, null, 2));
            throw error;
        }
    }

    async deleteSignature(signatureId: string) {
        try {
            const supabase = await getSupabaseClient();
            if (!supabase) return;

            const { error } = await supabase
                .from('signatures')
                .delete()
                .eq('id', signatureId);

            if (error) throw error;
            console.log('[PrinChat Sync] Signature deleted:', signatureId);
        } catch (error) {
            console.error('[PrinChat Sync] Error deleting signature:', JSON.stringify(error, null, 2));
        }
    }

    // ==================== TRIGGERS ====================

    async syncTrigger(trigger: Trigger) {
        try {
            if (this.cloudSyncDisabledByPermission) return;
            const supabase = await getSupabaseClient();
            if (!supabase) return;

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('triggers')
                .upsert({
                    id: trigger.id,
                    user_id: user.id,
                    name: trigger.name,
                    description: trigger.description,
                    enabled: trigger.enabled,
                    conditions: trigger.conditions || [],
                    script_id: trigger.scriptId,
                    skip_contacts: trigger.skipContacts || false,
                    skip_groups: trigger.skipGroups || false,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' })
                .select();

            if (error) {
                if (this.handlePermissionDenied('triggers.upsert', error)) {
                    return;
                }
                throw error;
            }
            if (!data || data.length === 0) {
                throw new Error(`RLS Verification Failed: Trigger not saved for ${trigger.name}`);
            }

            console.log('[PrinChat Sync] Trigger synced:', trigger.name);
        } catch (error) {
            if (this.handlePermissionDenied('triggers.catch', error)) {
                return;
            }
            console.error('[PrinChat Sync] Error syncing trigger:', JSON.stringify(error, null, 2));
            throw error;
        }
    }

    async deleteTrigger(triggerId: string) {
        try {
            const supabase = await getSupabaseClient();
            if (!supabase) return;

            const { error } = await supabase
                .from('triggers')
                .delete()
                .eq('id', triggerId);

            if (error) throw error;
            console.log('[PrinChat Sync] Trigger deleted:', triggerId);
        } catch (error) {
            console.error('[PrinChat Sync] Error deleting trigger:', JSON.stringify(error, null, 2));
        }
    }

    // ==================== TAGS ====================

    async syncTag(tag: Tag) {
        try {
            if (this.cloudSyncDisabledByPermission) return;
            const supabase = await getSupabaseClient();
            if (!supabase) return;

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('tags')
                .upsert({
                    id: tag.id,
                    user_id: user.id,
                    name: tag.name,
                    color: tag.color,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' })
                .select();

            if (error) {
                if (this.handlePermissionDenied('tags.upsert', error)) {
                    return;
                }
                throw error;
            }
            if (!data || data.length === 0) {
                throw new Error(`RLS Verification Failed: Tag not saved for ${tag.name}`);
            }

            console.log('[PrinChat Sync] Tag synced:', tag.name);
        } catch (error) {
            if (this.handlePermissionDenied('tags.catch', error)) {
                return;
            }
            console.error('[PrinChat Sync] Error syncing tag:', JSON.stringify(error, null, 2));
            throw error;
        }
    }

    async deleteTag(tagId: string) {
        try {
            const supabase = await getSupabaseClient();
            if (!supabase) return;

            const { error } = await supabase
                .from('tags')
                .delete()
                .eq('id', tagId);

            if (error) throw error;
            console.log('[PrinChat Sync] Tag deleted:', tagId);
        } catch (error) {
            console.error('[PrinChat Sync] Error deleting tag:', JSON.stringify(error, null, 2));
        }
    }

    // ==================== INITIAL SYNC ====================

    /**
     * Fetch all data from Supabase and populate local IndexedDB
     * Used on login or extension startup
     */
    async fetchAndSyncInitialData(instanceId?: string): Promise<{ outcome: string; details: string }> {
        console.log('[PrinChat Sync] Starting initial data sync...');
        if (this.cloudSyncDisabledByPermission) {
            return { outcome: 'local_only', details: 'Cloud sync disabled by permission. Local mode active.' };
        }
        const supabase = await getSupabaseClient();
        const scope = this.getScopeOrNull(instanceId);
        let scopedCloudAvailable = !!scope;
        if (!supabase) {
            console.warn('[PrinChat Sync] Cannot sync: Supabase client not available (check auth)');
            return { outcome: 'auth_failed', details: 'Supabase client null (Login required)' };
        }

        try {
            // Dynamic import to avoid circular dependency
            const { db } = await import('../storage/db');
            const database = await db.init();
            let existingColumns: any[] = [];
            let leads: any[] = [];

            if (!scope) {
                console.log('[PrinChat Sync] No instanceId provided. Running account-only sync.');
            }

            if (scope) {
                // 1. Kanban Columns
                const { data: existingColumnsScoped, error: colError } = await supabase
                    .from('kanban_columns')
                    .select('*')
                    .eq(this.scopedColumnName, scope)
                    .order('order');

                existingColumns = existingColumnsScoped || [];
                if (colError) {
                    if (this.isMissingScopedColumn(colError)) {
                        scopedCloudAvailable = false;
                        existingColumns = [];
                        console.warn('[PrinChat Sync] Scoped kanban_columns column missing in cloud. Running in local-safe mode.');
                    } else if (this.handlePermissionDenied('kanban_columns.select', colError)) {
                        scopedCloudAvailable = false;
                        existingColumns = [];
                    } else {
                        throw colError;
                    }
                }
            }
            let columnsToSync = existingColumns;

            // INITIALIZATION CHECK: If no columns exist in Cloud, create defaults
            if (scope && columnsToSync.length === 0 && scopedCloudAvailable) {
                console.log('[PrinChat Sync] 🆕 No columns found in Supabase. Creating default columns...');
                const { data: { user } } = await supabase.auth.getUser();

                if (user) {
                    const defaultColumnsData = DEFAULT_KANBAN_COLUMNS.map((col, index) => ({
                        user_id: user.id,
                        whatsapp_instance_id: scope,
                        name: col.name,
                        color: col.color,
                        is_default: col.isDefault,
                        order: index,
                        updated_at: new Date().toISOString()
                    }));

                    const { data: newColumns, error: createError } = await supabase
                        .from('kanban_columns')
                        .insert(defaultColumnsData)
                        .select();

                    if (createError) {
                        if (this.isMissingScopedColumn(createError)) {
                            scopedCloudAvailable = false;
                            console.warn('[PrinChat Sync] Scoped kanban_columns create not available yet. Keeping local-safe mode.');
                        } else if (this.handlePermissionDenied('kanban_columns.insert-defaults', createError)) {
                            scopedCloudAvailable = false;
                        } else {
                            console.error('[PrinChat Sync] ❌ Failed to create default columns:', createError);
                        }
                    } else if (newColumns) {
                        console.log('[PrinChat Sync] ✅ Default columns created in Supabase:', newColumns.length);
                        columnsToSync = newColumns;
                    }
                } else {
                    console.error('[PrinChat Sync] ❌ Cannot create default columns: User not logged in (Auth Object missing)');
                }
            }

            if (scope && columnsToSync.length > 0) {
                console.log(`[PrinChat Sync] Syncing ${columnsToSync.length} columns to Local DB`);
                for (const col of columnsToSync) {
                    await database.put('kanban_columns', {
                        id: col.id,
                        instanceId: scope,
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

            if (scope) {
                // 2. Leads
                const { data: leadsScoped, error: leadError } = await supabase
                    .from('leads')
                    .select('*')
                    .eq(this.scopedColumnName, scope);

                leads = leadsScoped || [];
                if (leadError) {
                    if (this.isMissingScopedColumn(leadError)) {
                        scopedCloudAvailable = false;
                        leads = [];
                        console.warn('[PrinChat Sync] Scoped leads column missing in cloud. Running in local-safe mode.');
                    } else if (this.handlePermissionDenied('leads.select', leadError)) {
                        scopedCloudAvailable = false;
                        leads = [];
                    } else {
                        throw leadError;
                    }
                }
                if (leads) {
                    console.log(`[PrinChat Sync] Fetched ${leads.length} leads`);
                    for (const s of leads) {
                        try {
                            const leadIdentity = normalizeChatIdentity(s.chat_id || s.id) || String(s.chat_id || s.id || '');
                            const scopedLeadId = buildScopedLeadId(scope, leadIdentity);
                            const localLead = await database.get('kanban_leads', scopedLeadId);
                            const cloudTime = new Date(s.updated_at || s.created_at).getTime();

                            // PERSISTENCE FIX: If local is NEWER, do not overwrite!
                            if (localLead && localLead.updatedAt && localLead.updatedAt > cloudTime) {
                                console.warn(`[PrinChat Sync] 🛡️ Skipping overwrite for ${s.name} (Local is newer): Local=${new Date(localLead.updatedAt).toISOString()}, Cloud=${new Date(cloudTime).toISOString()}`);
                                continue;
                            }

                            // Parse Last Message safely
                            let lastMsg = '';
                            if (s.last_message && typeof s.last_message === 'object') {
                                lastMsg = (s.last_message as any).content || '';
                            } else if (typeof s.last_message === 'string') {
                                try {
                                    const parsed = JSON.parse(s.last_message);
                                    lastMsg = parsed.content || parsed;
                                } catch {
                                    lastMsg = s.last_message;
                                }
                            }

                            const incomingPhoto = typeof s.photo_url === 'string' ? s.photo_url : '';
                            const shouldPreserveLocalPhoto =
                                !this.hasRenderablePhoto(incomingPhoto) &&
                                this.hasRenderablePhoto(localLead?.photo);
                            const mergedPhoto = shouldPreserveLocalPhoto
                                ? localLead?.photo
                                : (incomingPhoto || undefined);

                            await database.put('kanban_leads', {
                                id: scopedLeadId,
                                instanceId: scope,
                                chatId: leadIdentity,
                                columnId: s.column_id,
                                order: s.order,
                                name: s.name,
                                phone: s.phone || leadIdentity,
                                photo: mergedPhoto,
                                unreadCount: s.unread_count,
                                lastMessage: lastMsg,
                                tags: s.tags || [],
                                createdAt: new Date(s.created_at).getTime(),
                                updatedAt: cloudTime,
                                notes: '',
                            });
                            console.log(`[PrinChat Sync] ☁️ Overwrote lead ${s.name} (Cloud Win): Cloud=${new Date(cloudTime).toISOString()} >= Local=${localLead?.updatedAt ? new Date(localLead.updatedAt).toISOString() : 'N/A'}`);
                        } catch (err) {
                            console.error(`[PrinChat Sync] Error processing lead ${s.chat_id}:`, err);
                        }
                    }
                }
            }

            // 6. Signatures
            const { data: signatures, error: sigError } = await supabase.from('signatures').select('*');
            if (sigError) {
                if (this.handlePermissionDenied('signatures.select', sigError)) {
                    return { outcome: 'local_only', details: 'Cloud permission denied. Local mode active.' };
                }
                throw sigError;
            }
            if (signatures) {
                for (const s of signatures) {
                    await database.put('signatures', {
                        id: s.id,
                        title: s.name, // Map name to title
                        text: s.content, // Map content to text
                        content: s.content,
                        isActive: s.is_active,
                        formatting: { bold: false, italic: false, strikethrough: false, monospace: false },
                        spacing: 0,
                        createdAt: new Date(s.created_at).getTime(),
                        updatedAt: new Date(s.updated_at || s.created_at).getTime()
                    });
                }
            }

            // 7. Triggers
            const { data: triggers, error: trigError } = await supabase.from('triggers').select('*');
            if (trigError) {
                if (this.handlePermissionDenied('triggers.select', trigError)) {
                    return { outcome: 'local_only', details: 'Cloud permission denied. Local mode active.' };
                }
                throw trigError;
            }
            if (triggers) {
                for (const t of triggers) {
                    await database.put('triggers', {
                        id: t.id,
                        name: t.name,
                        description: '',
                        enabled: t.enabled,
                        conditions: [{
                            type: t.match_type || 'contains',
                            value: t.keyword || '',
                            caseSensitive: false
                        }] as any, // Cast to avoid strict type issues if mismatch
                        scriptId: t.action_value || '', // Map action_value to scriptId
                        skipContacts: false,
                        skipGroups: false,
                        createdAt: new Date(t.created_at).getTime(),
                        updatedAt: new Date(t.updated_at || t.created_at).getTime()
                    });
                }
            }

            // 8. Tags
            const { data: tags, error: tagError } = await supabase.from('tags').select('*');
            if (tagError) {
                if (this.handlePermissionDenied('tags.select', tagError)) {
                    return { outcome: 'local_only', details: 'Cloud permission denied. Local mode active.' };
                }
                throw tagError;
            }
            if (tags) {
                for (const t of tags) {
                    await database.put('tags', {
                        id: t.id,
                        name: t.name,
                        color: t.color
                    });
                }
            }

            // 5. Check for Migration Scenario (Cloud Empty, Local has Data)
            const cloudEmpty =
                (!existingColumns || existingColumns.length === 0) &&
                (!leads || leads.length === 0);

            if (scope && cloudEmpty && scopedCloudAvailable) {
                console.log('[PrinChat Sync] ⚠️ Cloud appears empty. Checking for local data to migrate...');

                // Get a FRESH database instance for the count check to avoid transaction conflicts
                const { db } = await import('../storage/db');
                const database = await db.init();

                const localCols = (await database.getAll('kanban_columns'))
                    .filter((c: any) => normalizeInstanceId(c.instanceId) === scope)
                    .length;

                if (localCols > 0) {
                    console.log(`[PrinChat Sync] Found ${localCols} local columns. Triggering migration push...`);
                    await this.pushAllLocalData(scope);
                } else {
                    console.log('[PrinChat Sync] Local is also empty. New user?');
                }
            } else if (scope && scopedCloudAvailable) {
                // FALLBACK: If Cloud has FEWER leads than Local (e.g. sync fail), try to push local leads
                const { db } = await import('../storage/db');
                const database = await db.init();
                const localLeadsCount = (await database.getAll('kanban_leads'))
                    .filter((l: any) => normalizeInstanceId(l.instanceId) === scope)
                    .length;
                const cloudLeadsCount = leads ? leads.length : 0;

                console.log(`[PrinChat Sync] Sync Check - Local Leads: ${localLeadsCount}, Cloud Leads: ${cloudLeadsCount}`);

                if (localLeadsCount > cloudLeadsCount) {
                    console.warn('[PrinChat Sync] ⚠️ Local has MORE leads than Cloud. Pushing missing leads...');
                    // We can reuse pushAllLocalData or just push leads. For safety/migration, let's push all.
                    // syncLead handles upsert, so duplicates are safe.
                    await this.pushAllLocalData(scope);
                }
            } else if (scope) {
                console.log('[PrinChat Sync] Scoped cloud columns not available. Skipping scoped migration/push to avoid contamination.');
            } else {
                console.log('[PrinChat Sync] Account-only sync completed (scoped data deferred until instanceId is available).');
            }


            console.log('[PrinChat Sync] Initial sync complete.');
            return { outcome: 'success', details: 'Sync completed successfully' };

        } catch (error: any) {
            if (this.handlePermissionDenied('initial-sync.catch', error)) {
                return { outcome: 'local_only', details: 'Cloud permission denied. Local mode active.' };
            }
            console.error('[PrinChat Sync] Error during initial sync:', JSON.stringify(error, null, 2));
            console.error('[PrinChat Sync] Raw error:', error);
            return { outcome: 'error', details: error.message || String(error) };
        }
    }

    /**
     * Push all local data to Supabase
     * Used when the cloud is empty but local has data (Migration scenario)
     * @returns Object with counts of synced items
     */
    async pushAllLocalData(instanceId?: string) {
        const scope = this.getScopeOrNull(instanceId);
        console.log('[PrinChat Sync] 🚀 Starting Full Local Push (Migration)...', { scope });
        const stats = { columns: 0, leads: 0, notes: 0, schedules: 0, scripts: 0, signatures: 0, triggers: 0, tags: 0, errors: 0 };
        const errorsList: string[] = [];

        if (this.cloudSyncDisabledByPermission) {
            return stats;
        }

        try {
            const { db } = await import('../storage/db');
            const database = await db.init();

            // 1. Kanban Columns
            const columns = (await database.getAll('kanban_columns'))
                .filter((col: any) => !scope || normalizeInstanceId(col.instanceId) === scope);
            console.log(`[PrinChat Sync] Pushing ${columns.length} columns...`);
            for (const col of columns) {
                try {
                    await this.syncKanbanColumn(col);
                    stats.columns++;
                } catch (error: any) {
                    stats.errors++;
                    console.error(`[PrinChat Sync] Failed to sync column ${col.name}:`, error);
                    // Capture specific error message (e.g., from RLS or UUID validation)
                    const msg = error.message || JSON.stringify(error);
                    errorsList.push(`Coluna '${col.name}': ${msg}`);
                }
            }

            // 2. Leads
            const leads = (await database.getAll('kanban_leads'))
                .filter((lead: any) => !scope || normalizeInstanceId(lead.instanceId) === scope);
            console.log(`[PrinChat Sync] Pushing ${leads.length} leads...`);
            for (const lead of leads) {
                try {
                    await this.syncLead(lead);
                    stats.leads++;
                } catch (error: any) {
                    stats.errors++;
                    const msg = error.message || JSON.stringify(error);
                    errorsList.push(`Lead '${lead.name || lead.phone}': ${msg}`);
                }
            }

            // 3. Notes
            const notes = (await database.getAll('notes'))
                .filter((note: any) => !scope || normalizeInstanceId(note.instanceId) === scope);
            console.log(`[PrinChat Sync] Pushing ${notes.length} notes...`);
            for (const note of notes) {
                await this.syncNote(note);
                stats.notes++;
            }

            // 4. Schedules
            const schedules = (await database.getAll('schedules'))
                .filter((schedule: any) => !scope || normalizeInstanceId(schedule.instanceId) === scope);
            console.log(`[PrinChat Sync] Pushing ${schedules.length} schedules...`);
            for (const schedule of schedules) {
                await this.syncSchedule(schedule);
                stats.schedules++;
            }

            // 5. Scripts
            const scripts = await database.getAll('scripts');
            console.log(`[PrinChat Sync] Pushing ${scripts.length} scripts...`);
            for (const script of scripts) {
                try {
                    await this.syncScript(script);
                    stats.scripts++;
                } catch (error: any) {
                    stats.errors++;
                    const msg = error.message || JSON.stringify(error);
                    errorsList.push(`Script '${script.title || script.name}': ${msg}`);
                }
            }

            // 6. Signatures
            const signatures = await database.getAll('signatures');
            console.log(`[PrinChat Sync] Pushing ${signatures.length} signatures...`);
            for (const sig of signatures) {
                try {
                    await this.syncSignature(sig);
                    stats.signatures++;
                } catch (error: any) {
                    stats.errors++;
                    const msg = error.message || JSON.stringify(error);
                    errorsList.push(`Assinatura '${sig.title || 'Sem Título'}': ${msg}`);
                }
            }

            // 7. Triggers
            const triggers = await database.getAll('triggers');
            console.log(`[PrinChat Sync] Pushing ${triggers.length} triggers...`);
            for (const trigger of triggers) {
                try {
                    await this.syncTrigger(trigger);
                    stats.triggers++;
                } catch (error: any) {
                    stats.errors++;
                    const msg = error.message || JSON.stringify(error);
                    errorsList.push(`Trigger '${trigger.name}': ${msg}`);
                }
            }

            // 8. Tags
            const tags = await database.getAll('tags');
            console.log(`[PrinChat Sync] Pushing ${tags.length} tags...`);
            for (const tag of tags) {
                try {
                    await this.syncTag(tag);
                    stats.tags++;
                } catch (error: any) {
                    stats.errors++;
                    const msg = error.message || JSON.stringify(error);
                    errorsList.push(`Tag '${tag.name}': ${msg}`);
                }
            }


            console.log('[PrinChat Sync] ✅ Full Local Push Complete.', stats);

            if (stats.errors > 0) {
                const firstError = errorsList[0] || 'Unknown error';
                throw new Error(`Falha ao sincronizar ${stats.errors} itens. Detalhe: ${firstError}`);
            }

            return stats;
        } catch (error) {
            if (this.handlePermissionDenied('full-push.catch', error)) {
                return stats;
            }
            console.error('[PrinChat Sync] Error during full local push:', error);
            throw error; // Propagate to UI
        }
    }
}

export const syncService = new SyncService();
