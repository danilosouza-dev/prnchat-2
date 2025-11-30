import React, { useState, useEffect } from 'react';
import { Message, Tag, MessageType } from '@/types';
import { db } from '@/storage/db';
import { generateId, formatDate, getAudioDuration, downloadFile } from '@/utils/helpers';
import AudioRecorder from '../components/AudioRecorder';
import ImageVideoUploader from '../components/ImageVideoUploader';
import TagManager from '../components/TagManager';

const TagIcon = ({ color, size = 14 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
    <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>
  </svg>
);

const MessagesTab: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    type: 'text' as MessageType,
    content: '',
    caption: '',
    audioData: null as Blob | null,
    imageData: null as Blob | null,
    videoData: null as Blob | null,
    tags: [] as string[],
    showTyping: false,
    showRecording: false,
    sendDelay: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [messagesData, tagsData] = await Promise.all([
      db.getAllMessages(),
      db.getAllTags(),
    ]);
    // Sort by order (fallback to createdAt for older messages)
    setMessages(messagesData.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)));
    setTags(tagsData);
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setEditingMessage(null);
    setFormData({
      type: 'text',
      content: '',
      caption: '',
      audioData: null,
      imageData: null,
      videoData: null,
      tags: [],
      showTyping: false,
      showRecording: false,
      sendDelay: 0,
    });
  };

  const handleEdit = (message: Message) => {
    setIsCreating(true);
    setEditingMessage(message);
    setFormData({
      type: message.type,
      content: message.content,
      caption: message.caption || '',
      audioData: message.audioData || null,
      imageData: message.imageData || null,
      videoData: message.videoData || null,
      tags: message.tags,
      showTyping: message.showTyping || false,
      showRecording: message.showRecording || false,
      sendDelay: message.sendDelay ?? 0,
    });
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingMessage(null);
    setFormData({
      type: 'text',
      content: '',
      caption: '',
      audioData: null,
      imageData: null,
      videoData: null,
      tags: [],
      showTyping: false,
      showRecording: false,
      sendDelay: 0,
    });
  };

  const handleSave = async () => {
    if (!formData.content.trim()) {
      alert('Por favor, preencha o conteúdo da mensagem');
      return;
    }

    if (formData.type === 'audio' && !formData.audioData) {
      alert('Por favor, grave ou faça upload de um áudio');
      return;
    }

    if (formData.type === 'image' && !formData.imageData) {
      alert('Por favor, selecione uma imagem');
      return;
    }

    if (formData.type === 'video' && !formData.videoData) {
      alert('Por favor, selecione um vídeo');
      return;
    }

    try {
      let duration: number | undefined;
      if (formData.type === 'audio' && formData.audioData) {
        duration = await getAudioDuration(formData.audioData);
      }

      const message: Message = {
        id: editingMessage?.id || generateId(),
        type: formData.type,
        content: formData.content,
        caption: (formData.type === 'image' || formData.type === 'video') ? formData.caption : undefined,
        audioData: formData.audioData,
        imageData: formData.imageData,
        videoData: formData.videoData,
        tags: formData.tags,
        duration,
        showTyping: formData.type === 'text' ? formData.showTyping : undefined,
        showRecording: formData.type === 'audio' ? formData.showRecording : undefined,
        sendDelay: formData.sendDelay,
        createdAt: editingMessage?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      await db.saveMessage(message);
      await loadData();
      handleCancel();
    } catch (error) {
      console.error('Error saving message:', error);
      alert('Erro ao salvar mensagem');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta mensagem?')) {
      try {
        await db.deleteMessage(id);
        await loadData();
      } catch (error) {
        console.error('Error deleting message:', error);
        alert('Erro ao excluir mensagem');
      }
    }
  };

  const handleAudioRecorded = (blob: Blob) => {
    setFormData({ ...formData, audioData: blob });
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('audio/')) {
        alert('Por favor, selecione um arquivo de áudio');
        return;
      }
      setFormData({ ...formData, audioData: file });
    }
  };

  const handleImageSelected = (blob: Blob) => {
    setFormData({ ...formData, imageData: blob });
  };

  const handleVideoSelected = (blob: Blob) => {
    setFormData({ ...formData, videoData: blob });
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

    // Reorder messages
    const newMessages = [...messages];
    const [removed] = newMessages.splice(draggedIndex, 1);
    newMessages.splice(targetIndex, 0, removed);

    // Update order field for all messages
    const updatedMessages = newMessages.map((msg, index) => ({
      ...msg,
      order: index,
    }));

    setMessages(updatedMessages);
    setDraggedId(null);

    // Save new order to database
    for (const msg of updatedMessages) {
      await db.saveMessage(msg);
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  return (
    <div className="tab-content">
      <div className="tab-header">
        <div>
          <h2>Mensagens</h2>
          <p className="tab-description">
            Crie e gerencie mensagens de texto, áudio, imagem e vídeo para enviar no WhatsApp Web
          </p>
        </div>
        <div className="tab-actions">
          <button className="btn-secondary" onClick={handleExport}>
            📥 Exportar
          </button>
          <label className="btn-secondary">
            📤 Importar
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </label>
          {!isCreating && (
            <button className="btn-primary" onClick={handleCreateNew}>
              ➕ Nova Mensagem
            </button>
          )}
        </div>
      </div>

      {isCreating && (
        <div className="form-card">
          <h3>{editingMessage ? 'Editar Mensagem' : 'Nova Mensagem'}</h3>

          <div className="form-group">
            <label>Tipo de Mensagem</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  value="text"
                  checked={formData.type === 'text'}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as MessageType })}
                />
                💬 Texto
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  value="audio"
                  checked={formData.type === 'audio'}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as MessageType })}
                />
                🎤 Áudio
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  value="image"
                  checked={formData.type === 'image'}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as MessageType })}
                />
                🖼️ Imagem
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  value="video"
                  checked={formData.type === 'video'}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as MessageType })}
                />
                🎥 Vídeo
              </label>
            </div>
          </div>

          <div className="form-group">
            <label>
              {formData.type === 'text' ? 'Conteúdo da Mensagem' :
               formData.type === 'audio' ? 'Descrição do Áudio' :
               formData.type === 'image' ? 'Descrição da Imagem' :
               'Descrição do Vídeo'}
            </label>
            <textarea
              className="form-textarea"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder={
                formData.type === 'text'
                  ? 'Digite a mensagem...'
                  : formData.type === 'audio'
                  ? 'Ex: Mensagem de boas-vindas'
                  : formData.type === 'image'
                  ? 'Ex: Foto do produto'
                  : 'Ex: Vídeo tutorial'
              }
              rows={formData.type === 'text' ? 6 : 2}
            />
          </div>

          {formData.type === 'audio' && (
            <div className="form-group">
              <label>Áudio</label>
              <AudioRecorder onAudioRecorded={handleAudioRecorded} />
              <div className="audio-upload">
                <label className="btn-secondary full-width">
                  📁 Fazer Upload de Áudio
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleAudioUpload}
                    style={{ display: 'none' }}
                  />
                </label>
                {formData.audioData && (
                  <div className="audio-preview-box">
                    <span>✅ Áudio carregado</span>
                    <audio controls src={URL.createObjectURL(formData.audioData)} />
                  </div>
                )}
              </div>
            </div>
          )}

          {formData.type === 'image' && (
            <div className="form-group">
              <label>Imagem</label>
              <ImageVideoUploader type="image" onFileSelected={handleImageSelected} />
            </div>
          )}

          {formData.type === 'video' && (
            <div className="form-group">
              <label>Vídeo</label>
              <ImageVideoUploader type="video" onFileSelected={handleVideoSelected} />
            </div>
          )}

          {(formData.type === 'image' || formData.type === 'video') && (
            <div className="form-group">
              <label>Legenda (opcional)</label>
              <textarea
                className="form-textarea"
                value={formData.caption}
                onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                placeholder="Legenda que será enviada junto com a mídia..."
                rows={2}
              />
              <small style={{ color: '#888', marginTop: '4px', display: 'block' }}>
                Esta legenda será enviada junto com a {formData.type === 'image' ? 'imagem' : 'vídeo'}. A descrição acima é apenas para referência interna.
              </small>
            </div>
          )}

          <div className="form-group">
            <label>Tags</label>
            <TagManager
              availableTags={tags}
              selectedTags={formData.tags}
              onTagsChange={(newTags) => setFormData({ ...formData, tags: newTags })}
              onTagsUpdate={loadData}
            />
          </div>

          {formData.type === 'text' && (
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.showTyping}
                  disabled={formData.sendDelay === 0}
                  onChange={(e) => setFormData({ ...formData, showTyping: e.target.checked })}
                />
                ⌨️ Mostrar "digitando..." antes de enviar
              </label>
              <small style={{ color: formData.sendDelay === 0 ? '#ff9800' : '#888', marginTop: '4px', display: 'block' }}>
                {formData.sendDelay === 0
                  ? '⚠️ Configure um delay maior que 0 para habilitar esta opção'
                  : 'Simula que você está digitando antes de enviar a mensagem'}
              </small>
            </div>
          )}

          {formData.type === 'audio' && (
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.showRecording}
                  disabled={formData.sendDelay === 0}
                  onChange={(e) => setFormData({ ...formData, showRecording: e.target.checked })}
                />
                🎤 Mostrar "gravando áudio..." antes de enviar
              </label>
              <small style={{ color: formData.sendDelay === 0 ? '#ff9800' : '#888', marginTop: '4px', display: 'block' }}>
                {formData.sendDelay === 0
                  ? '⚠️ Configure um delay maior que 0 para habilitar esta opção'
                  : 'Simula que você está gravando áudio antes de enviar a mensagem'}
              </small>
            </div>
          )}

          <div className="form-group">
            <label>⏱️ Delay antes de enviar (segundos)</label>
            <input
              type="number"
              className="form-input"
              value={formData.sendDelay / 1000}
              onChange={(e) => {
                const seconds = parseFloat(e.target.value) || 0;
                const newDelay = Math.max(0, seconds * 1000);
                // If delay is set to 0, also disable showTyping and showRecording
                if (newDelay === 0) {
                  setFormData({ ...formData, sendDelay: newDelay, showTyping: false, showRecording: false });
                } else {
                  setFormData({ ...formData, sendDelay: newDelay });
                }
              }}
              min="0"
              step="0.5"
              placeholder="0"
            />
            <small style={{ color: '#888', marginTop: '4px', display: 'block' }}>
              Tempo de espera antes de enviar a mensagem após o disparo
              {(formData.type === 'image' || formData.type === 'video') && ' (padrão: 0 segundos para imagens/vídeos)'}
            </small>
          </div>

          <div className="form-actions">
            <button className="btn-secondary" onClick={handleCancel}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={handleSave}>
              {editingMessage ? 'Atualizar' : 'Criar'} Mensagem
            </button>
          </div>
        </div>
      )}

      <div className="messages-grid">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message-item ${draggedId === message.id ? 'dragging' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, message.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, message.id)}
            onDragEnd={handleDragEnd}
          >
            <div className="message-item-header">
              <span className="drag-handle" title="Arrastar para reordenar">⋮⋮</span>
              <span className={`type-badge ${message.type}`}>
                {message.type === 'text' ? '💬' :
                 message.type === 'audio' ? '🎤' :
                 message.type === 'image' ? '🖼️' : '🎥'}
              </span>
              <div className="message-item-actions">
                <button
                  className="icon-btn"
                  onClick={() => handleEdit(message)}
                  title="Editar"
                >
                  ✏️
                </button>
                <button
                  className="icon-btn delete"
                  onClick={() => handleDelete(message.id)}
                  title="Excluir"
                >
                  🗑️
                </button>
              </div>
            </div>

            <div className="message-item-content">
              <p className="message-text">{message.content}</p>
              {message.type === 'audio' && message.audioData && (
                <audio controls src={URL.createObjectURL(message.audioData)} />
              )}
              {message.type === 'image' && message.imageData && (
                <img
                  src={URL.createObjectURL(message.imageData)}
                  alt={message.content}
                  style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '8px' }}
                />
              )}
              {message.type === 'video' && message.videoData && (
                <video
                  controls
                  src={URL.createObjectURL(message.videoData)}
                  style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '8px' }}
                />
              )}
            </div>

            {message.tags.length > 0 && (
              <div className="message-item-tags">
                {message.tags.map((tagId) => {
                  const tag = tags.find((t) => t.id === tagId);
                  return tag ? (
                    <span
                      key={tagId}
                      className="tag"
                    >
                      <TagIcon color={tag.color} size={14} />
                      {tag.name}
                    </span>
                  ) : null;
                })}
              </div>
            )}

            <div className="message-item-footer">
              <span className="date">{formatDate(message.createdAt)}</span>
              {message.duration && (
                <span className="duration">{Math.floor(message.duration)}s</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {messages.length === 0 && !isCreating && (
        <div className="empty-state-large">
          <div className="empty-icon">💬</div>
          <h3>Nenhuma mensagem criada</h3>
          <p>Crie sua primeira mensagem para começar a automatizar o WhatsApp</p>
          <button className="btn-primary" onClick={handleCreateNew}>
            ➕ Criar Primeira Mensagem
          </button>
        </div>
      )}
    </div>
  );
};

export default MessagesTab;
