import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
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
  ChevronUp
} from 'lucide-react';
import { Message, Script, Folder, MessageType, ScriptExecutionState } from '@/types';
import { db } from '@/storage/db';
import { getActiveTab, sendMessageToContentScript } from '@/utils/helpers';
import { needsMigration, migrateTagsToFolders } from '@/utils/migration';
import ScriptExecutionModal from './components/ScriptExecutionModal';

type Tab = 'messages' | 'scripts';
type MediaFilter = 'all' | 'folders' | 'audio' | 'text' | 'image' | 'video' | 'file';

interface Notification {
  id: string;
  type: 'promo' | 'alert' | 'update';
  title: string;
  message: string;
  timestamp: number;
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
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'promo',
      title: 'Promoção Especial!',
      message: 'Ganhe 50% de desconto nos próximos 3 meses. Aproveite!',
      timestamp: Date.now() - 3600000, // 1 hora atrás
    },
    {
      id: '2',
      type: 'update',
      title: 'Nova Atualização Disponível',
      message: 'Versão 2.1.0 com melhorias de performance e novos recursos.',
      timestamp: Date.now() - 86400000, // 1 dia atrás
    },
    {
      id: '3',
      type: 'alert',
      title: 'Manutenção Programada',
      message: 'Sistema estará em manutenção dia 25/11 das 2h às 4h.',
      timestamp: Date.now() - 172800000, // 2 dias atrás
    },
  ]);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Run migration if needed before loading data
    const initializeApp = async () => {
      if (await needsMigration()) {
        console.log('[PrinChat] Running migration from tags to folders...');
        await migrateTagsToFolders();
      }
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

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

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
      const tab = await getActiveTab();
      if (tab?.id && tab?.url?.includes('web.whatsapp.com')) {
        const response = await sendMessageToContentScript(tab.id, {
          type: 'GET_ACTIVE_CHAT',
          payload: {},
        });
        if (response.success && response.data?.chatName) {
          setActiveChat({
            name: response.data.chatName,
            photo: response.data.chatPhoto
          });
        }
      }
    } catch {
      // No active chat
    }
  };

  const loadData = async () => {
    try {
      const [messagesData, scriptsData, foldersData] = await Promise.all([
        db.getAllMessages(),
        db.getAllScripts(),
        db.getAllFolders(),
      ]);
      setMessages(messagesData);
      setScripts(scriptsData);
      setFolders(foldersData);
    } catch (err) {
      // Error loading data silently
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

  // Format relative time for notifications
  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'agora';
    if (minutes < 60) return `${minutes}m atrás`;
    if (hours < 24) return `${hours}h atrás`;
    return `${days}d atrás`;
  };

  // Remove notification
  const removeNotification = (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id));
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
          <div className="notification-wrapper" ref={notificationRef}>
            <button
              className={`icon-btn notification-btn ${showNotifications ? 'active' : ''}`}
              onClick={() => setShowNotifications(!showNotifications)}
              title="Notificações"
            >
              <Bell size={18} />
              {notifications.length > 0 && (
                <span className="notification-badge">{notifications.length}</span>
              )}
            </button>

            {showNotifications && (
              <div className="notification-dropdown">
                <div className="notification-header">
                  <span>Notificações</span>
                  {notifications.length > 0 && (
                    <button
                      className="clear-all-btn"
                      onClick={() => setNotifications([])}
                    >
                      Limpar tudo
                    </button>
                  )}
                </div>

                {notifications.length > 0 ? (
                  <div className="notification-list">
                    {notifications.map((notif) => (
                      <div key={notif.id} className={`notification-item ${notif.type}`}>
                        <div className="notification-icon">
                          {notif.type === 'promo' && '🎉'}
                          {notif.type === 'update' && '🔔'}
                          {notif.type === 'alert' && '⚠️'}
                        </div>
                        <div className="notification-content">
                          <div className="notification-title">{notif.title}</div>
                          <div className="notification-message">{notif.message}</div>
                          <div className="notification-time">{formatRelativeTime(notif.timestamp)}</div>
                        </div>
                        <button
                          className="notification-close"
                          onClick={() => removeNotification(notif.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="notification-empty">
                    Nenhuma notificação no momento
                  </div>
                )}
              </div>
            )}
          </div>

          <button className="icon-btn" onClick={openOptions} title="Configurações">
            <Settings size={18} />
          </button>
        </div>
      </header>

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
    </div>
  );
};

export default App;
