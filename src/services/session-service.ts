import { getSupabaseClient } from './supabase-client';

class SessionService {
  private readonly tableName = 'account_active_sessions';
  private readonly deviceStorageKey = 'princhat_device_id';
  private readonly heartbeatMs = 8000;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private currentSessionId: string | null = null;
  private currentUserId: string | null = null;
  private currentDeviceId: string | null = null;
  private currentInstanceId: string | null = null;

  private buildId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `pc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private normalizeInstance(instanceId?: string): string | null {
    if (typeof instanceId !== 'string') return null;
    const value = instanceId.trim();
    return value || null;
  }

  private isMissingSessionTable(error: any): boolean {
    const msg = String(error?.message || error || '').toLowerCase();
    return msg.includes(this.tableName) && (msg.includes('relation') || msg.includes('does not exist'));
  }

  private normalizeErrorForLog(error: any): { message: string; metadata?: Record<string, unknown> } {
    if (typeof error === 'string') {
      return { message: error };
    }

    const message = typeof error?.message === 'string' && error.message.trim().length > 0
      ? error.message
      : '';

    const metadata: Record<string, unknown> = {};
    if (error?.code !== undefined) metadata.code = error.code;
    if (error?.status !== undefined) metadata.status = error.status;
    if (error?.details !== undefined) metadata.details = error.details;
    if (error?.hint !== undefined) metadata.hint = error.hint;

    if (!message) {
      try {
        metadata.serialized = JSON.stringify(error);
      } catch {
        metadata.serialized = String(error);
      }
    }

    return {
      message: message || 'Unknown error',
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  }

  private logSessionError(prefix: string, error: any): void {
    const normalized = this.normalizeErrorForLog(error);
    if (normalized.metadata) {
      console.error(prefix, normalized.message, normalized.metadata);
      return;
    }
    console.error(prefix, normalized.message);
  }

  private async getOrCreateDeviceId(): Promise<string> {
    const result = await chrome.storage.local.get([this.deviceStorageKey]);
    const existing = result[this.deviceStorageKey];
    if (typeof existing === 'string' && existing.length > 0) {
      return existing;
    }

    const created = this.buildId();
    await chrome.storage.local.set({ [this.deviceStorageKey]: created });
    return created;
  }

  setInstance(instanceId?: string): void {
    this.currentInstanceId = this.normalizeInstance(instanceId);
  }

  async start(instanceId?: string): Promise<void> {
    this.setInstance(instanceId);

    try {
      const supabase = await getSupabaseClient();
      if (!supabase) {
        await this.stop();
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        await this.stop();
        return;
      }

      this.currentUserId = user.id;
      this.currentDeviceId = await this.getOrCreateDeviceId();
      this.currentSessionId = this.buildId();

      const claimed = await this.claimSession();
      if (!claimed) {
        // Table may not exist yet in older environments.
        return;
      }

      this.startHeartbeat();
    } catch (error) {
      this.logSessionError('[PrinChat Session] Failed to start session guard:', error);
    }
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.currentSessionId = null;
    this.currentUserId = null;
    this.currentDeviceId = null;
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      this.verifyAndHeartbeat().catch((error) => {
        this.logSessionError('[PrinChat Session] Heartbeat error:', error);
      });
    }, this.heartbeatMs);
  }

  private async claimSession(): Promise<boolean> {
    if (!this.currentSessionId || !this.currentUserId || !this.currentDeviceId) {
      return false;
    }

    const supabase = await getSupabaseClient();
    if (!supabase) return false;

    const now = new Date().toISOString();
    const { error } = await supabase
      .from(this.tableName)
      .upsert({
        user_id: this.currentUserId,
        session_id: this.currentSessionId,
        device_id: this.currentDeviceId,
        whatsapp_instance_id: this.currentInstanceId,
        heartbeat_at: now,
        updated_at: now,
      }, { onConflict: 'user_id' });

    if (error) {
      if (this.isMissingSessionTable(error)) {
        console.warn('[PrinChat Session] Session table is missing. Guard will stay disabled until migration runs.');
        return false;
      }
      throw error;
    }

    return true;
  }

  async verifyAndHeartbeat(): Promise<boolean> {
    if (!this.currentSessionId || !this.currentUserId || !this.currentDeviceId) {
      return true;
    }

    const supabase = await getSupabaseClient();
    if (!supabase) {
      await this.stop();
      return true;
    }

    const { data, error } = await supabase
      .from(this.tableName)
      .select('session_id')
      .eq('user_id', this.currentUserId)
      .maybeSingle();

    if (error) {
      if (this.isMissingSessionTable(error)) {
        return true;
      }
      throw error;
    }

    if (!data || !data.session_id) {
      return this.claimSession();
    }

    if (data.session_id !== this.currentSessionId) {
      await this.forceLogoutByConflict();
      return false;
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from(this.tableName)
      .update({
        device_id: this.currentDeviceId,
        whatsapp_instance_id: this.currentInstanceId,
        heartbeat_at: now,
        updated_at: now,
      })
      .eq('user_id', this.currentUserId)
      .eq('session_id', this.currentSessionId);

    if (updateError) {
      if (this.isMissingSessionTable(updateError)) {
        return true;
      }
      throw updateError;
    }

    return true;
  }

  private async notifyConflictTabs(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      await Promise.all(tabs.map(async (tab) => {
        if (!tab.id) return;
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'SESSION_CONFLICT_LOGOUT' });
        } catch {
          // Ignore stale tabs/no listener
        }
      }));
    } catch (error) {
      const normalized = this.normalizeErrorForLog(error);
      if (normalized.metadata) {
        console.warn('[PrinChat Session] Failed to notify tabs about session conflict:', normalized.message, normalized.metadata);
      } else {
        console.warn('[PrinChat Session] Failed to notify tabs about session conflict:', normalized.message);
      }
    }
  }

  private async forceLogoutByConflict(): Promise<void> {
    console.warn('[PrinChat Session] Session conflict detected. Logging out this extension session.');
    await chrome.storage.sync.remove(['auth_session']);
    await this.stop();
    await this.notifyConflictTabs();
  }
}

export const sessionService = new SessionService();
