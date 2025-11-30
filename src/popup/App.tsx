import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  Settings,
  Grid,
  Mic,
  MessageCircle,
  Camera,
  FileText,
  Filter,
  Tag as LucideTag,
  Send,
  PlayCircle,
  Video
} from 'lucide-react';
import { Message, Script, Tag, MessageType, ScriptExecutionState } from '@/types';
import { db } from '@/storage/db';
import { getActiveTab, sendMessageToContentScript } from '@/utils/helpers';
import ScriptExecutionModal from './components/ScriptExecutionModal';

type Tab = 'messages' | 'scripts';
type MediaFilter = 'all' | 'audio' | 'text' | 'image' | 'video' | 'file';

interface Notification {
  id: string;
  type: 'promo' | 'alert' | 'update';
  title: string;
  message: string;
  timestamp: number;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('messages');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [messages, setMessages] = useState<Message[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [_isExecuting, setIsExecuting] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [activeChat, setActiveChat] = useState<{ name: string; photo?: string } | null>(null);
  const [confirmingMessageId, setConfirmingMessageId] = useState<string | null>(null);
  const [confirmingScriptId, setConfirmingScriptId] = useState<string | null>(null);
  const [requireConfirmation, setRequireConfirmation] = useState(true);
  const [executionState, setExecutionState] = useState<ScriptExecutionState | null>(null);
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
    loadData();
    loadActiveChat();
    loadSettings();

    // Poll active chat every 2 seconds for real-time updates
    const intervalId = setInterval(() => {
      loadActiveChat();
    }, 2000);

    // Listen for storage changes to reload data in real-time
    // This is especially important for FAB popup iframe
    const handleStorageChange = (changes: any, areaName: string) => {
      // Check if messages, scripts, or tags changed
      if (areaName === 'local' && (changes.messages || changes.scripts || changes.tags)) {
        console.log('[X1Flox] Storage changed, reloading data...');
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
      const [messagesData, scriptsData, tagsData] = await Promise.all([
        db.getAllMessages(),
        db.getAllScripts(),
        db.getAllTags(),
      ]);
      setMessages(messagesData);
      setScripts(scriptsData);
      setTags(tagsData);
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
      const response = await sendMessageToContentScript(tab.id, {
        type: 'SEND_SINGLE_MESSAGE',
        payload: {
          message: processedMessage  // Pass message with base64 media data
        }
      });

      if (!response.success) {
        throw new Error(response.error || 'Erro ao enviar');
      }
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      console.error('[X1Flox] Error sending message:', errorMessage, err);
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
      console.error('[X1Flox] Error executing script:', errorMessage, err);
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

  // Get matching tags based on filter input
  const getMatchingTags = () => {
    if (!tagFilter.trim()) return [];
    const search = tagFilter.toLowerCase();
    return tags.filter(t => t.name.toLowerCase().includes(search));
  };

  // Handle tag selection
  const handleTagSelect = (tag: Tag) => {
    setSelectedTag(tag);
    setTagFilter(tag.name);
    setShowTagDropdown(false);
  };

  // Clear selected tag
  const clearTagFilter = () => {
    setSelectedTag(null);
    setTagFilter('');
    setShowTagDropdown(false);
  };

  // Filter messages by type and selected tag, sorted by order
  const getFilteredMessages = () => {
    let filtered = messages;

    // Filter by media type
    if (mediaFilter !== 'all') {
      filtered = filtered.filter(m => m.type === mediaFilter);
    }

    // Filter by selected tag
    if (selectedTag) {
      filtered = filtered.filter(m => m.tags && m.tags.includes(selectedTag.id));
    }

    // Sort by order (fallback to createdAt)
    return filtered.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
  };

  // Filter scripts (no tag filter for scripts)
  const getFilteredScripts = () => {
    return scripts;
  };

  const matchingTags = getMatchingTags();
  const filteredMessages = getFilteredMessages();
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

  // Tag icon component (solid tag with color)
  const TagIcon = ({ color, size = 12 }: { color: string; size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>
    </svg>
  );


  return (
    <div className="popup-dark">
      {/* Header */}
      <header className="header-dark">
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
            title="Fotos"
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

      {/* Filter by Tag - Only show on messages tab */}
      {activeTab === 'messages' && (
        <div className="filter-bar-dark">
          <div className="filter-input-wrapper">
            {selectedTag ? (
              <div className="selected-tag">
                <TagIcon color={selectedTag.color || '#e91e63'} size={14} />
                <span>{selectedTag.name}</span>
                <button className="clear-tag" onClick={clearTagFilter}>×</button>
              </div>
            ) : (
              <>
                <input
                  ref={filterInputRef}
                  type="text"
                  className="filter-input"
                  placeholder="Digite para buscar tag..."
                  value={tagFilter}
                  onChange={(e) => {
                    setTagFilter(e.target.value);
                    setShowTagDropdown(e.target.value.trim().length > 0);
                  }}
                  onFocus={() => tagFilter.trim() && setShowTagDropdown(true)}
                  onBlur={() => setTimeout(() => setShowTagDropdown(false), 200)}
                />
                <Filter size={11} strokeWidth={2.5} />
              </>
            )}
            {showTagDropdown && matchingTags.length > 0 && (
              <div className="tag-dropdown">
                {matchingTags.map(tag => (
                  <div
                    key={tag.id}
                    className="tag-option"
                    onClick={() => handleTagSelect(tag)}
                  >
                    <TagIcon color={tag.color || '#e91e63'} size={14} />
                    <span>{tag.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <span className="filter-label">
            <LucideTag size={11} strokeWidth={2.5} />
            Filtrar por Tag
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
              {filteredMessages.length > 0 && (
                <div className="items-dark">
                  {filteredMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`item-dark ${confirmingMessageId === msg.id ? 'confirming' : ''}`}
                      onClick={() => handleCardClick(msg)}
                    >
                      <div className="item-type-icon">
                        <MessageTypeIcon type={msg.type} />
                      </div>
                      <span className="item-text">
                        {msg.content.substring(0, 50)}{msg.content.length > 50 ? '...' : ''}
                      </span>
                      <button className="item-action" onClick={(e) => handleSendClick(e, msg)}>
                        <Send size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {filteredMessages.length === 0 && (
                <div className="empty-dark">
                  <p>{selectedTag ? 'Nenhuma mensagem com esta tag' : 'Nenhuma mensagem criada'}</p>
                  {!selectedTag && (
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
              <div className="items-dark">
                {filteredScripts.map((script) => (
                  <div
                    key={script.id}
                    className={`item-dark ${confirmingScriptId === script.id ? 'confirming' : ''}`}
                    onClick={() => handleScriptCardClick(script)}
                  >
                    <div className="item-bullet" />
                    <span className="item-text">{script.name}</span>
                    <button className="item-action" onClick={(e) => handleScriptExecuteClick(e, script)}>
                      <PlayCircle size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {filteredScripts.length === 0 && (
                <div className="empty-dark">
                  <p>{tagFilter ? 'Nenhum script encontrado' : 'Nenhum script criado'}</p>
                  {!tagFilter && (
                    <button className="btn-primary-dark" onClick={openOptions}>
                      Criar primeiro script
                    </button>
                  )}
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
