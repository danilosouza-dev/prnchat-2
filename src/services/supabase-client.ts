import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lblhppgtbfgmnplfeoak.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxibGhwcGd0YmZnbW5wbGZlb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NTgwOTYsImV4cCI6MjA4NDUzNDA5Nn0.IPIEIoxln4DQR7Siyo1gvBZvCwiytemlbDiHA0q9OqI';

// Singleton instance to prevent multiple GoTrueClient instances
let cachedSupabaseClient: SupabaseClient | null = null;
let restoreSessionBackoffUntil = 0;
let restoreSessionBackoffMs = 0;

const RESTORE_SESSION_INITIAL_BACKOFF_MS = 5000;
const RESTORE_SESSION_MAX_BACKOFF_MS = 60000;

const getErrorMessage = (error: any): string => {
    if (typeof error?.message === 'string' && error.message.trim().length > 0) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'unknown error';
};

const isRateLimitError = (error: any): boolean => {
    const status = Number(error?.status ?? error?.statusCode ?? 0);
    const code = String(error?.code ?? '').toLowerCase();
    const message = getErrorMessage(error).toLowerCase();
    return status === 429
        || code === '429'
        || code.includes('rate')
        || message.includes('rate limit')
        || message.includes('too many requests')
        || message.includes('request rate limit reached');
};

const scheduleRestoreSessionBackoff = (): number => {
    restoreSessionBackoffMs = restoreSessionBackoffMs > 0
        ? Math.min(restoreSessionBackoffMs * 2, RESTORE_SESSION_MAX_BACKOFF_MS)
        : RESTORE_SESSION_INITIAL_BACKOFF_MS;
    restoreSessionBackoffUntil = Date.now() + restoreSessionBackoffMs;
    return restoreSessionBackoffMs;
};

const resetRestoreSessionBackoff = (): void => {
    restoreSessionBackoffUntil = 0;
    restoreSessionBackoffMs = 0;
};

/**
 * Get an authenticated Supabase client using the session from chrome.storage.sync
 * Handles automatic token refreshing.
 * Uses singleton pattern to prevent multiple GoTrueClient instances.
 */
export async function getSupabaseClient(): Promise<SupabaseClient | null> {
    const sessionData = await new Promise<{ accessToken?: string; refreshToken?: string }>((resolve) => {
        chrome.storage.sync.get(['auth_session'], (result) => {
            resolve(result.auth_session || {});
        });
    });

    if (!sessionData.accessToken || !sessionData.refreshToken) {
        console.warn('[PrinChat Sync] No auth tokens found in storage');
        cachedSupabaseClient = null; // Clear cache
        resetRestoreSessionBackoff();
        return null; // Force login
    }

    // Return cached client if it exists and session is valid
    if (cachedSupabaseClient) {
        const { data } = await cachedSupabaseClient.auth.getSession();
        if (data.session?.access_token === sessionData.accessToken) {
            resetRestoreSessionBackoff();
            return cachedSupabaseClient; // Reuse existing client
        }
        // Session changed, need to recreate
        cachedSupabaseClient = null;
    }

    if (restoreSessionBackoffUntil > Date.now()) {
        const remainingMs = restoreSessionBackoffUntil - Date.now();
        console.debug('[PrinChat Sync] Skipping session restore during backoff window:', `${Math.ceil(remainingMs / 1000)}s remaining`);
        return null;
    }

    // Create a client instance with dummy storage for Service Worker compatibility
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: false, // We handle persistence manually in chrome.storage
            autoRefreshToken: true, // Allow SDK to try refreshing if setSession is called
            detectSessionInUrl: false,
            storage: {
                getItem: () => null,
                setItem: () => { },
                removeItem: () => { },
            },
        }
    });

    // Initialize session
    const { data, error } = await supabase.auth.setSession({
        access_token: sessionData.accessToken,
        refresh_token: sessionData.refreshToken
    });

    if (error) {
        if (isRateLimitError(error)) {
            const backoffMs = scheduleRestoreSessionBackoff();
            console.warn(
                '[PrinChat Sync] Failed to restore session due to rate limit. Retrying in',
                `${Math.ceil(backoffMs / 1000)}s:`,
                getErrorMessage(error)
            );
            cachedSupabaseClient = null;
            return null;
        }

        console.error('[PrinChat Sync] Failed to restore session:', getErrorMessage(error));

        // Critical: Clear storage to force UI to show Login screen
        // Otherwise UI thinks user is logged in (zombie session)
        await chrome.storage.sync.remove(['auth_session']);
        cachedSupabaseClient = null;
        resetRestoreSessionBackoff();

        return null; // Forces re-login
    }

    resetRestoreSessionBackoff();

    // Check if the session was refreshed (token changed)
    if (data.session && data.session.access_token !== sessionData.accessToken) {
        console.log('[PrinChat Sync] Token refreshed automatically. Updating storage...');
        chrome.storage.sync.set({
            auth_session: {
                accessToken: data.session.access_token,
                refreshToken: data.session.refresh_token,
                user: data.session.user
            }
        });
    }

    // Cache the client for reuse
    cachedSupabaseClient = supabase;
    return supabase;
}
