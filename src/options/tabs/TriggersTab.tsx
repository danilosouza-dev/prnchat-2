import React, { useState, useEffect } from 'react';
import { Trigger, TriggerCondition, Script } from '@/types';
import { db } from '@/storage/db';
import { generateId, downloadFile, formatDate } from '@/utils/helpers';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Badge, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui';
import { Plus, Download, Upload, Target, Play, Pause, Edit2, Trash2, ChevronDown, ChevronUp, Zap, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import NewTriggerModal from '../components/NewTriggerModal';

interface TriggersTabProps {
  setHeaderActions?: (actions: React.ReactNode) => void;
}

interface TriggerFormData {
  name: string;
  description: string;
  enabled: boolean;
  scriptId: string;
  conditions: TriggerCondition[];
  skipContacts?: boolean;
  skipGroups?: boolean;
}

const TriggersTab: React.FC<TriggersTabProps> = ({ setHeaderActions }) => {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [triggerToDelete, setTriggerToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState<TriggerFormData>({
    name: '',
    description: '',
    enabled: true,
    scriptId: '',
    conditions: [],
    skipContacts: false,
    skipGroups: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [triggersData, scriptsData] = await Promise.all([
      db.getAllTriggers(),
      db.getAllScripts(),
    ]);
    setTriggers(triggersData.sort((a, b) => b.createdAt - a.createdAt));
    setScripts(scriptsData);
  };

  const handleCreateNew = () => {
    if (scripts.length === 0) {
      alert('Crie pelo menos um script primeiro!');
      return;
    }
    setIsCreating(true);
    setEditingTrigger(null);
    setFormData({
      name: '',
      description: '',
      enabled: true,
      scriptId: scripts[0].id,
      conditions: [],
      skipContacts: false,
      skipGroups: false,
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
          <Button variant="ghost" size="sm" onClick={() => document.getElementById('import-file-triggers')?.click()} title="Importar">
            <Upload size={16} />
            Importar
          </Button>
          <input
            id="import-file-triggers"
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
          <Button variant="accent" onClick={handleCreateNew} size="sm">
            <Plus size={16} />
            Novo Gatilho
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

  const handleEdit = (trigger: Trigger) => {
    setIsCreating(true);
    setEditingTrigger(trigger);
    setFormData({
      name: trigger.name,
      description: trigger.description || '',
      enabled: trigger.enabled,
      scriptId: trigger.scriptId,
      conditions: trigger.conditions,
      skipContacts: trigger.skipContacts || false,
      skipGroups: trigger.skipGroups || false,
    });
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingTrigger(null);
    setFormData({
      name: '',
      description: '',
      enabled: true,
      scriptId: scripts[0]?.id || '',
      conditions: [],
      skipContacts: false,
      skipGroups: false,
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Por favor, preencha o nome do gatilho');
      return;
    }

    if (formData.conditions.length === 0) {
      toast.error('Adicione pelo menos uma condição');
      return;
    }

    if (!formData.scriptId) {
      toast.error('Selecione um script');
      return;
    }

    try {
      const trigger: Trigger = {
        id: editingTrigger?.id || generateId(),
        name: formData.name,
        description: formData.description,
        enabled: formData.enabled,
        scriptId: formData.scriptId,
        conditions: formData.conditions,
        skipContacts: formData.skipContacts,
        skipGroups: formData.skipGroups,
        createdAt: editingTrigger?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      await db.saveTrigger(trigger);
      await loadData();
      handleCancel();

      if (editingTrigger) {
        toast.success('Gatilho atualizado com sucesso!');
      } else {
        toast.success('Gatilho criado com sucesso!');
      }
    } catch (error) {
      console.error('Error saving trigger:', error);
      toast.error('Erro ao salvar gatilho');
    }
  };

  const handleDelete = (id: string) => {
    setTriggerToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteTrigger = async () => {
    if (!triggerToDelete) return;

    try {
      await db.deleteTrigger(triggerToDelete);
      await loadData();
      setDeleteDialogOpen(false);
      setTriggerToDelete(null);
      toast.success('Gatilho excluído com sucesso!');
    } catch (error) {
      console.error('Error deleting trigger:', error);
      toast.error('Erro ao excluir gatilho');
    }
  };


  const handleToggleEnabled = async (trigger: Trigger) => {
    try {
      await db.saveTrigger({ ...trigger, enabled: !trigger.enabled, updatedAt: Date.now() });
      await loadData();
      toast.success(trigger.enabled ? 'Gatilho desativado!' : 'Gatilho ativado!');
    } catch (error) {
      console.error('Error toggling trigger:', error);
      toast.error('Erro ao atualizar gatilho');
    }
  };

  const toggleCardExpansion = (triggerId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(triggerId)) {
        newSet.delete(triggerId);
      } else {
        newSet.add(triggerId);
      }
      return newSet;
    });
  };

  const getScriptName = (scriptId: string): string => {
    const script = scripts.find((s) => s.id === scriptId);
    return script?.name || 'Script não encontrado';
  };

  return (
    <div className="tab-content">
      {/* Modal de criação/edição */}
      <NewTriggerModal
        open={isCreating}
        onOpenChange={setIsCreating}
        editingTrigger={editingTrigger}
        formData={formData}
        setFormData={setFormData}
        scripts={scripts}
        onSave={handleSave}
        onCancel={handleCancel}
      />

      {/* Lista de Gatilhos */}
      <div className="triggers-list-container" style={{ marginTop: '4rem', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
        <div className="triggers-list">
          {triggers.map((trigger) => {
            const isExpanded = expandedCards.has(trigger.id);

            return (
              <Card
                key={trigger.id}
                className="hover:shadow-xl transition-all duration-200 border-border/50 animate-card-entry"
                style={{
                  '--card-index': triggers.findIndex(t => t.id === trigger.id)
                } as React.CSSProperties}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                          {trigger.enabled ? (
                            <Target size={18} className="text-[#e91e63] flex-shrink-0" />
                          ) : (
                            <Pause size={18} className="text-muted-foreground flex-shrink-0" />
                          )}
                          {trigger.name}
                        </CardTitle>
                        <Badge
                          variant={trigger.enabled ? "success" : "secondary"}
                          className="text-xs"
                        >
                          {trigger.enabled ? (
                            <><Play size={12} className="mr-1" /> Ativo</>
                          ) : (
                            <><Pause size={12} className="mr-1" /> Inativo</>
                          )}
                        </Badge>
                      </div>
                      {trigger.description && (
                        <CardDescription className="text-sm text-muted-foreground mt-1">
                          {trigger.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleCardExpansion(trigger.id)}
                        title={isExpanded ? "Recolher" : "Expandir"}
                        className="h-9 w-9 opacity-60 hover:opacity-100 transition-all duration-200 hover:text-[#e91e63] hover:scale-110"
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleEnabled(trigger)}
                        title={trigger.enabled ? "Desativar gatilho" : "Ativar gatilho"}
                        className="h-9 w-9 opacity-60 hover:opacity-100 transition-all duration-200 hover:text-[#e91e63] hover:scale-110"
                      >
                        {trigger.enabled ? <Pause size={18} /> : <Play size={18} />}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(trigger)}
                        title="Editar gatilho"
                        className="h-9 w-9 opacity-60 hover:opacity-100 transition-all duration-200 hover:text-[#e91e63] hover:scale-110"
                      >
                        <Edit2 size={18} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(trigger.id)}
                        title="Excluir gatilho"
                        className="h-9 w-9 opacity-60 hover:opacity-100 transition-all duration-200 hover:text-red-500 hover:scale-110"
                      >
                        <Trash2 size={18} />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <div className="animate-expand-smooth">
                    <CardContent className="pb-3 space-y-3">
                      {/* Script associado */}
                      <div className="flex items-center gap-2 p-3 bg-secondary/30 rounded-lg border border-border/30">
                        <Zap size={16} className="text-[#e91e63] flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground">Script a executar</p>
                          <p className="text-sm font-medium text-foreground">{getScriptName(trigger.scriptId)}</p>
                        </div>
                      </div>

                      {/* Condições */}
                      <div>
                        <p className="text-xs font-medium text-foreground mb-2">Condições ({trigger.conditions.length}):</p>
                        <div className="space-y-2">
                          {trigger.conditions.map((condition, index) => (
                            <div
                              key={index}
                              className="flex items-start gap-2 p-2.5 bg-secondary/20 rounded border border-border/20"
                            >
                              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold flex-shrink-0 mt-0.5">
                                {index + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-foreground">
                                  <span className="font-medium capitalize">{condition.type.replace('_', ' ')}</span>
                                  {': '}
                                  <span className="text-muted-foreground">{condition.value}</span>
                                </p>
                                {condition.caseSensitive && (
                                  <Badge variant="secondary" className="mt-1 text-[10px] px-1.5 py-0">
                                    Case sensitive
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {trigger.conditions.length > 1 && (
                          <div className="flex items-start gap-2 mt-2 p-2 bg-blue-500/10 rounded border border-blue-500/20">
                            <AlertCircle size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-500">
                              Todas as condições devem ser verdadeiras (AND) para o gatilho ser ativado
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Opções de Envio */}
                      {(trigger.skipContacts || trigger.skipGroups) && (
                        <div>
                          <p className="text-xs font-medium text-foreground mb-2">Restrições de envio:</p>
                          <div className="flex flex-wrap gap-2">
                            {trigger.skipContacts && (
                              <Badge variant="secondary" className="text-xs">
                                Não envia para contatos
                              </Badge>
                            )}
                            {trigger.skipGroups && (
                              <Badge variant="secondary" className="text-xs">
                                Não envia para grupos
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>

                    <CardFooter className="pt-3 flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Criado em: {formatDate(trigger.createdAt)}</span>
                    </CardFooter>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {triggers.length === 0 && !isCreating && (
          <div className="empty-state">
            <div className="empty-icon">
              <Target size={48} className="text-[#e91e63]" />
            </div>
            <h3>Nenhum gatilho criado</h3>
            <p>
              Crie gatilhos para executar scripts automaticamente quando mensagens
              recebidas atendem certas condições
            </p>
            {scripts.length === 0 ? (
              <Button variant="secondary" disabled>
                <AlertCircle size={16} className="mr-2" />
                Crie um script primeiro
              </Button>
            ) : (
              <Button variant="accent" onClick={handleCreateNew}>
                <Plus size={16} className="mr-2" />
                Criar Primeiro Gatilho
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Alert Dialog para confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Gatilho</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este gatilho? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary">Cancelar</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="danger" onClick={confirmDeleteTrigger}>
                Excluir
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TriggersTab;
