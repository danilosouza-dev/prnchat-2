import React, { useState, useEffect } from 'react';
import { Trigger, Script, Message } from '@/types';
import { db } from '@/storage/db';
import { generateId } from '@/utils/helpers';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Edit, Zap, FileText, MessageSquare, Search } from 'lucide-react';

const TriggersTab: React.FC = () => {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null);
  const [formData, setFormData] = useState({
    keyword: '',
    matchType: 'exact' as 'exact' | 'contains' | 'startsWith' | 'endsWith',
    actionType: 'script' as 'script' | 'message',
    actionId: '',
    isActive: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [triggersData, scriptsData, messagesData] = await Promise.all([
      db.getAllTriggers(),
      db.getAllScripts(),
      db.getAllMessages(),
    ]);
    setTriggers(triggersData.sort((a, b) => b.createdAt - a.createdAt));
    setScripts(scriptsData);
    setMessages(messagesData);
  };

  const handleCreateNew = () => {
    setEditingTrigger(null);
    setFormData({
      keyword: '',
      matchType: 'exact',
      actionType: 'script',
      actionId: scripts.length > 0 ? scripts[0].id : '', // Default to first script if available
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (trigger: Trigger) => {
    setEditingTrigger(trigger);
    setFormData({
      keyword: trigger.keyword,
      matchType: trigger.matchType,
      actionType: trigger.actionType,
      actionId: trigger.actionId,
      isActive: trigger.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingTrigger(null);
  };

  const handleSave = async () => {
    if (!formData.keyword.trim()) {
      alert('Por favor, preencha a palavra-chave');
      return;
    }

    if (!formData.actionId) {
      alert('Por favor, selecione uma ação (script ou mensagem)');
      return;
    }

    try {
      const trigger: Trigger = {
        id: editingTrigger?.id || generateId(),
        keyword: formData.keyword.toLowerCase(),
        matchType: formData.matchType,
        actionType: formData.actionType,
        actionId: formData.actionId,
        isActive: formData.isActive,
        createdAt: editingTrigger?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      await db.saveTrigger(trigger);
      await loadData();
      handleCloseDialog();
    } catch (error) {
      console.error('Error saving trigger:', error);
      alert('Erro ao salvar gatilho');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este gatilho?')) {
      try {
        await db.deleteTrigger(id);
        await loadData();
      } catch (error) {
        console.error('Error deleting trigger:', error);
        alert('Erro ao excluir gatilho');
      }
    }
  };

  const handleToggleActive = async (trigger: Trigger) => {
    try {
      await db.saveTrigger({
        ...trigger,
        isActive: !trigger.isActive,
        updatedAt: Date.now(),
      });
      await loadData();
    } catch (error) {
      console.error('Error toggling trigger:', error);
    }
  };

  const getActionName = (type: 'script' | 'message', id: string): string => {
    if (type === 'script') {
      const script = scripts.find((s) => s.id === id);
      return script ? `Script: ${script.name}` : 'Script não encontrado';
    } else {
      const message = messages.find((m) => m.id === id);
      return message
        ? `Mensagem: ${message.content.substring(0, 30)}${message.content.length > 30 ? '...' : ''
        }`
        : 'Mensagem não encontrada';
    }
  };

  const getMatchTypeLabel = (type: string) => {
    switch (type) {
      case 'exact': return 'Exata';
      case 'contains': return 'Contém';
      case 'startsWith': return 'Começa com';
      case 'endsWith': return 'Termina com';
      default: return type;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Gatilhos</h2>
          <p className="text-muted-foreground mt-1">
            Configure respostas automáticas baseadas em palavras-chave.
          </p>
        </div>
        <Button onClick={handleCreateNew}>
          <Plus className="mr-2 h-4 w-4" /> Novo Gatilho
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {triggers.map((trigger) => (
          <Card key={trigger.id} className={`hover:shadow-md transition-shadow ${!trigger.isActive ? 'opacity-70' : ''}`}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-full ${trigger.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-medium">{trigger.keyword}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Correspondência: {getMatchTypeLabel(trigger.matchType)}
                    </CardDescription>
                  </div>
                </div>
                <Switch
                  checked={trigger.isActive}
                  onCheckedChange={() => handleToggleActive(trigger)}
                />
              </div>
            </CardHeader>
            <CardContent className="pb-3">
              <div className="bg-muted/30 rounded-lg p-3 text-sm">
                <div className="text-muted-foreground text-xs mb-1 uppercase tracking-wider font-semibold">Responde com</div>
                <div className="flex items-center gap-2">
                  {trigger.actionType === 'script' ? (
                    <FileText className="h-4 w-4 text-blue-500" />
                  ) : (
                    <MessageSquare className="h-4 w-4 text-green-500" />
                  )}
                  <span className="font-medium truncate">
                    {getActionName(trigger.actionType, trigger.actionId)}
                  </span>
                </div>
              </div>
            </CardContent>
            <div className="px-6 pb-4 pt-0 flex justify-end gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(trigger)}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(trigger.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}

        {triggers.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg text-muted-foreground bg-muted/10">
            <Zap className="h-12 w-12 mb-4 opacity-20" />
            <h3 className="text-lg font-medium">Nenhum gatilho criado</h3>
            <p className="text-sm mb-4">Crie gatilhos para responder automaticamente a mensagens.</p>
            <Button onClick={handleCreateNew}>
              <Plus className="mr-2 h-4 w-4" /> Criar Gatilho
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          className="max-w-md bg-background border border-border shadow-lg sm:rounded-xl"
          style={{ backgroundColor: '#09090b', borderColor: '#27272a' }}
        >
          <DialogHeader>
            <DialogTitle>{editingTrigger ? 'Editar Gatilho' : 'Novo Gatilho'}</DialogTitle>
            <DialogDescription>
              Defina a palavra-chave e a ação correspondente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Palavra-chave</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={formData.keyword}
                  onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
                  placeholder="Ex: preço, olá, suporte"
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Correspondência</Label>
              <Select
                value={formData.matchType}
                onValueChange={(v: any) => setFormData({ ...formData, matchType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact">Exata (igual a)</SelectItem>
                  <SelectItem value="contains">Contém (parte do texto)</SelectItem>
                  <SelectItem value="startsWith">Começa com</SelectItem>
                  <SelectItem value="endsWith">Termina com</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Ação</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={formData.actionType === 'script' ? 'default' : 'outline'}
                  onClick={() => setFormData({ ...formData, actionType: 'script', actionId: scripts.length > 0 ? scripts[0].id : '' })}
                  className="justify-start"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Executar Script
                </Button>
                <Button
                  type="button"
                  variant={formData.actionType === 'message' ? 'default' : 'outline'}
                  onClick={() => setFormData({ ...formData, actionType: 'message', actionId: messages.length > 0 ? messages[0].id : '' })}
                  className="justify-start"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Enviar Mensagem
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{formData.actionType === 'script' ? 'Selecionar Script' : 'Selecionar Mensagem'}</Label>
              <Select
                value={formData.actionId}
                onValueChange={(v) => setFormData({ ...formData, actionId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={formData.actionType === 'script' ? "Escolha um script..." : "Escolha uma mensagem..."} />
                </SelectTrigger>
                <SelectContent>
                  {formData.actionType === 'script' ? (
                    scripts.length > 0 ? (
                      scripts.map((script) => (
                        <SelectItem key={script.id} value={script.id}>
                          {script.name}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-sm text-muted-foreground text-center">Nenhum script disponível</div>
                    )
                  ) : (
                    messages.length > 0 ? (
                      messages.map((message) => (
                        <SelectItem key={message.id} value={message.id}>
                          {message.content.substring(0, 50)}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-sm text-muted-foreground text-center">Nenhuma mensagem disponível</div>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Switch
                id="is-active"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label htmlFor="is-active">Gatilho Ativo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>Cancelar</Button>
            <Button onClick={handleSave}>{editingTrigger ? 'Atualizar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TriggersTab;
