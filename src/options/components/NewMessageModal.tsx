import React, { useState, useEffect } from 'react';
import { Message, MessageType, Folder } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
  Textarea,
  RadioGroup,
  RadioGroupItem,
  Switch,
} from '@/components/ui';
import { MessageCircle, Mic, Camera, Video, Upload, Check, X, Clock, Plus, Minus, FileText } from 'lucide-react';
import AudioRecorder from './AudioRecorder';
import FolderManager from './FolderManager';
import FileUploader from './FileUploader';

interface NewMessageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingMessage: Message | null;
  formData: {
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
  };
  setFormData: React.Dispatch<React.SetStateAction<{
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
  }>>;
  folders: Folder[];
  onSave: () => void;
  onCancel: () => void;
  onFoldersUpdate: () => void;
}

const NewMessageModal: React.FC<NewMessageModalProps> = ({
  open,
  onOpenChange,
  editingMessage,
  formData,
  setFormData,
  folders,
  onSave,
  onCancel,
  onFoldersUpdate,
}) => {
  // Local state for blob URLs
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Clean up blob URLs when data changes
  useEffect(() => {
    if (formData.audioData) {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      const newUrl = URL.createObjectURL(formData.audioData);
      setAudioUrl(newUrl);
    } else {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
    }

    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [formData.audioData]);

  useEffect(() => {
    if (formData.videoData) {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
      const newUrl = URL.createObjectURL(formData.videoData);
      setVideoUrl(newUrl);
    } else {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
        setVideoUrl(null);
      }
    }

    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [formData.videoData]);

  useEffect(() => {
    if (formData.imageData) {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
      const newUrl = URL.createObjectURL(formData.imageData);
      setImageUrl(newUrl);
    } else {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
        setImageUrl(null);
      }
    }

    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [formData.imageData]);

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

  const handleFileSelected = (blob: Blob, fileName: string) => {
    setFormData({ ...formData, fileData: blob, fileName });
  };

  const handleDelayChange = (value: string) => {
    const seconds = parseFloat(value);
    if (isNaN(seconds) || value === '') {
      setFormData({ ...formData, sendDelay: 0, showTyping: false, showRecording: false });
    } else {
      const newDelay = Math.max(0, seconds * 1000);
      if (newDelay === 0) {
        setFormData({ ...formData, sendDelay: 0, showTyping: false, showRecording: false });
      } else {
        setFormData({ ...formData, sendDelay: newDelay });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {editingMessage ? 'Editar Mensagem' : 'Nova Mensagem'}
          </DialogTitle>
          <DialogDescription>
            {editingMessage
              ? 'Atualize as informações da mensagem existente.'
              : 'Configure uma nova mensagem para enviar aos seus contatos.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Nome da Mensagem */}
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Mensagem *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Boas-vindas, Agradecimento, Promoção..."
              required
            />
            <p className="text-xs text-muted-foreground">
              Nome de exibição que aparecerá na lista de mensagens.
            </p>
          </div>

          {/* Tipo de Mensagem */}
          <div className="space-y-3">
            <Label>Tipo de Mensagem</Label>
            <RadioGroup
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value as MessageType })}
              className="grid grid-cols-2 gap-4"
            >
              <Label
                htmlFor="type-text"
                className={`flex items-center space-x-3 border rounded-lg p-3 cursor-pointer transition-all hover:border-[var(--accent-pink)] ${
                  formData.type === 'text' ? 'border-[var(--accent-pink)]' : 'border-[var(--border-color)]'
                }`}
              >
                <RadioGroupItem value="text" id="type-text" />
                <div className="flex items-center gap-2 flex-1">
                  <MessageCircle size={18} />
                  <span>Texto</span>
                </div>
              </Label>
              <Label
                htmlFor="type-audio"
                className={`flex items-center space-x-3 border rounded-lg p-3 cursor-pointer transition-all hover:border-[var(--accent-pink)] ${
                  formData.type === 'audio' ? 'border-[var(--accent-pink)]' : 'border-[var(--border-color)]'
                }`}
              >
                <RadioGroupItem value="audio" id="type-audio" />
                <div className="flex items-center gap-2 flex-1">
                  <Mic size={18} />
                  <span>Áudio</span>
                </div>
              </Label>
              <Label
                htmlFor="type-image"
                className={`flex items-center space-x-3 border rounded-lg p-3 cursor-pointer transition-all hover:border-[var(--accent-pink)] ${
                  formData.type === 'image' ? 'border-[var(--accent-pink)]' : 'border-[var(--border-color)]'
                }`}
              >
                <RadioGroupItem value="image" id="type-image" />
                <div className="flex items-center gap-2 flex-1">
                  <Camera size={18} />
                  <span>Imagem</span>
                </div>
              </Label>
              <Label
                htmlFor="type-video"
                className={`flex items-center space-x-3 border rounded-lg p-3 cursor-pointer transition-all hover:border-[var(--accent-pink)] ${
                  formData.type === 'video' ? 'border-[var(--accent-pink)]' : 'border-[var(--border-color)]'
                }`}
              >
                <RadioGroupItem value="video" id="type-video" />
                <div className="flex items-center gap-2 flex-1">
                  <Video size={18} />
                  <span>Vídeo</span>
                </div>
              </Label>
              <Label
                htmlFor="type-file"
                className={`flex items-center space-x-3 border rounded-lg p-3 cursor-pointer transition-all hover:border-[var(--accent-pink)] ${
                  formData.type === 'file' ? 'border-[var(--accent-pink)]' : 'border-[var(--border-color)]'
                }`}
              >
                <RadioGroupItem value="file" id="type-file" />
                <div className="flex items-center gap-2 flex-1">
                  <FileText size={18} />
                  <span>Arquivo</span>
                </div>
              </Label>
            </RadioGroup>
          </div>

          {/* Conteúdo da Mensagem */}
          <div className="space-y-2">
            <Label htmlFor="content">
              {formData.type === 'text' ? 'Conteúdo da Mensagem' :
               formData.type === 'audio' ? 'Descrição do Áudio' :
               formData.type === 'image' ? 'Descrição da Imagem' :
               formData.type === 'video' ? 'Descrição do Vídeo' :
               'Descrição do Arquivo'}
            </Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder={
                formData.type === 'text'
                  ? 'Digite a mensagem...'
                  : formData.type === 'audio'
                  ? 'Ex: Mensagem de boas-vindas'
                  : formData.type === 'image'
                  ? 'Ex: Foto do produto'
                  : formData.type === 'video'
                  ? 'Ex: Vídeo tutorial'
                  : 'Ex: Contrato, Proposta, Manual...'
              }
              rows={formData.type === 'text' ? 6 : 2}
              className="resize-none"
            />
          </div>

          {/* Áudio */}
          {formData.type === 'audio' && (
            <div className="space-y-3">
              <Label>Áudio</Label>
              <AudioRecorder onAudioRecorded={handleAudioRecorded} />
              <div className="space-y-3">
                <label htmlFor="audio-upload" className="btn-record cursor-pointer inline-flex items-center justify-center gap-2">
                  <Upload size={18} />
                  Fazer Upload de Áudio
                </label>
                <input
                  id="audio-upload"
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioUpload}
                  className="hidden"
                />
                {formData.audioData && audioUrl && (
                  <div className="p-3 border border-[var(--border-color)] rounded-lg bg-[var(--bg-tertiary)] space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-green-500">
                      <Check size={16} />
                      <span>Áudio carregado</span>
                    </div>
                    <audio controls src={audioUrl} className="w-full" key={audioUrl} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Imagem */}
          {formData.type === 'image' && (
            <div className="space-y-3">
              <Label>Imagem</Label>
              <div className="space-y-3">
                <label htmlFor="image-upload" className="btn-record cursor-pointer inline-flex items-center justify-center gap-2">
                  <Camera size={18} />
                  Selecionar Imagem
                </label>
                <input
                  id="image-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        alert('Arquivo muito grande. Tamanho máximo: 5MB');
                        return;
                      }
                      if (!file.type.startsWith('image/')) {
                        alert('Formato inválido. Use JPEG, PNG, GIF ou WebP.');
                        return;
                      }
                      handleImageSelected(file);
                    }
                  }}
                  className="hidden"
                />
                {formData.imageData && imageUrl && (
                  <div className="p-3 border border-[var(--border-color)] rounded-lg bg-[var(--bg-tertiary)] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium text-green-500">
                        <Check size={16} />
                        <span>Imagem selecionada</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, imageData: null })}
                        className="text-red-500 hover:text-red-600 transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <img
                      src={imageUrl}
                      alt="Preview"
                      className="max-w-full max-h-[300px] rounded-lg"
                      key={imageUrl}
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Formatos: JPEG, PNG, GIF, WebP | Máx: 5MB
              </p>
            </div>
          )}

          {/* Vídeo */}
          {formData.type === 'video' && (
            <div className="space-y-3">
              <Label>Vídeo</Label>
              <div className="space-y-3">
                <label htmlFor="video-upload" className="btn-record cursor-pointer inline-flex items-center justify-center gap-2">
                  <Video size={18} />
                  Selecionar Vídeo
                </label>
                <input
                  id="video-upload"
                  type="file"
                  accept="video/mp4,video/webm,video/ogg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 16 * 1024 * 1024) {
                        alert('Arquivo muito grande. Tamanho máximo: 16MB');
                        return;
                      }
                      if (!file.type.startsWith('video/')) {
                        alert('Formato inválido. Use MP4, WebM ou OGG.');
                        return;
                      }
                      handleVideoSelected(file);
                    }
                  }}
                  className="hidden"
                />
                {formData.videoData && videoUrl && (
                  <div className="p-3 border border-[var(--border-color)] rounded-lg bg-[var(--bg-tertiary)] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium text-green-500">
                        <Check size={16} />
                        <span>Vídeo selecionado</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, videoData: null })}
                        className="text-red-500 hover:text-red-600 transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <video
                      controls
                      src={videoUrl}
                      className="max-w-full max-h-[300px] rounded-lg"
                      key={videoUrl}
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Formatos: MP4, WebM, OGG | Máx: 16MB
              </p>
            </div>
          )}

          {/* Arquivo */}
          {formData.type === 'file' && (
            <div className="space-y-3">
              <Label>Arquivo</Label>
              <FileUploader
                onFileSelected={handleFileSelected}
                currentFile={formData.fileData}
                currentFileName={formData.fileName}
              />
            </div>
          )}

          {/* Legenda para Imagem/Vídeo/Arquivo */}
          {(formData.type === 'image' || formData.type === 'video' || formData.type === 'file') && (
            <div className="space-y-2">
              <Label htmlFor="caption">Legenda (opcional)</Label>
              <Textarea
                id="caption"
                value={formData.caption}
                onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                placeholder="Legenda que será enviada junto com a mídia..."
                rows={2}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Esta legenda será enviada junto com {formData.type === 'image' ? 'a imagem' : formData.type === 'video' ? 'o vídeo' : 'o arquivo'}. A descrição acima é apenas para referência interna.
              </p>
            </div>
          )}

          {/* Pasta */}
          <div className="space-y-2">
            <Label>Pasta</Label>
            <FolderManager
              availableFolders={folders}
              selectedFolderId={formData.folderId}
              onFolderChange={(folderId) => setFormData({ ...formData, folderId })}
              onFoldersUpdate={onFoldersUpdate}
            />
          </div>

          {/* Delay antes de enviar */}
          <div className="space-y-3 p-4 border border-[var(--border-color)] rounded-lg bg-[var(--bg-secondary)]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--bg-tertiary)]">
                <Clock size={20} className="text-[var(--accent-pink)]" />
              </div>
              <div className="flex-1">
                <Label htmlFor="sendDelay" className="text-sm font-medium">
                  Delay antes de enviar
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tempo de espera em segundos antes de enviar a mensagem
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const currentValue = formData.sendDelay / 1000;
                    const newValue = Math.max(0, currentValue - 0.5);
                    handleDelayChange(newValue.toString());
                  }}
                  className="p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-white hover:bg-[var(--bg-hover)] hover:border-[var(--accent-pink)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={formData.sendDelay === 0}
                >
                  <Minus size={16} />
                </button>
                <Input
                  id="sendDelay"
                  type="number"
                  value={formData.sendDelay === 0 ? '' : formData.sendDelay / 1000}
                  onChange={(e) => handleDelayChange(e.target.value)}
                  min="0"
                  step="0.5"
                  placeholder="0"
                  className="max-w-[100px] bg-[var(--bg-tertiary)] text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const currentValue = formData.sendDelay / 1000;
                    const newValue = currentValue + 0.5;
                    handleDelayChange(newValue.toString());
                  }}
                  className="p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-white hover:bg-[var(--bg-hover)] hover:border-[var(--accent-pink)] transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
              <span className="text-sm text-muted-foreground">segundos</span>
            </div>
          </div>

          {/* Mostrar "digitando..." para mensagens de texto */}
          {formData.type === 'text' && (
            <div className="flex items-center justify-between p-4 border border-[var(--border-color)] rounded-lg bg-[var(--bg-secondary)]">
              <div className="flex-1">
                <Label htmlFor="showTyping" className="text-sm font-medium cursor-pointer">
                  Mostrar "digitando..." antes de enviar
                </Label>
                <p className={`text-xs mt-0.5 ${formData.sendDelay === 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                  {formData.sendDelay === 0
                    ? 'Configure um delay maior que 0 para habilitar'
                    : 'Simula que você está digitando'}
                </p>
              </div>
              <Switch
                id="showTyping"
                checked={formData.showTyping}
                disabled={formData.sendDelay === 0}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, showTyping: checked })
                }
              />
            </div>
          )}

          {/* Mostrar "gravando áudio..." para mensagens de áudio */}
          {formData.type === 'audio' && (
            <div className="flex items-center justify-between p-4 border border-[var(--border-color)] rounded-lg bg-[var(--bg-secondary)]">
              <div className="flex-1">
                <Label htmlFor="showRecording" className="text-sm font-medium cursor-pointer">
                  Mostrar "gravando áudio..." antes de enviar
                </Label>
                <p className={`text-xs mt-0.5 ${formData.sendDelay === 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                  {formData.sendDelay === 0
                    ? 'Configure um delay maior que 0 para habilitar'
                    : 'Simula que você está gravando áudio'}
                </p>
              </div>
              <Switch
                id="showRecording"
                checked={formData.showRecording}
                disabled={formData.sendDelay === 0}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, showRecording: checked })
                }
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={onSave}>
            {editingMessage ? 'Atualizar' : 'Criar'} Mensagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewMessageModal;
