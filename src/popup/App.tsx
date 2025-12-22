import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Grid,
  Mic,
  MessageCircle,
  Camera,
  FileText,
  Search,
  Folder as FolderIcon,
  Send,
  Zap,
  Video,
  ChevronDown,
  ChevronUp,
  Pin,
  PinOff,
  Move
} from 'lucide-react';
import { Message, Script, Folder, MessageType, ScriptExecutionState } from '@/types';
import { db } from '@/storage/db';
import { getActiveTab, sendMessageToContentScript } from '@/utils/helpers';
import { needsMigration, migrateTagsToFolders } from '@/utils/migration';
import ScriptExecutionModal from './components/ScriptExecutionModal';

type Tab = 'messages' | 'scripts';
type MediaFilter = 'all' | 'folders' | 'audio' | 'text' | 'image' | 'video' | 'file';

// State to sync between Header and FAB popups
interface PopupState {
  activeTab: Tab;
  mediaFilter: MediaFilter;
  searchQuery: string;
  expandedFolders: string[];
  expandedScripts: string[];
  confirmingMessageId: string | null;
  confirmingScriptId: string | null;
}

import logo from '../assets/logo.png';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('messages');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [messages, setMessages] = useState<Message[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [_isExecuting, setIsExecuting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [activeChat, setActiveChat] = useState<{ name: string; photo?: string } | null>(null);
  const [confirmingMessageId, setConfirmingMessageId] = useState<string | null>(null);
  const [confirmingScriptId, setConfirmingScriptId] = useState<string | null>(null);
  const [requireConfirmation, setRequireConfirmation] = useState(true);
  const [executionState, setExecutionState] = useState<ScriptExecutionState | null>(null);
  const [expandedScripts, setExpandedScripts] = useState<Set<string>>(new Set());
  const [isPinned, setIsPinned] = useState(false);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const isInitialized = useRef(false); // Prevent auto-save before restoration


  const togglePin = () => {
    const newPinnedState = !isPinned;
    setIsPinned(newPinnedState);
    // Send message to parent (whatsapp-ui-overlay)
    window.parent.postMessage({
      type: 'PRINCHAT_POPUP_PIN_TOGGLE',
      pinned: newPinnedState
    }, '*');
  };

  const [isFloating, setIsFloating] = useState(false);

  useEffect(() => {
    // Load initial floating state from storage
    chrome.storage.local.get(['princhat_view_mode'], (result) => {
      if (result.princhat_view_mode === 'floating') {
        setIsFloating(true);
      }
    });

    // Listen for changes from other contexts (e.g. other popup instance)
    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes.princhat_view_mode) {
        const newMode = changes.princhat_view_mode.newValue;
        setIsFloating(newMode === 'floating');
      }
    };
    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, []);

  const toggleFloating = () => {
    const newFloatingState = !isFloating;
    setIsFloating(newFloatingState);

    // Save to storage (source of truth)
    chrome.storage.local.set({
      princhat_view_mode: newFloatingState ? 'floating' : 'header'
    });

    // Send message to parent (whatsapp-ui-overlay) for immediate update
    window.parent.postMessage({
      type: 'PRINCHAT_TOGGLE_FAB_MODE',
      floating: newFloatingState
    }, '*');
  };

  // Save popup state to sync between Header and FAB popups
  const savePopupState = () => {
    // Don't save during initial mount - wait for restoration to complete
    if (!isInitialized.current) return;

    const state: PopupState = {
      activeTab,
      mediaFilter,
      searchQuery,
      expandedFolders: Array.from(expandedFolders),
      expandedScripts: Array.from(expandedScripts),
      confirmingMessageId,
      confirmingScriptId
    };
    chrome.storage.local.set({ popup_state: state });
  };

  // Auto-save state when it changes
  useEffect(() => {
    savePopupState();
  }, [activeTab, mediaFilter, searchQuery, expandedFolders, expandedScripts, confirmingMessageId, confirmingScriptId]);

  useEffect(() => {
    // Run migration if needed before loading data
    const initializeApp = async () => {
      if (await needsMigration()) {
        console.log('[PrinChat] Running migration from tags to folders...');
        await migrateTagsToFolders();
      }

      // Restore popup state from storage (sync between Header/FAB)
      chrome.storage.local.get(['popup_state'], (result) => {
        if (result.popup_state) {
          const state = result.popup_state as PopupState;
          console.log('[PrinChat Popup] Restoring state from storage:', state);
          setActiveTab(state.activeTab);
          setMediaFilter(state.mediaFilter);
          setSearchQuery(state.searchQuery);
          setExpandedFolders(new Set(state.expandedFolders));
          setExpandedScripts(new Set(state.expandedScripts));
          setConfirmingMessageId(state.confirmingMessageId);
          setConfirmingScriptId(state.confirmingScriptId);
        }
        // Enable auto-save AFTER restoration completes
        isInitialized.current = true;
      });

      loadData();
      loadActiveChat();
      loadSettings();
    };

    initializeApp();

    // Poll active chat every 2 seconds for real-time updates
    const intervalId = setInterval(() => {
      loadActiveChat();
    }, 2000);

    // Listen for storage changes to reload data in real-time
    // This is especially important for FAB popup iframe
    const handleStorageChange = (changes: any, areaName: string) => {
      // Check if messages, scripts, or folders changed
      if (areaName === 'local' && (changes.messages || changes.scripts || changes.folders)) {
        console.log('[PrinChat] Storage changed, reloading data...');
        loadData();
      }

      // Sync popup state from other popup instance (Header ↔ FAB)
      if (areaName === 'local' && changes.popup_state) {
        const newState = changes.popup_state.newValue as PopupState;
        if (newState) {
          console.log('[PrinChat Popup] Syncing state from other popup:', newState);
          setActiveTab(newState.activeTab);
          setMediaFilter(newState.mediaFilter);
          setSearchQuery(newState.searchQuery);
          setExpandedFolders(new Set(newState.expandedFolders));
          setExpandedScripts(new Set(newState.expandedScripts));
          setConfirmingMessageId(newState.confirmingMessageId);
          setConfirmingScriptId(newState.confirmingScriptId);
        }
      }
    };

    // Listen for execution state changes from content script
    const messageListener = (message: any) => {
      if (message.type === 'EXECUTION_STATE_CHANGED') {
        setExecutionState(message.payload);
      }
      // Don't return true - we're not sending an async response
      return false;
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      clearInterval(intervalId);
      chrome.storage.onChanged.removeListener(handleStorageChange);
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);



  const loadSettings = async () => {
    try {
      const settings = await db.getSettings();
      setRequireConfirmation(settings?.requireSendConfirmation ?? true);
    } catch {
      // Default to true
    }
  };

  const loadActiveChat = async () => {
    try {
      console.log('[PrinChat Popup] 🔄 Loading active chat...');
      const tab = await getActiveTab();
      console.log('[PrinChat Popup] Tab info:', { id: tab?.id, url: tab?.url });

      if (tab?.id && tab?.url?.includes('web.whatsapp.com')) {
        console.log('[PrinChat Popup] 📤 Sending GET_ACTIVE_CHAT request...');
        const response = await sendMessageToContentScript(tab.id, {
          type: 'GET_ACTIVE_CHAT',
          payload: {},
        });

        console.log('[PrinChat Popup] 📥 GET_ACTIVE_CHAT response:', response);

        if (response.success && response.data?.chatName) {
          console.log('[PrinChat Popup] ✅ Setting active chat:', response.data.chatName);
          setActiveChat({
            name: response.data.chatName,
            photo: response.data.chatPhoto
          });
        } else {
          console.log('[PrinChat Popup] ⚠️ No active chat data in response');
          setActiveChat(null);
        }
      } else {
        console.log('[PrinChat Popup] ❌ Not on WhatsApp Web or no tab ID');
      }
    } catch (e) {
      console.error('[PrinChat Popup] ❌ Error loading active chat:', e);
      setActiveChat(null);
    }
  };

  const [dataError, setDataError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      console.log('[PrinChat Popup] Loading data...');
      const [messagesData, scriptsData, foldersData] = await Promise.all([
        db.getAllMessages(),
        db.getAllScripts(),
        db.getAllFolders(),
      ]);
      console.log('[PrinChat Popup] Data loaded:', {
        messages: messagesData.length,
        scripts: scriptsData.length,
        folders: foldersData.length
      });
      setMessages(messagesData);
      setScripts(scriptsData);
      setFolders(foldersData);
      setDataError(null);
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[PrinChat Popup] Error loading data:', msg);
      setDataError(`Erro ao carregar dados: ${msg}`);
    }
  };

  const checkIsWhatsAppWeb = async (): Promise<boolean> => {
    try {
      const tab = await getActiveTab();
      return tab?.url?.includes('web.whatsapp.com') ?? false;
    } catch {
      return false;
    }
  };

  const handleCardClick = (message: Message) => {
    // Only allow selection if confirmation is required
    if (!requireConfirmation) return;

    // Card click toggles selection
    if (confirmingMessageId === message.id) {
      setConfirmingMessageId(null); // Deselect if already selected
    } else {
      setConfirmingMessageId(message.id); // Select
    }
  };

  const handleSendClick = (e: React.MouseEvent, message: Message) => {
    e.stopPropagation();

    if (requireConfirmation) {
      if (confirmingMessageId === message.id) {
        // Second click - confirm and send
        handleSendMessage(message);
        setConfirmingMessageId(null);
      } else {
        // First click - mark for confirmation
        setConfirmingMessageId(message.id);
      }
    } else {
      // No confirmation required - send immediately
      handleSendMessage(message);
    }
  };

  const handleSendMessage = async (message: Message) => {
    const isWhatsAppActive = await checkIsWhatsAppWeb();
    if (!isWhatsAppActive) {
      alert('Abra o WhatsApp Web primeiro!');
      return;
    }

    setIsExecuting(true);

    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error('Tab não encontrada');

      // Deselect card immediately when send starts
      setConfirmingMessageId(null);

      // Helper function to convert Blob to base64
      const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      };

      // IMPORTANT: Convert Blob media to base64 before sending
      // CustomEvent serialization doesn't preserve Blobs
      const processedMessage: any = { ...message };

      if (message.type === 'audio' && message.audioData instanceof Blob) {
        processedMessage.audioData = await blobToBase64(message.audioData);
      } else if (message.type === 'image' && message.imageData instanceof Blob) {
        processedMessage.imageData = await blobToBase64(message.imageData);
      } else if (message.type === 'video' && message.videoData instanceof Blob) {
        processedMessage.videoData = await blobToBase64(message.videoData);
      }

      // Route message through overlay's sendSingleMessage()
      // This ensures popup messages show the execution popup like footer shortcuts do
      // The overlay will handle:
      // 1. Capturing chatId (to send to correct chat even if user switches)
      // 2. Creating execution state with pause/cancel controls
      // 3. Showing execution popup
      // 4. Executing message with delay support
      //
      // IMPORTANT: Send only message ID to avoid chrome.tabs.sendMessage size limits
      // The overlay already has all messages with restored media data from GET_SCRIPTS_AND_MESSAGES
      const response = await sendMessageToContentScript(tab.id, {
        type: 'SEND_SINGLE_MESSAGE',
        payload: {
          messageId: message.id  // Send only ID - overlay will look up full message from its cache
        }
      });

      if (!response.success) {
        throw new Error(response.error || 'Erro ao enviar');
      }
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      console.error('[PrinChat] Error sending message:', errorMessage, err);
      // Don't show alert - UI overlay already shows errors visually
    } finally {
      setIsExecuting(false);
    }
  };

  const handleScriptCardClick = (script: Script) => {
    // Only allow selection if confirmation is required
    if (!requireConfirmation) return;

    // Card click toggles selection
    if (confirmingScriptId === script.id) {
      setConfirmingScriptId(null); // Deselect if already selected
    } else {
      setConfirmingScriptId(script.id); // Select
    }
  };

  const handleScriptExecuteClick = async (e: React.MouseEvent, script: Script) => {
    e.stopPropagation();

    if (requireConfirmation) {
      if (confirmingScriptId === script.id) {
        // Second click - confirm and execute
        await handleExecuteScript(script.id);
        setConfirmingScriptId(null);
      } else {
        // First click - mark for confirmation
        setConfirmingScriptId(script.id);
      }
    } else {
      // No confirmation required - execute immediately
      await handleExecuteScript(script.id);
    }
  };

  const handleExecuteScript = async (scriptId: string) => {
    const isWhatsAppActive = await checkIsWhatsAppWeb();
    if (!isWhatsAppActive) {
      alert('Abra o WhatsApp Web primeiro!');
      return;
    }

    setIsExecuting(true);

    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error('Tab não encontrada');

      // Deselect card immediately when execution starts
      setConfirmingScriptId(null);

      const response = await sendMessageToContentScript(tab.id, {
        type: 'EXECUTE_SCRIPT',
        payload: { scriptId },
      });

      if (!response.success) {
        throw new Error(response.error || 'Erro ao executar script');
      }
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      console.error('[PrinChat] Error executing script:', errorMessage, err);
      // Don't show alert - UI overlay already shows errors visually
      setExecutionState(null);
    } finally {
      setIsExecuting(false);
    }
  };

  const handlePauseScript = async () => {
    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error('Tab não encontrada');

      const response = await sendMessageToContentScript(tab.id, {
        type: 'PAUSE_SCRIPT',
      });

      if (!response.success) {
        console.error('Error pausing script:', response.error);
      }
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      console.error('Error pausing script:', errorMessage, err);
    }
  };

  const handleResumeScript = async () => {
    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error('Tab não encontrada');

      const response = await sendMessageToContentScript(tab.id, {
        type: 'RESUME_SCRIPT',
      });

      if (!response.success) {
        console.error('Error resuming script:', response.error);
      }
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      console.error('Error resuming script:', errorMessage, err);
    }
  };

  const handleCancelScript = async () => {
    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error('Tab não encontrada');

      const response = await sendMessageToContentScript(tab.id, {
        type: 'CANCEL_SCRIPT',
      });

      if (response.success) {
        setExecutionState(null);
      }
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      console.error('Error cancelling script:', errorMessage, err);
    }
  };

  const handleCancelAllScripts = async () => {
    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error('Tab não encontrada');

      const response = await sendMessageToContentScript(tab.id, {
        type: 'CANCEL_ALL_SCRIPTS',
      });

      if (response.success) {
        setExecutionState(null);
      }
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      console.error('Error cancelling all scripts:', errorMessage, err);
    }
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  // Toggle folder expansion
  const toggleFolderExpansion = (folderId: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  // Toggle script expansion
  const toggleScriptExpansion = (scriptId: string) => {
    setExpandedScripts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(scriptId)) {
        newSet.delete(scriptId);
      } else {
        newSet.add(scriptId);
      }
      return newSet;
    });
  };

  // Filter and organize messages
  const getOrganizedMessages = () => {
    let filtered = messages;

    // Filter by type
    if (mediaFilter !== 'all' && mediaFilter !== 'folders') {
      // Image filter includes both images and videos
      if (mediaFilter === 'image') {
        filtered = filtered.filter(m => m.type === 'image' || m.type === 'video');
      } else {
        filtered = filtered.filter(m => m.type === mediaFilter);
      }
    }

    // Filter by search query (search in name and content)
    if (searchQuery.trim()) {
      const search = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        (m.name?.toLowerCase().includes(search)) ||
        m.content.toLowerCase().includes(search)
      );
    }

    // Separate messages by folder
    const messagesByFolder = new Map<string, Message[]>();
    const messagesWithoutFolder: Message[] = [];

    filtered.forEach(msg => {
      if (msg.folderId) {
        if (!messagesByFolder.has(msg.folderId)) {
          messagesByFolder.set(msg.folderId, []);
        }
        messagesByFolder.get(msg.folderId)!.push(msg);
      } else {
        messagesWithoutFolder.push(msg);
      }
    });

    // Sort messages within each group
    messagesByFolder.forEach((msgs) => {
      msgs.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
    });
    messagesWithoutFolder.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));

    return { messagesByFolder, messagesWithoutFolder };
  };

  // Filter scripts (no folder filter for scripts)
  const getFilteredScripts = () => {
    return scripts;
  };

  const { messagesByFolder, messagesWithoutFolder } = getOrganizedMessages();
  const filteredScripts = getFilteredScripts();

  // Message type icon component
  const MessageTypeIcon = ({ type }: { type: MessageType }) => {
    switch (type) {
      case 'audio':
        return <Mic size={16} />;
      case 'text':
        return <MessageCircle size={16} />;
      case 'image':
        return <Camera size={16} />;
      case 'video':
        return <Video size={16} />;
      default:
        return <FileText size={16} />;
    }
  };

  return (
    <div className="popup-dark">
      {/* Header */}
      <header className="header-dark">
        <img src={logo} alt="PrinChat" className="h-6 w-auto" style={{ height: '20px' }} />
        <div className="header-icons">
          {!isFloating && (
            <button
              className={`icon-btn ${isPinned ? 'active' : ''}`}
              onClick={togglePin}
              title={isPinned ? "Desafixar popup" : "Fixar popup"}
            >
              {isPinned ? <PinOff size={18} /> : <Pin size={18} />}
            </button>
          )}

          <button
            className={`icon-btn ${isFloating ? 'active' : ''}`}
            onClick={toggleFloating}
            title={isFloating ? "Voltar ao Header" : "Usar Botão Flutuante"}
          >
            <Move size={18} />
          </button>

          <button className="icon-btn" onClick={openOptions} title="Configurações">
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {dataError && (
        <div style={{ backgroundColor: '#f44336', color: 'white', padding: '10px', fontSize: '12px', textAlign: 'center' }}>
          {dataError}
          <button onClick={() => window.location.reload()} style={{ marginLeft: '10px', textDecoration: 'underline', background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
            Recarregar
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs-dark">
        <button
          className={`tab-dark ${activeTab === 'messages' ? 'active' : ''}`}
          onClick={() => setActiveTab('messages')}
        >
          MENSAGENS
        </button>
        <button
          className={`tab-dark ${activeTab === 'scripts' ? 'active' : ''}`}
          onClick={() => setActiveTab('scripts')}
        >
          SCRIPTS
        </button>
      </div>

      {/* Toolbar - Media type filters - Only show on messages tab */}
      {activeTab === 'messages' && (
        <div className="toolbar-dark">
          <button
            className={`tool-btn ${mediaFilter === 'all' ? 'active' : ''}`}
            onClick={() => setMediaFilter('all')}
            title="Todos"
          >
            <Grid size={18} />
          </button>
          <button
            className={`tool-btn ${mediaFilter === 'folders' ? 'active' : ''}`}
            onClick={() => setMediaFilter('folders')}
            title="Pastas"
          >
            <FolderIcon size={18} />
          </button>
          <button
            className={`tool-btn ${mediaFilter === 'audio' ? 'active' : ''}`}
            onClick={() => setMediaFilter('audio')}
            title="Áudios"
          >
            <Mic size={18} />
          </button>
          <button
            className={`tool-btn ${mediaFilter === 'text' ? 'active' : ''}`}
            onClick={() => setMediaFilter('text')}
            title="Textos"
          >
            <MessageCircle size={18} />
          </button>
          <button
            className={`tool-btn ${mediaFilter === 'image' ? 'active' : ''}`}
            onClick={() => setMediaFilter('image')}
            title="Fotos e Vídeos"
          >
            <Camera size={18} />
          </button>
          <button
            className={`tool-btn ${mediaFilter === 'file' ? 'active' : ''}`}
            onClick={() => setMediaFilter('file')}
            title="Arquivos"
          >
            <FileText size={18} />
          </button>
        </div>
      )}

      {/* Search Messages - Only show on messages tab */}
      {activeTab === 'messages' && (
        <div className="filter-bar-dark">
          <div className="filter-input-wrapper">
            <input
              ref={filterInputRef}
              type="text"
              className="filter-input"
              placeholder="Pesquisar mensagens..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search size={11} strokeWidth={2.5} />
          </div>
          <span className="filter-label">
            <Search size={11} strokeWidth={2.5} />
            Pesquisar
          </span>
        </div>
      )}

      {/* Active Chat */}
      <div className="active-chat-bar">
        <span className="active-chat-label">CHAT ATIVO</span>
        {activeChat ? (
          <div className="active-chat-tag">
            <span className="pulse-dot" />
            {activeChat.photo ? (
              <img src={activeChat.photo} alt={activeChat.name} className="active-chat-photo" />
            ) : (
              <div className="active-chat-photo-placeholder">
                {activeChat.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span>{activeChat.name}</span>
          </div>
        ) : (
          <span className="no-chat">Nenhum chat selecionado</span>
        )}
      </div>

      {/* Content */}
      <div className="content-dark">
        <div className="scrollable-content">
          {activeTab === 'messages' && (
            <>
              {/* Pastas */}
              {folders.map((folder) => {
                const folderMessages = messagesByFolder.get(folder.id) || [];
                // Show empty folders only when filtering by "folders" or "all" (without search)
                if (folderMessages.length === 0 && mediaFilter !== 'folders' && (mediaFilter !== 'all' || searchQuery)) return null;

                // Auto-expand folders when filtering by type or searching
                const shouldAutoExpand = (mediaFilter !== 'all' && mediaFilter !== 'folders' && folderMessages.length > 0) || (searchQuery && folderMessages.length > 0);
                const isFolderExpanded = shouldAutoExpand || expandedFolders.has(folder.id);

                return (
                  <div key={folder.id} style={{ marginBottom: '12px' }}>
                    {/* Folder Header - Enhanced Design */}
                    <div
                      style={{
                        cursor: 'pointer',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '6px',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => toggleFolderExpansion(folder.id)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                      }}
                    >
                      <FolderIcon size={20} color={folder.color} style={{ flexShrink: 0 }} />
                      <span style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        flex: 1,
                        color: 'var(--text-primary)',
                        letterSpacing: '0.3px'
                      }}>
                        {folder.name}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        fontWeight: 500,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        padding: '2px 8px',
                        borderRadius: '10px'
                      }}>
                        {folderMessages.length}
                      </span>
                      {isFolderExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>

                    {/* Messages inside folder - Indented */}
                    <div className={`folder-messages-container ${isFolderExpanded ? 'expanded' : 'collapsed'}`}>
                      <div className="folder-messages-inner">
                        {folderMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`item-dark folder-item ${confirmingMessageId === msg.id ? 'confirming' : ''}`}
                            onClick={() => handleCardClick(msg)}
                            style={{
                              marginBottom: '4px',
                              borderLeftColor: folder.color,
                              '--folder-color': folder.color
                            } as React.CSSProperties & { '--folder-color': string }}
                          >
                            <div className="item-type-icon">
                              <MessageTypeIcon type={msg.type} />
                            </div>
                            <span className="item-text">
                              {msg.name || msg.content.substring(0, 40)}{(!msg.name && msg.content.length > 40) || (msg.name && msg.name.length > 40) ? '...' : ''}
                            </span>
                            <button className="item-action" onClick={(e) => handleSendClick(e, msg)}>
                              <Send size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Mensagens sem pasta - Hide when filtering by folders only */}
              {messagesWithoutFolder.length > 0 && mediaFilter !== 'folders' && (
                <div>
                  {folders.length > 0 && (
                    <div style={{ padding: '8px 16px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      MENSAGENS SEM PASTA
                    </div>
                  )}
                  <div className="items-dark">
                    {messagesWithoutFolder.map((msg) => (
                      <div
                        key={msg.id}
                        className={`item-dark ${confirmingMessageId === msg.id ? 'confirming' : ''}`}
                        onClick={() => handleCardClick(msg)}
                      >
                        <div className="item-type-icon">
                          <MessageTypeIcon type={msg.type} />
                        </div>
                        <span className="item-text">
                          {msg.name || msg.content.substring(0, 40)}{(!msg.name && msg.content.length > 40) || (msg.name && msg.name.length > 40) ? '...' : ''}
                        </span>
                        <button className="item-action" onClick={(e) => handleSendClick(e, msg)}>
                          <Send size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {folders.length === 0 && messagesWithoutFolder.length === 0 && (
                <div className="empty-dark">
                  <p>{messages.length === 0 ? 'Nenhuma mensagem criada' : 'Nenhuma mensagem encontrada'}</p>
                  {messages.length === 0 && (
                    <button className="btn-primary-dark" onClick={openOptions}>
                      Criar primeira mensagem
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'scripts' && (
            <section className="section-dark">
              <h3 className="section-title-dark">SCRIPTS PRONTOS</h3>
              {filteredScripts.map((script) => {
                const isExpanded = expandedScripts.has(script.id);
                return (
                  <div key={script.id} style={{ marginBottom: '12px' }}>
                    <div
                      className={`item-dark ${confirmingScriptId === script.id ? 'confirming' : ''}`}
                      onClick={() => handleScriptCardClick(script)}
                    >
                      <div className="item-type-icon">
                        <Zap size={16} />
                      </div>
                      <span className="item-text">{script.name}</span>
                      <button
                        className="item-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleScriptExpansion(script.id);
                        }}
                        title={isExpanded ? "Recolher" : "Expandir"}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      <button className="item-action" onClick={(e) => handleScriptExecuteClick(e, script)}>
                        <Send size={16} />
                      </button>
                    </div>

                    {/* Expanded Script Steps */}
                    {isExpanded && (
                      <div style={{
                        marginLeft: '12px',
                        marginTop: '6px',
                        padding: '12px',
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '6px',
                        borderLeft: '3px solid var(--accent-pink)'
                      }}>
                        <div style={{ marginBottom: '8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          MENSAGENS ({script.steps.length})
                        </div>
                        {script.steps.map((step, index) => (
                          <div
                            key={index}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '6px 8px',
                              marginBottom: '4px',
                              backgroundColor: 'rgba(255, 255, 255, 0.02)',
                              borderRadius: '4px',
                              fontSize: '12px'
                            }}
                          >
                            <span style={{ color: 'var(--text-muted)', fontWeight: 600, minWidth: '20px' }}>
                              {index + 1}.
                            </span>
                            <span style={{ flex: 1, color: 'var(--text-primary)' }}>
                              {messages.find(m => m.id === step.messageId)?.name || 'Mensagem não encontrada'}
                            </span>
                            {step.delayAfter > 0 && (
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                {step.delayAfter / 1000}s
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredScripts.length === 0 && (
                <div className="empty-dark">
                  <p>Nenhum script criado</p>
                  <button className="btn-primary-dark" onClick={openOptions}>
                    Criar primeiro script
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="footer-dark">
        <a href="https://leadzy.com.br" target="_blank" rel="noopener noreferrer">
          www.bunker707.com.br
        </a>
        <p className="copyright">Copyright © 2023 - Todos direitos Reservados - 2.0.2</p>
      </footer>

      {/* Script Execution Modal */}
      <ScriptExecutionModal
        executionState={executionState}
        onPause={handlePauseScript}
        onResume={handleResumeScript}
        onCancel={handleCancelScript}
        onCancelAll={handleCancelAllScripts}
      />
      {/* DEBUG FOOTER - Remove after fixing */}
      {/* Footer removed */}

    </div>
  );
};

export default App;
