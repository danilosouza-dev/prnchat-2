/**
 * Chrome Storage wrapper for sync settings
 * Uses chrome.storage.sync for small settings that should sync across devices
 * Uses chrome.storage.local for larger data and cached state
 */

export class ChromeStorageService {
  // ==================== SYNC STORAGE (max 8KB per item, 100KB total) ====================
  async setSyncData<T>(key: string, value: T): Promise<void> {
    try {
      await chrome.storage.sync.set({ [key]: value });
    } catch (error) {
      console.error(`Error setting sync data for key ${key}:`, error);
      throw error;
    }
  }

  async getSyncData<T>(key: string): Promise<T | null> {
    try {
      const result = await chrome.storage.sync.get(key);
      return result[key] ?? null;
    } catch (error) {
      console.error(`Error getting sync data for key ${key}:`, error);
      return null;
    }
  }

  async removeSyncData(key: string): Promise<void> {
    try {
      await chrome.storage.sync.remove(key);
    } catch (error) {
      console.error(`Error removing sync data for key ${key}:`, error);
      throw error;
    }
  }

  // ==================== LOCAL STORAGE (larger quota) ====================
  async setLocalData<T>(key: string, value: T): Promise<void> {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (error) {
      console.error(`Error setting local data for key ${key}:`, error);
      throw error;
    }
  }

  async getLocalData<T>(key: string): Promise<T | null> {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key] ?? null;
    } catch (error) {
      console.error(`Error getting local data for key ${key}:`, error);
      return null;
    }
  }

  async removeLocalData(key: string): Promise<void> {
    try {
      await chrome.storage.local.remove(key);
    } catch (error) {
      console.error(`Error removing local data for key ${key}:`, error);
      throw error;
    }
  }

  // ==================== UTILITY ====================
  async clearAllSync(): Promise<void> {
    try {
      await chrome.storage.sync.clear();
    } catch (error) {
      console.error('Error clearing sync storage:', error);
      throw error;
    }
  }

  async clearAllLocal(): Promise<void> {
    try {
      await chrome.storage.local.clear();
    } catch (error) {
      console.error('Error clearing local storage:', error);
      throw error;
    }
  }

  // Listen to storage changes
  onChanged(
    callback: (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: 'sync' | 'local' | 'managed' | 'session'
    ) => void
  ): void {
    chrome.storage.onChanged.addListener(callback);
  }
}

// Export singleton instance
export const chromeStorage = new ChromeStorageService();
