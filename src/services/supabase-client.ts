import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lblhppgtbfgmnplfeoak.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxibGhwcGd0YmZnbW5wbGZlb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NTgwOTYsImV4cCI6MjA4NDUzNDA5Nn0.IPIEIoxln4DQR7Siyo1gvBZvCwiytemlbDiHA0q9OqI';

/**
 * Get an authenticated Supabase client using the session from chrome.storage.sync
 * Handles automatic token refreshing.
 */
export async function getSupabaseClient(): Promise<SupabaseClient | null> {
    const sessionData = await new Promise<{ accessToken?: string; refreshToken?: string }>((resolve) => {
        chrome.storage.sync.get(['auth_session'], (result) => {
            resolve(result.auth_session || {});
        });
    });

    if (!sessionData.accessToken || !sessionData.refreshToken) {
        console.warn('[PrinChat Sync] No auth tokens found in storage');
        return null; // Force login
    }

    // Create a client instance
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: false, // We handle persistence manually in chrome.storage
            autoRefreshToken: true, // Allow SDK to try refreshing if setSession is called
            detectSessionInUrl: false
        }
    });

    // Initialize session
    const { data, error } = await supabase.auth.setSession({
        access_token: sessionData.accessToken,
        refresh_token: sessionData.refreshToken
    });

    if (error) {
        console.error('[PrinChat Sync] Failed to restore session:', error.message);
        // If refresh token is invalid (e.g. revoked), clearing storage might be good, 
        // but let's just return null so user is prompted to login again.
        return null;
    }

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

    return supabase;
}
