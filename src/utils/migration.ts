/**
 * Migration utility to convert tags to folders
 * This should be run once when the extension updates to the new folder-based system
 */

import { db } from '@/storage/db';
import { Folder } from '@/types';

export async function migrateTagsToFolders(): Promise<void> {
  console.log('[PrinChat Migration] Starting tags to folders migration...');

  try {
    // 1. Get all existing tags
    const tags = await db.getAllTags();
    console.log(`[PrinChat Migration] Found ${tags.length} tags to migrate`);

    if (tags.length === 0) {
      console.log('[PrinChat Migration] No tags to migrate');
      return;
    }

    // 2. Convert each tag to a folder
    const folders: Folder[] = tags.map(tag => ({
      id: tag.id, // Keep the same ID for easier migration
      name: tag.name,
      color: tag.color,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    // 3. Save all folders
    for (const folder of folders) {
      await db.saveFolder(folder);
    }
    console.log(`[PrinChat Migration] Created ${folders.length} folders`);

    // 4. Get all messages and update them
    const messages = await db.getAllMessages();
    console.log(`[PrinChat Migration] Updating ${messages.length} messages...`);

    let updated = 0;
    for (const message of messages) {
      // If message has tags, convert first tag to folderId
      if (message.tags && message.tags.length > 0) {
        const firstTagId = message.tags[0];

        // Update message with folderId
        await db.saveMessage({
          ...message,
          folderId: firstTagId, // Use first tag as folder
          tags: undefined, // Remove tags field
        });
        updated++;
      } else {
        // If no tags, just remove the tags field
        await db.saveMessage({
          ...message,
          tags: undefined,
        });
      }
    }

    console.log(`[PrinChat Migration] Updated ${updated} messages with folders`);
    console.log('[PrinChat Migration] Migration completed successfully!');

    // Note: We keep tags in database for now in case user wants to rollback
    // They can be manually deleted later

  } catch (error) {
    console.error('[PrinChat Migration] Migration failed:', error);
    throw error;
  }
}

/**
 * Check if migration is needed
 * Returns true if there are tags in the database but no folders
 */
export async function needsMigration(): Promise<boolean> {
  try {
    const [tags, folders] = await Promise.all([
      db.getAllTags(),
      db.getAllFolders(),
    ]);

    // Migration is needed if there are tags but no folders
    return tags.length > 0 && folders.length === 0;
  } catch (error) {
    console.error('[PrinChat Migration] Error checking migration status:', error);
    return false;
  }
}
