/**
 * Messages Store
 * Extracted from DatabaseService (db.ts) — Story 1.3
 */

import type { IDBPDatabase } from 'idb';
import type { PrinChatDB } from '../db';
import type { Message } from '@/types';

export async function saveMessage(
    db: IDBPDatabase<PrinChatDB>,
    message: Message
): Promise<void> {
    // Helper to handle media upload logic
    const handleMediaUpload = async (
        blob: Blob,
        type: 'audio' | 'image' | 'video' | 'file',
        filename?: string
    ): Promise<string | null> => {
        try {
            console.log(`[PrinChat DB] Uploading ${type} to cloud...`);
            // Import dynamically to avoid circular dependencies just in case
            const { mediaService } = await import('../../services/media-service');
            const url = await mediaService.uploadMedia(blob, filename);
            console.log(`[PrinChat DB] Upload successful: ${url}`);
            return url;
        } catch (error) {
            console.warn(`[PrinChat DB] Upload failed for ${type}, falling back to local storage:`, error);
            return null;
        }
    };

    // 1. AUDIO
    if (message.audioData && message.audioData instanceof Blob) {
        const url = await handleMediaUpload(message.audioData, 'audio', `audio-${message.id}.mp3`);
        if (url) {
            message.audioUrl = url;
            message.audioData = null;
        } else {
            await db.put('audioBlobs', {
                messageId: message.id,
                blob: message.audioData,
                createdAt: Date.now(),
            });
        }
    }

    // 2. IMAGE
    if (message.imageData && message.imageData instanceof Blob) {
        const url = await handleMediaUpload(message.imageData, 'image', `image-${message.id}`);
        if (url) {
            message.imageUrl = url;
            message.imageData = null;
        } else {
            await db.put('imageBlobs', {
                messageId: message.id,
                blob: message.imageData,
                createdAt: Date.now(),
            });
        }
    }

    // 3. VIDEO
    if (message.videoData && message.videoData instanceof Blob) {
        const url = await handleMediaUpload(message.videoData, 'video', `video-${message.id}`);
        if (url) {
            message.videoUrl = url;
            message.videoData = null;
        } else {
            await db.put('videoBlobs', {
                messageId: message.id,
                blob: message.videoData,
                createdAt: Date.now(),
            });
        }
    }

    // 4. FILE
    if (message.fileData && message.fileData instanceof Blob) {
        const url = await handleMediaUpload(message.fileData, 'file', message.fileName || `file-${message.id}`);
        if (url) {
            message.fileUrl = url;
            message.fileData = null;
        } else {
            await db.put('fileBlobs', {
                messageId: message.id,
                blob: message.fileData,
                fileName: message.fileName || 'file',
                createdAt: Date.now(),
            });
        }
    }

    // Don't store blobs in the message object (just references)
    const messageToSave = {
        ...message,
        audioData: null,
        imageData: null,
        videoData: null,
        fileData: null
    };
    await db.put('messages', messageToSave);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            messages: Date.now()
        });
    }
}

export async function getMessage(
    db: IDBPDatabase<PrinChatDB>,
    id: string
): Promise<Message | undefined> {
    const message = await db.get('messages', id);

    if (message) {
        // Retrieve audio blob if exists
        if (message.type === 'audio') {
            const audioData = await db.get('audioBlobs', id);
            if (audioData) {
                message.audioData = audioData.blob;
            }
        }

        // Retrieve image blob if exists
        if (message.type === 'image') {
            const imageData = await db.get('imageBlobs', id);
            if (imageData) {
                message.imageData = imageData.blob;
            }
        }

        // Retrieve video blob if exists
        if (message.type === 'video') {
            const videoData = await db.get('videoBlobs', id);
            if (videoData) {
                message.videoData = videoData.blob;
            }
        }

        // Retrieve file blob if exists
        if (message.type === 'file') {
            const fileData = await db.get('fileBlobs', id);
            if (fileData) {
                message.fileData = fileData.blob;
                message.fileName = fileData.fileName;
            }
        }
    }

    return message;
}

