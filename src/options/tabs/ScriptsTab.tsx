import React, { useState, useEffect } from 'react';
import { Script, ScriptStep, Message } from '@/types';
import { db } from '@/storage/db';
import { generateId, formatDate, formatDuration, downloadFile } from '@/utils/helpers';
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Badge, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui';
import { Plus, Download, Upload, Edit2, Trash2, MessageSquare, Clock, Calendar, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import NewScriptModal from '../components/NewScriptModal';
import { toast } from 'sonner';

interface ScriptsTabProps {
  setHeaderActions?: (actions: React.ReactNode) => void;
}

const ScriptsTab: React.FC<ScriptsTabProps> = ({ setHeaderActions }) => {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scriptToDelete, setScriptToDelete] = useState<string | null>(null);
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
    setIsCreating(true);
    setEditingScript(null);
    setFormData({
      name: '',
      description: '',
      steps: [],
    });
  };

  const handleExport = async () => {
    try {
      const data = await db.exportData();
      downloadFile(data, `princhat-backup-${Date.now()}.json`, 'application/json');
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

  // Expor actions para o header global
  useEffect(() => {
    if (setHeaderActions) {
      setHeaderActions(
        <>
          <Button variant="ghost" size="sm" onClick={handleExport} title="Exportar">
            <Download size={16} />
            Exportar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => document.getElementById('import-file-scripts')?.click()} title="Importar">
            <Upload size={16} />
            Importar
          </Button>
          <input
            id="import-file-scripts"
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
          <Button variant="accent" onClick={handleCreateNew} size="sm">
            <Plus size={16} />
            Novo Script
          </Button>
        </>
      );
    }

    return () => {
      if (setHeaderActions) {
        setHeaderActions(null);
      }
    };
  }, [handleExport, handleImport, handleCreateNew, setHeaderActions]);

  const handleEdit = (script: Script) => {
    setIsCreating(true);
    setEditingScript(script);
    setFormData({
      name: script.name || script.title,
      description: script.description || '',
      steps: script.steps,
    });
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingScript(null);
    setFormData({
      name: '',
      description: '',
      steps: [],
    });
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
      toast.error('Por favor, preencha o nome do script');
      return;
    }

    if (formData.steps.length === 0) {
      toast.error('Adicione pelo menos uma mensagem ao script');
      return;
    }

    try {
      const script: Script = {
        id: editingScript?.id || generateId(),
        name: formData.name,
        title: formData.name, // Required for sync
        description: formData.description,
        steps: formData.steps,
        totalDuration: calculateTotalDuration(),
        createdAt: editingScript?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      await db.saveScript(script);
      // Auto-sync
      try {
        const { syncService } = await import('@/services/sync-service');
        await syncService.syncScript(script);
      } catch (e) {
        console.error('Auto-sync failed:', e);
      }

      await loadData();
      handleCancel();

      if (editingScript) {
        toast.success('Script atualizado com sucesso!');
      } else {
        toast.success('Script criado com sucesso!');
      }
    } catch (error) {
      console.error('Error saving script:', error);
      toast.error('Erro ao salvar script');
    }
  };

  const handleDelete = (id: string) => {
    setScriptToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteScript = async () => {
    if (!scriptToDelete) return;

    try {
      await db.deleteScript(scriptToDelete);
      // Auto-sync delete
      try {
        const { syncService } = await import('@/services/sync-service');
        await syncService.deleteScript(scriptToDelete);
      } catch (e) {
        console.error('Auto-sync delete failed:', e);
      }

      await loadData();
      setDeleteDialogOpen(false);
      setScriptToDelete(null);
      toast.success('Script excluído com sucesso!');
    } catch (error) {
      console.error('Error deleting script:', error);
      toast.error('Erro ao excluir script');
    }
  };

  const getMessageName = (messageId: string): string => {
    const message = messages.find((m) => m.id === messageId);
    if (!message) return 'Mensagem não encontrada';
    return message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '');
  };

  const toggleCardExpansion = (scriptId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(scriptId)) {
        newSet.delete(scriptId);
      } else {
        newSet.add(scriptId);
      }
      return newSet;
    });
  };

  return (
    <div className="tab-content">
      {/* Modal de criação/edição */}
      <NewScriptModal
        open={isCreating}
        onOpenChange={setIsCreating}
        editingScript={editingScript}
        formData={formData}
        setFormData={setFormData}
        messages={messages}
        onSave={handleSave}
        onCancel={handleCancel}
      />

      {/* Lista de Scripts */}
      <div className="scripts-list-container" style={{ marginTop: '4rem', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
        <div className="scripts-list">
          {scripts.map((script) => {
            const isExpanded = expandedCards.has(script.id);

            return (
              <Card
                key={script.id}
                className="hover:shadow-xl transition-all duration-200 border-border/50 animate-card-entry"
                style={{
                  '--card-index': scripts.findIndex(s => s.id === script.id)
                } as React.CSSProperties}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                        <Zap size={18} className="text-[#e91e63] flex-shrink-0" />
                        {script.name || script.title}
                      </CardTitle>
                      {script.description && (
                        <CardDescription className="text-sm text-muted-foreground mt-1">
                          {script.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleCardExpansion(script.id)}
                        title={isExpanded ? "Recolher" : "Expandir"}
                        className="h-9 w-9 opacity-60 hover:opacity-100 transition-all duration-200 hover:text-[#e91e63] hover:scale-110"
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(script)}
                        title="Editar script"
                        className="h-9 w-9 opacity-60 hover:opacity-100 transition-all duration-200 hover:text-[#e91e63] hover:scale-110"
                      >
                        <Edit2 size={18} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(script.id)}
                        title="Excluir script"
                        className="h-9 w-9 opacity-60 hover:opacity-100 transition-all duration-200 hover:text-red-500 hover:scale-110"
                      >
                        <Trash2 size={18} />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <div className="animate-expand-smooth">
                    <CardContent className="pb-3 space-y-2">
                      {script.steps.map((step, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg border border-border/30 hover:border-border/60 transition-colors"
                        >
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex-shrink-0">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">
                              {getMessageName(step.messageId)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                            <Clock size={12} />
                            <span>+{step.delayAfter / 1000}s</span>
                          </div>
                        </div>
                      ))}
                    </CardContent>

                    <CardFooter className="pt-3 flex-wrap gap-2">
                      <Badge variant="secondary" className="flex items-center gap-1.5 px-2.5 py-1">
                        <MessageSquare size={13} />
                        <span>{script.steps.length} mensagens</span>
                      </Badge>
                      <Badge variant="secondary" className="flex items-center gap-1.5 px-2.5 py-1">
                        <Clock size={13} />
                        <span>{formatDuration(script.totalDuration)}</span>
                      </Badge>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
                        <Calendar size={13} />
                        <span>{formatDate(script.createdAt)}</span>
                      </div>
                    </CardFooter>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {scripts.length === 0 && !isCreating && (
          <div className="empty-state">
            <div className="empty-icon">
              <Zap size={48} className="text-[#e91e63]" />
            </div>
            <h3>Nenhum script criado</h3>
            <p>Crie scripts para enviar múltiplas mensagens em sequência</p>
            <Button variant="accent" onClick={handleCreateNew}>
              <Plus size={16} className="mr-2" />
              Criar Primeiro Script
            </Button>
          </div>
        )}
      </div>

      {/* Alert Dialog para confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Script</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este script? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary">Cancelar</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="danger" onClick={confirmDeleteScript}>
                Excluir
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ScriptsTab;
