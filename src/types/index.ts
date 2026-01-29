/**
 * Core data types for PrinChat Chrome Extension
 * Defines the structure for Messages, Scripts, Triggers, and Storage
 */

export type MessageType = 'text' | 'audio' | 'image' | 'video' | 'file';

export interface Tag {
  id: string;
  name: string;
  color: string; // hex color
}

export interface Folder {
  id: string;
  name: string;
  color: string; // hex color
  order?: number; // order for displaying folders
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  name?: string; // Display name for the message (optional, defaults to content preview)
  type: MessageType;
  content: string; // Text content or media description (internal only)
  caption?: string; // Caption to send with image/video/file (optional)
  audioData?: Blob | null; // Audio file data (if type is 'audio')
  audioUrl?: string; // URL to audio file (if using external storage)
  imageData?: Blob | null; // Image file data (if type is 'image')
  imageUrl?: string; // URL to image file (if using external storage)
  videoData?: Blob | null; // Video file data (if type is 'video')
  videoUrl?: string; // URL to video file (if using external storage)
  fileData?: Blob | null; // File data (if type is 'file')
  fileUrl?: string; // URL to file (if using external storage)
  fileName?: string; // Original file name (if type is 'file')
  folderId?: string; // ID of the folder this message belongs to (optional - messages without folder are "unfiled")
  tags?: string[]; // Deprecated: Array of tag IDs (kept for migration purposes)
  duration?: number; // Duration in seconds (for audio/video)
  order?: number; // Display order (for drag-and-drop sorting)
  showTyping?: boolean; // Show typing animation before sending text message (default: false)
  showRecording?: boolean; // Show recording animation before sending audio message (default: false)
  sendDelay?: number; // Delay in milliseconds before sending the message (default: 0 for images/videos, can be configured for all types)
  createdAt: number; // Timestamp
  updatedAt: number; // Timestamp
}

export interface ScriptStep {
  messageId: string;
  delayAfter: number; // Delay in milliseconds before sending this message (despite the name, it's applied before)
}

export interface Script {
  id: string;
  title: string; // Database field
  name?: string; // Legacy field (mapped to title)
  content?: string; // Database field (JSON string of steps?)
  description?: string;
  steps: ScriptStep[];
  tags?: string[];
  usageCount?: number;
  totalDuration: number; // Total estimated duration in milliseconds
  createdAt: number;
  updatedAt: number;
}

export type TriggerConditionType = 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'regex';

export interface TriggerCondition {
  type: TriggerConditionType;
  value: string;
  caseSensitive: boolean;
}

export interface Trigger {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  conditions: TriggerCondition[];
  scriptId: string; // Script to execute when triggered
  skipContacts?: boolean; // Don't trigger for individual contacts
  skipGroups?: boolean; // Don't trigger for groups
  createdAt: number;
  updatedAt: number;
}

export interface Signature {
  id: string;
  title: string; // Required for Sync
  text: string;
  content?: string; // Mapped to text for Sync
  formatting: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    monospace: boolean;
  };
  spacing: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Note {
  id: string;
  chatId: string;
  chatName: string;
  chatPhoto?: string;
  title: string; // Required title for the note
  content: string; // HTML content from TipTap editor
  createdAt: number;
  updatedAt: number;
}

export interface Schedule {
  id: string;
  chatId: string;
  chatName: string;
  type: 'message' | 'script';
  itemId: string; // messageId or scriptId
  itemName: string; // Name of message or script
  scheduledTime: number; // timestamp
  status: 'pending' | 'paused' | 'completed' | 'cancelled' | 'failed';
  createdAt: number;
  updatedAt: number;
}

// Storage interfaces
export interface StorageData {
  messages: Record<string, Message>;
  scripts: Record<string, Script>;
  triggers: Record<string, Trigger>;
  tags: Record<string, Tag>; // Deprecated: kept for migration
  folders: Record<string, Folder>;
  settings: Settings;
}

export interface Settings {
  storageType: 'local' | 'remote'; // Local (IndexedDB) or Remote (Supabase/S3)
  remoteConfig?: {
    url: string;
    apiKey?: string;
  };
  autoBackup: boolean;
  defaultDelay: number; // Default delay between messages in milliseconds
  requireSendConfirmation?: boolean; // Require two clicks to send messages (default: true)
  showShortcuts?: boolean; // Show shortcut bar in WhatsApp Web (default: true)
  showFloatingButton?: boolean; // Show floating action button in WhatsApp Web (default: false)
  showScriptExecutionPopup?: boolean; // Show script execution progress popup (default: true)
  showMessageExecutionPopup?: boolean; // Show message sending progress popup for delayed messages (default: true)
}

// Message for communication between popup/options and content script
export type ActionType =
  | 'SEND_MESSAGE'
  | 'SEND_AUDIO'
  | 'SEND_IMAGE'
  | 'SEND_VIDEO'
  | 'SEND_FILE'
  | 'EXECUTE_SCRIPT'
  | 'PAUSE_SCRIPT'
  | 'RESUME_SCRIPT'
  | 'CANCEL_SCRIPT'
  | 'CANCEL_ALL_SCRIPTS'
  | 'GET_EXECUTION_STATE'
  | 'CHECK_WHATSAPP_READY'
  | 'GET_ACTIVE_CHAT';

export interface Action {
  type: ActionType;
  payload?: any;
}

export interface ActionResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// Script execution state
export interface ScriptExecutionState {
  scriptId: string;
  scriptName: string;
  totalMessages: number;
  sentMessages: number;
  isRunning: boolean;
  isPaused: boolean;
  startTime: number;
  currentStepIndex: number;
}

// UI State types
export interface PopupState {
  searchQuery: string;
  selectedTags: string[];
  selectedScript: string | null;
  isExecuting: boolean;
}

export interface OptionsTab {
  id: 'messages' | 'scripts' | 'triggers' | 'settings';
  label: string;
}
