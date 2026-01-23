
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
            const response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-Filename': finalFilename,
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