export async function getAllMessages(
    db: IDBPDatabase<PrinChatDB>
): Promise<Message[]> {
    console.log('[PrinChat DB] getAllMessages calling db.getAll...');
    const messages = await db.getAll('messages');
    console.log(`[PrinChat DB] getAllMessages raw count: ${messages.length}`);

    // Load media blobs for all message types
    const messagesWithMedia = await Promise.all(
        messages.map(async (msg) => {
            if (msg.type === 'audio') {
                const audioData = await db.get('audioBlobs', msg.id);
                if (audioData) {
                    msg.audioData = audioData.blob;
                }
            }

            if (msg.type === 'image') {
                const imageData = await db.get('imageBlobs', msg.id);
                if (imageData) {
                    msg.imageData = imageData.blob;
                }
            }

            if (msg.type === 'video') {
                const videoData = await db.get('videoBlobs', msg.id);
                if (videoData) {
                    msg.videoData = videoData.blob;
                }
            }

            if (msg.type === 'file') {
                console.log('[PrinChat DB] 🔍 Loading file for message:', msg.id);
                const fileData = await db.get('fileBlobs', msg.id);
                console.log('[PrinChat DB] 🔍 fileData from IndexedDB:', fileData ? 'FOUND' : 'NOT FOUND');
                if (fileData) {
                    console.log('[PrinChat DB] 🔍 fileData.blob type:', typeof fileData.blob);
                    console.log('[PrinChat DB] 🔍 fileData.blob instanceof Blob:', fileData.blob instanceof Blob);
                    console.log('[PrinChat DB] 🔍 fileData.blob size:', fileData.blob?.size);
                    msg.fileData = fileData.blob;
                    msg.fileName = fileData.fileName;
                }
            }

            return msg;
        })
    );

    return messagesWithMedia;
}

export async function deleteMessage(
    db: IDBPDatabase<PrinChatDB>,
    id: string
): Promise<void> {
    // CLEANUP: Delete file from Bunny CDN before deleting from DB
    try {
        const message = await db.get('messages', id);

        if (message) {
            const mediaUrls: string[] = [];

            if (message.audioUrl) mediaUrls.push(message.audioUrl);
            if (message.imageUrl) mediaUrls.push(message.imageUrl);
            if (message.videoUrl) mediaUrls.push(message.videoUrl);
            if (message.fileUrl) mediaUrls.push(message.fileUrl);

            if (mediaUrls.length > 0) {
                console.log(`[PrinChat DB] Message ${id} has ${mediaUrls.length} media file(s) in Bunny. Deleting...`);

                const { mediaService } = await import('../../services/media-service');

                for (const url of mediaUrls) {
                    const deleted = await mediaService.deleteMedia(url);
                    if (deleted) {
                        console.log(`[PrinChat DB] ✅ Deleted from Bunny: ${url}`);
                    } else {
                        console.warn(`[PrinChat DB] ⚠️ Failed to delete from Bunny: ${url}`);
                    }
                }
            }
        }
    } catch (cleanupError) {
        console.warn('[PrinChat DB] Error cleaning up Bunny files (continuing with deletion):', cleanupError);
    }

    // Delete from IndexedDB
    await db.delete('messages', id);
    await db.delete('audioBlobs', id);
    await db.delete('imageBlobs', id);
    await db.delete('videoBlobs', id);
    await db.delete('fileBlobs', id);

    // Trigger chrome.storage change event to notify other components
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            messages: Date.now()
        });
    }
}

export async function getMessagesByType(
    db: IDBPDatabase<PrinChatDB>,
    type: 'text' | 'audio' | 'image' | 'video'
): Promise<Message[]> {
    const messages = await db.getAllFromIndex('messages', 'by-type', type);

    const messagesWithMedia = await Promise.all(
        messages.map(async (msg) => {
            if (msg.type === 'audio') {
                const audioData = await db.get('audioBlobs', msg.id);
                if (audioData) {
                    msg.audioData = audioData.blob;
                }
            }

            if (msg.type === 'image') {
                const imageData = await db.get('imageBlobs', msg.id);
                if (imageData) {
                    msg.imageData = imageData.blob;
                }
            }

            if (msg.type === 'video') {
                const videoData = await db.get('videoBlobs', msg.id);
                if (videoData) {
                    msg.videoData = videoData.blob;
                }
            }

            return msg;
        })
    );

    return messagesWithMedia;
}
