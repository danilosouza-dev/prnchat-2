/**
 * Utility functions for PrinChat
 */

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format duration in milliseconds to human-readable format
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format timestamp to date string
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) {
    return `Hoje às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffInDays === 1) {
    return `Ontem às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffInDays < 7) {
    return `${diffInDays} dias atrás`;
  } else {
    return date.toLocaleDateString('pt-BR');
  }
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Download a file
 */
export function downloadFile(content: string, filename: string, contentType: string = 'text/plain'): void {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Read file as text
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Get audio duration from blob
 */
export function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.addEventListener('loadedmetadata', () => {
      resolve(audio.duration);
      URL.revokeObjectURL(audio.src);
    });
    audio.addEventListener('error', reject);
    audio.src = URL.createObjectURL(blob);
  });
}

/**
 * Calculate total script duration
 */
export function calculateScriptDuration(
  steps: Array<{ delayAfter: number }>,
  messageDurations: Record<string, number> = {}
): number {
  return steps.reduce((total, step) => {
    const messageDuration = messageDurations[step.delayAfter] || 0;
    return total + messageDuration + step.delayAfter;
  }, 0);
}

/**
 * Validate WhatsApp Web is active
 */
export async function isWhatsAppWebActive(): Promise<boolean> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url?.includes('web.whatsapp.com') ?? false;
  } catch {
    return false;
  }
}

/**
 * Send message to content script
 */
export async function sendMessageToContentScript<T = any>(
  tabId: number,
  message: any
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Get active tab
 */
export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  try {
    // Strategy 1: Active tab in current window
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // If we have a tab and it's WhatsApp Web, return it
    if (tab?.url?.includes('web.whatsapp.com')) {
      return tab;
    }

    // Strategy 2: If we are in a popup (unfocused window maybe? or iframe), 
    // try to find ANY tab with web.whatsapp.com
    const whatsappTabs = await chrome.tabs.query({ url: '*://web.whatsapp.com/*' });
    // Prefer active one if possible, otherwise first found
    const activeWhatsApp = whatsappTabs.find(t => t.active) || whatsappTabs[0];

    return activeWhatsApp || tab || null;
  } catch {
    return null;
  }
}
