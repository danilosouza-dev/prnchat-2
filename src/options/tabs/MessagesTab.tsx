import React, { useState, useEffect } from 'react';
import { Message, Folder, MessageType } from '@/types';
import { db } from '@/storage/db';
import { generateId, formatDate, getAudioDuration, downloadFile } from '@/utils/helpers';
import NewMessageModal from '../components/NewMessageModal';
import CustomAudioPlayer from '../components/CustomAudioPlayer';
import FolderManagementModal from '../components/FolderManagementModal';
import { Tabs, TabsList, TabsTrigger, Button, Card, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui';
import { Grid, Mic, MessageCircle, Camera, Video, FileText, GripVertical, Edit2, Trash2, ChevronDown, ChevronUp, Plus, Search, Folder as FolderIcon, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';

interface MessagesTabProps {
  setHeaderActions?: (actions: React.ReactNode) => void;
}

const MessagesTab: React.FC<MessagesTabProps> = ({ setHeaderActions }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<MessageType | 'all' | 'folders'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [blobUrls, setBlobUrls] = useState<Map<string, string>>(new Map());
  const [showFolderManager, setShowFolderManager] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    type: MessageType;
    content: string;
    caption: string;
    audioData: Blob | null;
    imageData: Blob | null;
    videoData: Blob | null;
    fileData: Blob | null;
    fileName: string;
    folderId?: string;
    showTyping: boolean;
    showRecording: boolean;
    sendDelay: number;
  }>({
    name: '',
    type: 'text',
    content: '',
    caption: '',
    audioData: null,
    imageData: null,
    videoData: null,
    fileData: null,
    fileName: '',
    showTyping: false,
    showRecording: false,
    sendDelay: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  // Manage blob URLs for expanded cards
  useEffect(() => {
    const newBlobUrls = new Map<string, string>();

    // Create URLs for expanded messages
    expandedCards.forEach(messageId => {
      const message = messages.find(m => m.id === messageId);
      if (message) {
        if (message.audioData && !blobUrls.has(`${messageId}-audio`)) {
          const url = URL.createObjectURL(message.audioData);
          newBlobUrls.set(`${messageId}-audio`, url);
        }
        if (message.imageData && !blobUrls.has(`${messageId}-image`)) {
          const url = URL.createObjectURL(message.imageData);
          newBlobUrls.set(`${messageId}-image`, url);
        }
        if (message.videoData && !blobUrls.has(`${messageId}-video`)) {
          const url = URL.createObjectURL(message.videoData);
          newBlobUrls.set(`${messageId}-video`, url);
        }
      }
    });

    // Revoke URLs that are no longer needed
    blobUrls.forEach((url, key) => {
      const messageId = key.split('-')[0];
      if (!expandedCards.has(messageId)) {
        URL.revokeObjectURL(url);
      } else {
        newBlobUrls.set(key, url);
      }
    });

    setBlobUrls(newBlobUrls);

    // Cleanup on unmount
    return () => {
      newBlobUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [expandedCards, messages]);

  const loadData = async () => {
    const [messagesData, foldersData] = await Promise.all([
      db.getAllMessages(),
      db.getAllFolders(),
    ]);
    // Sort by order (fallback to createdAt for older messages/folders)
    setMessages(messagesData.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)));
    setFolders(foldersData.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)));
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setEditingMessage(null);
    setFormData({
      name: '',
      type: 'text',
      content: '',
      caption: '',
      audioData: null,
      imageData: null,
      videoData: null,
      fileData: null,
      fileName: '',
      folderId: undefined,
      showTyping: false,
      showRecording: false,
      sendDelay: 0,
    });
  };

  const handleEdit = (message: Message) => {
    setIsCreating(true);
    setEditingMessage(message);
    setFormData({
      name: message.name || '',
      type: message.type,
      content: message.content,
      caption: message.caption || '',
      audioData: message.audioData || null,
      imageData: message.imageData || null,
      videoData: message.videoData || null,
      fileData: message.fileData || null,
      fileName: message.fileName || '',
      folderId: message.folderId,
      showTyping: message.showTyping || false,
      showRecording: message.showRecording || false,
      sendDelay: message.sendDelay ?? 0,
    });
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingMessage(null);
    setFormData({
      name: '',
      type: 'text',
      content: '',
      caption: '',
      audioData: null,
      imageData: null,
      videoData: null,
      fileData: null,
      fileName: '',
      folderId: undefined,
      showTyping: false,
      showRecording: false,
      sendDelay: 0,
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Por favor, preencha o nome da mensagem');
      return;
    }

    if (!formData.content.trim()) {
      toast.error('Por favor, preencha o conteúdo da mensagem');
      return;
    }

    if (formData.type === 'audio' && !formData.audioData) {
      toast.error('Por favor, grave ou faça upload de um áudio');
      return;
    }

    if (formData.type === 'image' && !formData.imageData) {
      toast.error('Por favor, selecione uma imagem');
      return;
    }

    if (formData.type === 'video' && !formData.videoData) {
      toast.error('Por favor, selecione um vídeo');
      return;
    }

    if (formData.type === 'file' && !formData.fileData) {
      toast.error('Por favor, selecione um arquivo');
      return;
    }

    try {
      let duration: number | undefined;
      if (formData.type === 'audio' && formData.audioData) {
        duration = await getAudioDuration(formData.audioData);
      }

      const message: Message = {
        id: editingMessage?.id || generateId(),
        name: formData.name.trim() || undefined,
        type: formData.type,
        content: formData.content,
        caption: (formData.type === 'image' || formData.type === 'video' || formData.type === 'file') ? formData.caption : undefined,
        audioData: formData.audioData,
        imageData: formData.imageData,
        videoData: formData.videoData,
        fileData: formData.fileData,
        fileName: formData.fileName,
        folderId: formData.folderId,
        duration,
        showTyping: formData.type === 'text' ? formData.showTyping : undefined,
        showRecording: formData.type === 'audio' ? formData.showRecording : undefined,
        sendDelay: formData.sendDelay,
        order: editingMessage?.order ?? messages.length,
        createdAt: editingMessage?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      await db.saveMessage(message);
      await loadData();
      handleCancel();

      if (editingMessage) {
        toast.success('Mensagem atualizada com sucesso!');
      } else {
        toast.success('Mensagem criada com sucesso!');
      }
    } catch (error) {
      console.error('Error saving message:', error);
      toast.error('Erro ao salvar mensagem');
    }
  };

  const handleDelete = async (id: string) => {
    setMessageToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!messageToDelete) return;

    try {
      await db.deleteMessage(messageToDelete);
      await loadData();
      toast.success('Mensagem excluída com sucesso!');
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Erro ao excluir mensagem');
    } finally {
      setDeleteDialogOpen(false);
      setMessageToDelete(null);
    }
  };

  const handleExport = async () => {
    try {
      const data = await db.exportData();
      downloadFile(data, `x1flox-backup-${Date.now()}.json`, 'application/json');
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Erro ao exportar dados');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      await db.importData(content);
      await loadData();
      alert('Dados importados com sucesso!');
    } catch (error) {
      console.error('Error importing data:', error);
      alert('Erro ao importar dados');
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const draggedIndex = messages.findIndex(m => m.id === draggedId);
    const targetIndex = messages.findIndex(m => m.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const reorderedMessages = [...messages];
    const [removed] = reorderedMessages.splice(draggedIndex, 1);
    reorderedMessages.splice(targetIndex, 0, removed);

    // Update order for all messages
    const updatedMessages = reorderedMessages.map((msg, index) => ({
      ...msg,
      order: index,
    }));

    setMessages(updatedMessages);

    // Save all messages with updated order
    try {
      await Promise.all(updatedMessages.map(msg => db.saveMessage(msg)));
    } catch (error) {
      console.error('Error reordering messages:', error);
      toast.error('Erro ao reordenar mensagens');
      await loadData(); // Reload on error
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
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

  // Toggle card expansion
  const toggleCardExpansion = (messageId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  // Filter and organize messages
  const getOrganizedMessages = () => {
    let filtered = messages;

    // Filter by type
    if (typeFilter !== 'all' && typeFilter !== 'folders') {
      filtered = filtered.filter(m => m.type === typeFilter);
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

  const { messagesByFolder, messagesWithoutFolder } = getOrganizedMessages();

  // Get icon for message type
  const getMessageTypeIcon = (type: MessageType) => {
    switch (type) {
      case 'audio':
        return <Mic size={16} className="text-[var(--text-secondary)]" />;
      case 'text':
        return <MessageCircle size={16} className="text-[var(--text-secondary)]" />;
      case 'image':
        return <Camera size={16} className="text-[var(--text-secondary)]" />;
      case 'video':
        return <Video size={16} className="text-[var(--text-secondary)]" />;
      default:
        return <MessageCircle size={16} className="text-[var(--text-secondary)]" />;
    }
  };

  // Render message card (used both inside folders and standalone)
  const renderMessageCard = (message: Message, index: number, folderColor?: string) => {
    const isExpanded = expandedCards.has(message.id);

    return (
      <Card
        key={message.id}
        draggable
        onDragStart={(e) => handleDragStart(e, message.id)}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, message.id)}
        onDragEnd={handleDragEnd}
        className={`
          transition-all duration-200 ease-out cursor-move p-3
          border-l-[3px] border-l-transparent
          hover:bg-[var(--bg-tertiary)]
          hover:shadow-[0_4px_12px_rgba(0,0,0,0.4),0_2px_6px_rgba(0,0,0,0.2)]
          ${draggedId === message.id ? 'opacity-50' : ''}
        `}
        style={{
          borderLeftColor: folderColor || 'transparent',
          '--folder-color': folderColor || '#e91e63'
        } as React.CSSProperties & { '--folder-color': string }}
      >
        {/* Header do Card */}
        <div className="flex items-center gap-2.5 group">
          {/* Número */}
          <span className="text-xs font-semibold text-[var(--text-secondary)] min-w-[1.5rem]">
            {index + 1}
          </span>

          {/* Ícone do tipo */}
          <div className="flex items-center justify-center w-7 h-7 rounded bg-[var(--bg-tertiary)] transition-colors group-hover:text-[#e91e63]">
            {getMessageTypeIcon(message.type)}
          </div>

          {/* Nome/Descrição */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span className="text-xs text-[var(--text-primary)] overflow-hidden text-ellipsis whitespace-nowrap flex-shrink min-w-0">
              {message.name || message.content.substring(0, 60)}{!message.name && message.content.length > 60 ? '...' : ''}
            </span>
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                toggleCardExpansion(message.id);
              }}
              title={isExpanded ? "Recolher" : "Expandir"}
              className="h-9 w-9 opacity-60 hover:opacity-100 transition-all duration-200 hover:text-[#e91e63] hover:scale-110"
            >
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleEdit(message);
              }}
              title="Editar"
              className="h-9 w-9 opacity-60 hover:opacity-100 transition-all duration-200 hover:text-[#e91e63] hover:scale-110"
            >
              <Edit2 size={18} />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(message.id);
              }}
              title="Excluir"
              className="h-9 w-9 opacity-60 hover:opacity-100 transition-all duration-200 hover:text-red-500 hover:scale-110"
            >
              <Trash2 size={18} />
            </Button>

            <div
              className="cursor-grab p-0.5 text-[var(--text-secondary)] opacity-60 hover:opacity-100 transition-opacity duration-200"
              title="Arrastar para reordenar"
            >
              <GripVertical size={18} />
            </div>
          </div>
        </div>

        {/* Conteúdo Expandido */}
        {isExpanded && (
          <div className="mt-2 ml-9 p-3 bg-[var(--bg-tertiary)] rounded border border-[var(--border-color)] animate-expand-smooth">
            {message.type === 'text' && (
              <p className="text-[var(--text-primary)] whitespace-pre-wrap text-xs">
                {message.content}
              </p>
            )}

            {message.type === 'audio' && (
              <div>
                <p className="text-[var(--text-secondary)] mb-1.5 text-xs">
                  {message.content}
                </p>
                {message.audioData && blobUrls.has(`${message.id}-audio`) && (
                  <CustomAudioPlayer
                    src={blobUrls.get(`${message.id}-audio`)!}
                    duration={message.duration}
                    key={blobUrls.get(`${message.id}-audio`)}
                  />
                )}
              </div>
            )}

            {message.type === 'image' && (
              <div>
                <p className="text-[var(--text-secondary)] mb-1.5 text-xs">
                  {message.content}
                </p>
                {message.imageData && blobUrls.has(`${message.id}-image`) && (
                  <img
                    src={blobUrls.get(`${message.id}-image`)}
                    alt={message.content}
                    className="max-w-full rounded-lg mt-1.5"
                    style={{ maxHeight: '400px', objectFit: 'contain' }}
                    key={blobUrls.get(`${message.id}-image`)}
                  />
                )}
                {message.caption && (
                  <p className="text-[var(--text-primary)] mt-1.5 text-xs italic">
                    Legenda: {message.caption}
                  </p>
                )}
              </div>
            )}

            {message.type === 'video' && (
              <div>
                <p className="text-[var(--text-secondary)] mb-1.5 text-xs">
                  {message.content}
                </p>
                {message.videoData && blobUrls.has(`${message.id}-video`) && (
                  <video
                    controls
                    src={blobUrls.get(`${message.id}-video`)}
                    className="max-w-full rounded-lg mt-1.5"
                    style={{ maxHeight: '400px', objectFit: 'contain' }}
                    key={blobUrls.get(`${message.id}-video`)}
                  />
                )}
                {message.caption && (
                  <p className="text-[var(--text-primary)] mt-1.5 text-xs italic">
                    Legenda: {message.caption}
                  </p>
                )}
              </div>
            )}

            {message.type === 'file' && (
              <div>
                <p className="text-[var(--text-secondary)] mb-1.5 text-xs">
                  {message.content}
                </p>
                <div className="p-3 border border-[var(--border-color)] rounded-lg bg-[var(--bg-secondary)] flex items-center gap-3 mt-1.5">
                  <div className="p-2 rounded bg-[var(--bg-tertiary)] text-[var(--text-primary)]">
                    <FileText size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {message.fileName || 'Arquivo sem nome'}
                    </p>
                    {message.fileData && (
                      <p className="text-xs text-[var(--text-secondary)]">
                        {(message.fileData.size / 1024).toFixed(1)} KB
                      </p>
                    )}
                  </div>
                  {message.fileData && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (message.fileData) {
                          const url = URL.createObjectURL(message.fileData);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = message.fileName || 'download';
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }
                      }}
                      title="Baixar arquivo"
                    >
                      <Download size={18} />
                    </Button>
                  )}
                </div>
                {message.caption && (
                  <p className="text-[var(--text-primary)] mt-1.5 text-xs italic">
                    Legenda: {message.caption}
                  </p>
                )}
              </div>
            )}

            {/* Informações adicionais */}
            <div className="mt-2 pt-2 border-t border-[var(--border-color)] flex gap-3 text-[10px] text-[var(--text-secondary)]">
              <span>Criado em: {formatDate(message.createdAt)}</span>
              {message.duration && <span>Duração: {Math.floor(message.duration)}s</span>}
              {(message.sendDelay ?? 0) > 0 && <span>Delay: {(message.sendDelay ?? 0) / 1000}s</span>}
            </div>
          </div>
        )}
      </Card>
    );
  };

  // Expor actions para o header global
  useEffect(() => {
    if (setHeaderActions) {
      setHeaderActions(
        <>
          <Button variant="ghost" size="sm" onClick={handleExport} title="Exportar">
            <Download size={16} />
            Exportar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => document.getElementById('import-file')?.click()} title="Importar">
            <Upload size={16} />
            Importar
          </Button>
          <input
            id="import-file"
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
          <Button variant="ghost" size="sm" onClick={() => setShowFolderManager(true)} title="Gerenciar Pastas">
            <FolderIcon size={16} />
            Gerenciar Pastas
          </Button>
          <Button variant="accent" onClick={handleCreateNew} size="sm">
            <Plus size={16} />
            Nova Mensagem
          </Button>
        </>
      );
    }

    return () => {
      if (setHeaderActions) {
        setHeaderActions(null);
      }
    };
  }, [handleExport, handleImport, handleCreateNew, showFolderManager, setHeaderActions]);

  return (
    <div className="tab-content">
      {/* Modal de criação/edição */}
      <NewMessageModal
        open={isCreating}
        onOpenChange={setIsCreating}
        editingMessage={editingMessage}
        formData={formData}
        setFormData={setFormData}
        folders={folders}
        onSave={handleSave}
        onCancel={handleCancel}
        onFoldersUpdate={loadData}
      />

      {/* NOVA INTERFACE - Lista de Mensagens */}
      <div className="messages-list-container" style={{ marginTop: '4rem' }}>
        {/* Filtros - Tabs por tipo */}
        <div style={{ marginBottom: '1rem', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
          <Tabs value={typeFilter} onValueChange={(value) => setTypeFilter(value as MessageType | 'all' | 'folders')}>
            <TabsList className="w-full grid grid-cols-7">
              <TabsTrigger value="all">
                <Grid size={18} className="mr-1" />
                Todos
              </TabsTrigger>
              <TabsTrigger value="folders">
                <FolderIcon size={18} className="mr-1" />
                Pastas
              </TabsTrigger>
              <TabsTrigger value="text">
                <MessageCircle size={18} className="mr-1" />
                Texto
              </TabsTrigger>
              <TabsTrigger value="audio">
                <Mic size={18} className="mr-1" />
                Áudio
              </TabsTrigger>
              <TabsTrigger value="image">
                <Camera size={18} className="mr-1" />
                Imagem
              </TabsTrigger>
              <TabsTrigger value="video">
                <Video size={18} className="mr-1" />
                Vídeo
              </TabsTrigger>
              <TabsTrigger value="file">
                <FileText size={18} className="mr-1" />
                Arquivo
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Pesquisa de Mensagens */}
        <div style={{ marginBottom: '1.5rem', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
          <div className="filter-bar-dark">
            <div className="filter-input-wrapper">
              <input
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
        </div>

        {/* Pastas */}
        <div className="flex flex-col gap-1.5" style={{ paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
          {folders.map((folder) => {
            const folderMessages = messagesByFolder.get(folder.id) || [];
            // Show empty folders only when filtering by "folders" or "all" (without search)
            if (folderMessages.length === 0 && typeFilter !== 'folders' && (typeFilter !== 'all' || searchQuery)) return null;

            // Auto-expand folders when filtering by type or searching
            const shouldAutoExpand = (typeFilter !== 'all' && typeFilter !== 'folders' && folderMessages.length > 0) || (searchQuery && folderMessages.length > 0);
            const isFolderExpanded = shouldAutoExpand || expandedFolders.has(folder.id);

            return (
              <div key={folder.id} className="mb-4">
                {/* Folder Header - Enhanced Design */}
                <div
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer rounded-lg transition-all"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  }}
                  onClick={() => toggleFolderExpansion(folder.id)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                  }}
                >
                  <FolderIcon size={22} color={folder.color} className="flex-shrink-0" />
                  <span className="text-sm font-semibold flex-1 tracking-wide">
                    {folder.name}
                  </span>
                  <span
                    className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-muted)'
                    }}
                  >
                    {folderMessages.length}
                  </span>
                  {isFolderExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>

                {/* Messages inside folder - Indented */}
                {isFolderExpanded && folderMessages.length > 0 && (
                  <div className="flex flex-col gap-1.5 mt-2 ml-4">
                    {folderMessages.map((message, index) => renderMessageCard(message, index, folder.color))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Mensagens sem pasta - Hide when filtering by folders only */}
          {messagesWithoutFolder.length > 0 && typeFilter !== 'folders' && (
            <div className="mb-3">
              <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2 px-2 flex items-center gap-2">
                <FolderIcon size={16} className="text-gray-400" />
                Mensagens sem pasta
              </h3>
              <div className="flex flex-col gap-1.5">
                {messagesWithoutFolder.map((message, index) => renderMessageCard(message, index))}
              </div>
            </div>
          )}
        </div>

        {/* Empty State */}
        <div className="flex flex-col gap-1.5" style={{ paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
          {folders.length === 0 && messagesWithoutFolder.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">
                <MessageCircle size={48} />
              </div>
              <h3>
                {messages.length === 0 ? 'Nenhuma mensagem criada' : 'Nenhuma mensagem encontrada'}
              </h3>
              <p>
                {messages.length === 0
                  ? 'Crie sua primeira mensagem para começar a automatizar o WhatsApp'
                  : 'Tente ajustar os filtros para encontrar mensagens'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Alert Dialog para confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Mensagem</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta mensagem? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary">Cancelar</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="danger" onClick={confirmDelete}>Excluir</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Folder Management Modal */}
      <FolderManagementModal
        open={showFolderManager}
        onOpenChange={setShowFolderManager}
        folders={folders}
        onFoldersUpdate={loadData}
      />
    </div>
  );
};

export default MessagesTab;
