import React, { useState, useEffect } from 'react';
import { Message, Tag, MessageType } from '@/types';
import { db } from '@/storage/db';
import { generateId, getAudioDuration, downloadFile } from '@/utils/helpers';
import AudioRecorder from '../components/AudioRecorder';
import ImageVideoUploader from '../components/ImageVideoUploader';
import TagManager from '../components/TagManager';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { MessageSquare, Mic, Image as ImageIcon, Video, Plus, Download, Upload, Trash2, Edit, GripVertical, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const MessagesTab: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
    setMessages(messagesData.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)));
    setTags(tagsData);
  };

  const handleCreateNew = () => {
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
    setIsDialogOpen(true);
  };

  const handleEdit = (message: Message) => {
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
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingMessage(null);
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
      handleCloseDialog();
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

    const newMessages = [...messages];
    const [removed] = newMessages.splice(draggedIndex, 1);
    newMessages.splice(targetIndex, 0, removed);

    const updatedMessages = newMessages.map((msg, index) => ({
      ...msg,
      order: index,
    }));

    setMessages(updatedMessages);
    setDraggedId(null);

    for (const msg of updatedMessages) {
      await db.saveMessage(msg);
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  const getIconForType = (type: MessageType) => {
    switch (type) {
      case 'text': return <MessageSquare className="h-4 w-4" />;
      case 'audio': return <Mic className="h-4 w-4" />;
      case 'image': return <ImageIcon className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Mensagens</h2>
          <p className="text-muted-foreground mt-1">
            Gerencie suas mensagens prontas para envio rápido.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Exportar
          </Button>
          <div className="relative">
            <Button variant="outline" size="sm" className="cursor-pointer">
              <Upload className="mr-2 h-4 w-4" /> Importar
            </Button>
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>
          <Button onClick={handleCreateNew}>
            <Plus className="mr-2 h-4 w-4" /> Nova Mensagem
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {messages.map((message) => (
          <Card
            key={message.id}
            className={cn(
              "group relative transition-all hover:shadow-md",
              draggedId === message.id && "opacity-50 border-dashed"
            )}
            draggable
            onDragStart={(e) => handleDragStart(e, message.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, message.id)}
            onDragEnd={handleDragEnd}
          >
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1 text-muted-foreground">
              <GripVertical className="h-4 w-4" />
            </div>

            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="flex gap-1 items-center">
                  {getIconForType(message.type)}
                  <span className="capitalize">{message.type === 'text' ? 'Texto' : message.type === 'audio' ? 'Áudio' : message.type === 'image' ? 'Imagem' : 'Vídeo'}</span>
                </Badge>
                {message.duration && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {Math.floor(message.duration)}s
                  </span>
                )}
              </div>
            </CardHeader>

            <CardContent className="pb-2">
              <p className="text-sm line-clamp-3 text-muted-foreground min-h-[3rem]">
                {message.content}
              </p>

              {message.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {message.tags.map((tagId) => {
                    const tag = tags.find((t) => t.id === tagId);
                    return tag ? (
                      <Badge
                        key={tagId}
                        variant="secondary"
                        className="text-[10px] px-1 py-0 h-5"
                        style={{ backgroundColor: `${tag.color}20`, color: tag.color, borderColor: `${tag.color}40` }}
                      >
                        {tag.name}
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </CardContent>

            <CardFooter className="pt-2 flex justify-end gap-2 border-t bg-muted/20">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(message)}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(message.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        ))}

        {messages.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg text-muted-foreground bg-muted/10">
            <MessageSquare className="h-12 w-12 mb-4 opacity-20" />
            <h3 className="text-lg font-medium">Nenhuma mensagem criada</h3>
            <p className="text-sm mb-4">Crie sua primeira mensagem para começar.</p>
            <Button onClick={handleCreateNew}>
              <Plus className="mr-2 h-4 w-4" /> Criar Mensagem
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto bg-background border border-border shadow-lg sm:rounded-xl"
          style={{ backgroundColor: '#09090b', borderColor: '#27272a' }}
        >
          <DialogHeader>
            <DialogTitle>{editingMessage ? 'Editar Mensagem' : 'Nova Mensagem'}</DialogTitle>
            <DialogDescription>
              Preencha os detalhes da mensagem abaixo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>Tipo de Mensagem</Label>
              <Tabs
                defaultValue={formData.type}
                value={formData.type}
                onValueChange={(v) => setFormData({ ...formData, type: v as MessageType })}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="text">Texto</TabsTrigger>
                  <TabsTrigger value="audio">Áudio</TabsTrigger>
                  <TabsTrigger value="image">Imagem</TabsTrigger>
                  <TabsTrigger value="video">Vídeo</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-2">
              <Label>
                {formData.type === 'text' ? 'Conteúdo da Mensagem' :
                  formData.type === 'audio' ? 'Descrição do Áudio' :
                    formData.type === 'image' ? 'Descrição da Imagem' :
                      'Descrição do Vídeo'}
              </Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder={
                  formData.type === 'text' ? 'Digite a mensagem...' :
                    formData.type === 'audio' ? 'Ex: Mensagem de boas-vindas' :
                      formData.type === 'image' ? 'Ex: Foto do produto' :
                        'Ex: Vídeo tutorial'
                }
                rows={formData.type === 'text' ? 5 : 2}
              />
            </div>

            {formData.type === 'audio' && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                <div className="space-y-2">
                  <Label>Gravar Áudio</Label>
                  <AudioRecorder onAudioRecorded={handleAudioRecorded} />
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Ou faça upload</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Upload de Arquivo</Label>
                  <Input
                    type="file"
                    accept="audio/*"
                    onChange={handleAudioUpload}
                  />
                </div>

                {formData.audioData && (
                  <div className="flex items-center gap-2 p-2 bg-green-500/10 text-green-600 rounded border border-green-500/20">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">Áudio carregado com sucesso</span>
                    <audio controls src={URL.createObjectURL(formData.audioData)} className="h-8 ml-auto" />
                  </div>
                )}
              </div>
            )}

            {(formData.type === 'image' || formData.type === 'video') && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                <Label>{formData.type === 'image' ? 'Imagem' : 'Vídeo'}</Label>
                <ImageVideoUploader
                  type={formData.type as 'image' | 'video'}
                  onFileSelected={formData.type === 'image' ? handleImageSelected : handleVideoSelected}
                />

                <div className="space-y-2 pt-2">
                  <Label>Legenda (Opcional)</Label>
                  <Textarea
                    value={formData.caption}
                    onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                    placeholder="Legenda que será enviada junto com a mídia..."
                    rows={2}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Tags</Label>
              <TagManager
                availableTags={tags}
                selectedTags={formData.tags}
                onTagsChange={(newTags) => setFormData({ ...formData, tags: newTags })}
                onTagsUpdate={loadData}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Delay antes de enviar (segundos)</Label>
                <Input
                  type="number"
                  value={formData.sendDelay / 1000}
                  onChange={(e) => {
                    const seconds = parseFloat(e.target.value) || 0;
                    const newDelay = Math.max(0, seconds * 1000);
                    if (newDelay === 0) {
                      setFormData({ ...formData, sendDelay: newDelay, showTyping: false, showRecording: false });
                    } else {
                      setFormData({ ...formData, sendDelay: newDelay });
                    }
                  }}
                  min="0"
                  step="0.5"
                />
              </div>

              {formData.type === 'text' && (
                <div className="flex items-center space-x-2 pt-8">
                  <Switch
                    id="show-typing"
                    checked={formData.showTyping}
                    onCheckedChange={(checked) => setFormData({ ...formData, showTyping: checked })}
                    disabled={formData.sendDelay === 0}
                  />
                  <Label htmlFor="show-typing" className={formData.sendDelay === 0 ? "text-muted-foreground" : ""}>
                    Mostrar "digitando..."
                  </Label>
                </div>
              )}

              {formData.type === 'audio' && (
                <div className="flex items-center space-x-2 pt-8">
                  <Switch
                    id="show-recording"
                    checked={formData.showRecording}
                    onCheckedChange={(checked) => setFormData({ ...formData, showRecording: checked })}
                    disabled={formData.sendDelay === 0}
                  />
                  <Label htmlFor="show-recording" className={formData.sendDelay === 0 ? "text-muted-foreground" : ""}>
                    Mostrar "gravando..."
                  </Label>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>Cancelar</Button>
            <Button onClick={handleSave}>{editingMessage ? 'Atualizar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Helper component for success icon
const CheckCircle = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

export default MessagesTab;
