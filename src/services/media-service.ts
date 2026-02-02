
import { getSupabaseClient } from './supabase-client';

const WORKER_URL = 'https://princhat-api.princhat.workers.dev/upload';

class MediaService {

    /**
     * Upload a file (Blob/File) to Bunny.net via Cloudflare Worker
     * @param file The file object or Blob to upload
     * @param filename Optional filename (defaults to timestamp)
     * @returns Promise<string> The public URL of the uploaded file
     */
    async uploadMedia(file: Blob, filename?: string): Promise<string> {
        try {
            // 1. Get Auth Token
            // We need the raw JWT, not just the Supabase client.
            // We can get it from the session.
            const supabase = await getSupabaseClient();
            if (!supabase) {
                throw new Error('Not authenticated');
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('No active session');
            }

            const token = session.access_token;

            // Generate filename if checking provided one
            const finalFilename = filename || `upload-${Date.now()}.${this.getExtension(file.type)}`;

            // 2. Prepare Upload
            // The worker expects the raw binary in the body
            // IMPORTANT: Encode filename to support special characters (accents, emoji, etc.)
            const encodedFilename = encodeURIComponent(finalFilename);

            const response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-Filename': encodedFilename, // URL-encoded to support non-ASCII chars
                    // 'Content-Type': file.type // content-type of the request body is implicitly set by fetch if using Blob? 
                    // Actually worker reads arrayBuffer directly, so we just pass the blob body
                },
                body: file
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Upload failed: ${response.status} ${errorText}`);
            }

            // 3. Parse Response
            const result = await response.json();
            if (!result.success || !result.url) {
                throw new Error('Invalid upload response');
            }

            console.log('[PrinChat Media] Upload successful:', result.url);
            return result.url;

        } catch (error) {
            console.error('[PrinChat Media] Error uploading media:', error);
            throw error;
        }
    }

    /**
     * Delete a file from Bunny.net via Cloudflare Worker
     * @param fileUrl The public URL of the file to delete
     * @returns Promise<boolean> True if deleted successfully
     */
    async deleteMedia(fileUrl: string): Promise<boolean> {
        try {
            // Extract filename from URL
            // Format: https://princhat.b-cdn.net/2de45b4d-ef3c-4d99-af39-2f8e1a5f5a07/audio-1769088324297-7jpm7cra.mp3
            const urlParts = fileUrl.split('/');
            const encodedUserId = urlParts[urlParts.length - 2]; // user_id folder (may be encoded)
            const encodedFilename = urlParts[urlParts.length - 1]; // actual file (may be encoded)

            // Decode to get original names (worker will re-encode for Bunny API)
            const userId = decodeURIComponent(encodedUserId);
            const filename = decodeURIComponent(encodedFilename);
            const filePath = `${userId}/${filename}`;

            console.log('[PrinChat Media] Deleting file from Bunny:', filePath);

            // Get Auth Token
            const supabase = await getSupabaseClient();
            if (!supabase) {
                throw new Error('Not authenticated');
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('No active session');
            }

            const token = session.access_token;

            // Call DELETE endpoint on worker
            // IMPORTANT: Encode filePath for header (same as upload)
            const encodedFilePath = filePath.split('/').map(part => encodeURIComponent(part)).join('/');

            const response = await fetch(WORKER_URL, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-File-Path': encodedFilePath // URL-encoded to support non-ASCII chars
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.warn(`[PrinChat Media] Delete failed: ${response.status} ${errorText}`);
                return false;
            }

            const result = await response.json();
            if (result.success) {
                console.log('[PrinChat Media] File deleted successfully from Bunny');
                return true;
            } else {
                console.warn('[PrinChat Media] Delete returned false:', result);
                return false;
            }

        } catch (error) {
            console.error('[PrinChat Media] Error deleting media:', error);
            return false; // Don't throw, just return false to not break deletion flow
        }
    }

    private getExtension(mimeType: string): string {
        switch (mimeType) {
            case 'image/jpeg': return 'jpg';
            case 'image/png': return 'png';
            case 'image/webp': return 'webp';
            case 'image/gif': return 'gif';
            case 'audio/mpeg': return 'mp3';
            case 'audio/mp3': return 'mp3';
            case 'audio/webm': return 'webm';
            case 'audio/ogg': return 'ogg';
            case 'audio/wav': return 'wav';
            case 'video/mp4': return 'mp4';
            case 'video/webm': return 'webm';
            case 'application/pdf': return 'pdf';
            default: return 'bin';
        }
    }
}

export const mediaService = new MediaService();
