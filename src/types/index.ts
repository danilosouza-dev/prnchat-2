/**
 * Core data types for X1Flox Chrome Extension
 * Defines the structure for Messages, Scripts, Triggers, and Storage
 */

export type MessageType = 'text' | 'audio' | 'image' | 'video';

export interface Tag {
  id: string;
  name: string;
  color: string; // hex color
}

export interface Message {
  id: string;
  type: MessageType;
  content: string; // Text content or media description (internal only)
  caption?: string; // Caption to send with image/video (optional)
  audioData?: Blob | null; // Audio file data (if type is 'audio')
  audioUrl?: string; // URL to audio file (if using external storage)
  imageData?: Blob | null; // Image file data (if type is 'image')
  imageUrl?: string; // URL to image file (if using external storage)
  videoData?: Blob | null; // Video file data (if type is 'video')
  videoUrl?: string; // URL to video file (if using external storage)
  tags: string[]; // Array of tag IDs
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
  delayAfter: number; // Delay in milliseconds after sending this message
}

export interface Script {
  id: string;
  name: string;
  description?: string;
  steps: ScriptStep[];
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
  createdAt: number;
  updatedAt: number;
}

// Storage interfaces
export interface StorageData {
  messages: Record<string, Message>;
  scripts: Record<string, Script>;
  triggers: Record<string, Trigger>;
  tags: Record<string, Tag>;
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
