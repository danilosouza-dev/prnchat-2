import React, { useState, useEffect } from 'react';
import { Script, ScriptStep, Message } from '@/types';
import { db } from '@/storage/db';
import { generateId, formatDuration } from '@/utils/helpers';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Edit, ArrowUp, ArrowDown, Clock, FileText, MessageSquare, Mic } from 'lucide-react';

const ScriptsTab: React.FC = () => {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    steps: [] as ScriptStep[],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [scriptsData, messagesData] = await Promise.all([
      db.getAllScripts(),
      db.getAllMessages(),
    ]);
    setScripts(scriptsData.sort((a, b) => b.createdAt - a.createdAt));
    setMessages(messagesData);
  };

  const handleCreateNew = () => {
    setEditingScript(null);
    setFormData({
      name: '',
      description: '',
      steps: [],
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (script: Script) => {
    setEditingScript(script);
    setFormData({
      name: script.name,
      description: script.description || '',
      steps: script.steps,
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingScript(null);
  };

  const handleAddStep = () => {
    if (messages.length === 0) {
      alert('Crie pelo menos uma mensagem primeiro!');
      return;
    }
    setFormData({
      ...formData,
      steps: [
        ...formData.steps,
        { messageId: messages[0].id, delayAfter: 2000 },
      ],
    });
  };

  const handleUpdateStep = (index: number, field: keyof ScriptStep, value: any) => {
    const newSteps = [...formData.steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setFormData({ ...formData, steps: newSteps });
  };

  const handleRemoveStep = (index: number) => {
    setFormData({
      ...formData,
      steps: formData.steps.filter((_, i) => i !== index),
    });
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === formData.steps.length - 1)
    ) {
      return;
    }

    const newSteps = [...formData.steps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
    setFormData({ ...formData, steps: newSteps });
  };

  const calculateTotalDuration = (): number => {
    return formData.steps.reduce((total, step) => {
      const message = messages.find((m) => m.id === step.messageId);
      const messageDuration = message?.duration ? message.duration * 1000 : 0;
      return total + messageDuration + step.delayAfter;
    }, 0);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Por favor, preencha o nome do script');
      return;
    }

    if (formData.steps.length === 0) {
      alert('Adicione pelo menos uma mensagem ao script');
      return;
    }

    try {
      const script: Script = {
        id: editingScript?.id || generateId(),
        name: formData.name,
        description: formData.description,
        steps: formData.steps,
        totalDuration: calculateTotalDuration(),
        createdAt: editingScript?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      await db.saveScript(script);
      await loadData();
      handleCloseDialog();
    } catch (error) {
      console.error('Error saving script:', error);
      alert('Erro ao salvar script');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este script?')) {
      try {
        await db.deleteScript(id);
        await loadData();
      } catch (error) {
        console.error('Error deleting script:', error);
        alert('Erro ao excluir script');
      }
    }
  };

  const getMessageName = (messageId: string): string => {
    const message = messages.find((m) => m.id === messageId);
    if (!message) return 'Mensagem não encontrada';
    return message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Scripts</h2>
          <p className="text-muted-foreground mt-1">
            Crie sequências de mensagens com delays personalizados.
          </p>
        </div>
        <Button onClick={handleCreateNew}>
          <Plus className="mr-2 h-4 w-4" /> Novo Script
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {scripts.map((script) => (
          <Card key={script.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    {script.name}
                  </CardTitle>
                  {script.description && (
                    <CardDescription className="mt-1">{script.description}</CardDescription>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(script)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(script.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-3">
              <div className="flex gap-4 text-sm text-muted-foreground mb-4">
                <div className="flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" />
                  {script.steps.length} mensagens
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {formatDuration(script.totalDuration)}
                </div>
              </div>

              <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                {script.steps.slice(0, 3).map((step, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px]">
                      {index + 1}
                    </Badge>
                    <span className="truncate flex-1">{getMessageName(step.messageId)}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">+{step.delayAfter / 1000}s</span>
                  </div>
                ))}
                {script.steps.length > 3 && (
                  <div className="text-xs text-muted-foreground pl-7">
                    + {script.steps.length - 3} passos...
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {scripts.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg text-muted-foreground bg-muted/10">
            <FileText className="h-12 w-12 mb-4 opacity-20" />
            <h3 className="text-lg font-medium">Nenhum script criado</h3>
            <p className="text-sm mb-4">Crie scripts para enviar múltiplas mensagens em sequência.</p>
            <Button onClick={handleCreateNew}>
              <Plus className="mr-2 h-4 w-4" /> Criar Script
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          className="max-w-3xl max-h-[90vh] overflow-y-auto bg-background border border-border shadow-lg sm:rounded-xl"
          style={{ backgroundColor: '#09090b', borderColor: '#27272a' }}
        >
          <DialogHeader>
            <DialogTitle>{editingScript ? 'Editar Script' : 'Novo Script'}</DialogTitle>
            <DialogDescription>
              Configure a sequência de mensagens do script.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do Script</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Sequência de Boas-vindas"
                />
              </div>

              <div className="space-y-2">
                <Label>Descrição (Opcional)</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descreva o propósito deste script..."
                  rows={2}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Sequência de Mensagens</Label>
                <Button variant="outline" size="sm" onClick={handleAddStep}>
                  <Plus className="mr-2 h-4 w-4" /> Adicionar Mensagem
                </Button>
              </div>

              <ScrollArea className="h-[300px] border rounded-md p-4 bg-muted/10">
                <div className="space-y-3">
                  {formData.steps.map((step, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-background border rounded-lg shadow-sm group">
                      <div className="flex flex-col items-center gap-1 pt-2">
                        <Badge className="h-6 w-6 rounded-full flex items-center justify-center p-0">
                          {index + 1}
                        </Badge>
                        <div className="flex flex-col gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleMoveStep(index, 'up')}
                            disabled={index === 0}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleMoveStep(index, 'down')}
                            disabled={index === formData.steps.length - 1}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex-1 space-y-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Mensagem</Label>
                          <Select
                            value={step.messageId}
                            onValueChange={(v) => handleUpdateStep(index, 'messageId', v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione uma mensagem" />
                            </SelectTrigger>
                            <SelectContent>
                              {messages.map((msg) => (
                                <SelectItem key={msg.id} value={msg.id}>
                                  <div className="flex items-center gap-2">
                                    {msg.type === 'text' ? <MessageSquare className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                                    <span className="truncate max-w-[200px]">{msg.content}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Delay após envio (segundos)</Label>
                          <Input
                            type="number"
                            value={step.delayAfter / 1000}
                            onChange={(e) => handleUpdateStep(index, 'delayAfter', parseFloat(e.target.value) * 1000)}
                            min="0"
                            step="0.5"
                            className="h-8"
                          />
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive h-8 w-8"
                        onClick={() => handleRemoveStep(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  {formData.steps.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50">
                      <p>Nenhuma mensagem adicionada</p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {formData.steps.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 p-2 rounded">
                  <Clock className="h-4 w-4" />
                  <span>Duração total estimada: <strong>{formatDuration(calculateTotalDuration())}</strong></span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>Cancelar</Button>
            <Button onClick={handleSave}>{editingScript ? 'Atualizar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ScriptsTab;
