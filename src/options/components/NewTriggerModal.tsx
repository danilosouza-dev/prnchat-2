import React, { useState, useEffect } from 'react';
import { Trigger, TriggerCondition, TriggerConditionType, Script } from '@/types';
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
  Switch,
} from '@/components/ui';
import { Target, Plus, Trash2, Zap, AlertCircle, ChevronDown, Type, Check } from 'lucide-react';

interface TriggerFormData {
  name: string;
  description: string;
  enabled: boolean;
  scriptId: string;
  conditions: TriggerCondition[];
  skipContacts?: boolean;
  skipGroups?: boolean;
}

interface NewTriggerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTrigger: Trigger | null;
  formData: TriggerFormData;
  setFormData: React.Dispatch<React.SetStateAction<TriggerFormData>>;
  scripts: Script[];
  onSave: () => void;
  onCancel: () => void;
}

const NewTriggerModal: React.FC<NewTriggerModalProps> = ({
  open,
  onOpenChange,
  editingTrigger,
  formData,
  setFormData,
  scripts,
  onSave,
  onCancel,
}) => {
  const [openScriptDropdown, setOpenScriptDropdown] = useState(false);
  const [openConditionTypeDropdowns, setOpenConditionTypeDropdowns] = useState<{ [key: number]: boolean }>({});

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenScriptDropdown(false);
      setOpenConditionTypeDropdowns({});
    };

    if (openScriptDropdown || Object.values(openConditionTypeDropdowns).some(v => v)) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openScriptDropdown, openConditionTypeDropdowns]);

  const conditionTypes: { value: TriggerConditionType; label: string; description: string }[] = [
    { value: 'contains', label: 'Contém', description: 'A mensagem contém o texto' },
    { value: 'equals', label: 'É igual a', description: 'A mensagem é exatamente igual ao texto' },
    { value: 'starts_with', label: 'Começa com', description: 'A mensagem começa com o texto' },
    { value: 'ends_with', label: 'Termina com', description: 'A mensagem termina com o texto' },
    { value: 'regex', label: 'Expressão regular', description: 'A mensagem corresponde ao padrão regex' },
  ];

  const handleAddCondition = () => {
    setFormData({
      ...formData,
      conditions: [
        ...formData.conditions,
        { type: 'contains', value: '', caseSensitive: false },
      ],
    });
  };

  const handleUpdateCondition = (index: number, field: keyof TriggerCondition, value: any) => {
    const newConditions = [...formData.conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };
    setFormData({ ...formData, conditions: newConditions });
  };

  const handleRemoveCondition = (index: number) => {
    setFormData({
      ...formData,
      conditions: formData.conditions.filter((_, i) => i !== index),
    });
  };

  const toggleScriptDropdown = () => {
    setOpenScriptDropdown(!openScriptDropdown);
  };

  const selectScript = (scriptId: string) => {
    setFormData({ ...formData, scriptId });
    setOpenScriptDropdown(false);
  };

  const toggleConditionTypeDropdown = (index: number) => {
    setOpenConditionTypeDropdowns(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const selectConditionType = (index: number, type: TriggerConditionType) => {
    handleUpdateCondition(index, 'type', type);
    setOpenConditionTypeDropdowns(prev => ({ ...prev, [index]: false }));
  };

  const getConditionTypeLabel = (type: TriggerConditionType): string => {
    return conditionTypes.find(ct => ct.value === type)?.label || type;
  };

  const getScriptName = (scriptId: string): string => {
    const script = scripts.find(s => s.id === scriptId);
    return script?.name || 'Selecione um script';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Target size={24} className="text-[var(--accent-pink)]" />
            {editingTrigger ? 'Editar Gatilho' : 'Novo Gatilho'}
          </DialogTitle>
          <DialogDescription>
            {editingTrigger
              ? 'Atualize as informações do gatilho existente.'
              : 'Configure um novo gatilho para executar scripts automaticamente.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Nome do Gatilho */}
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Gatilho *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Responder pergunta sobre preço"
              required
            />
            <p className="text-xs text-muted-foreground">
              Nome de exibição que aparecerá na lista de gatilhos.
            </p>
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descreva quando este gatilho deve ser ativado..."
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Seleção de Script */}
          <div className="space-y-2">
            <Label>Script a Executar *</Label>

            {scripts.length === 0 ? (
              <div className="p-4 border border-orange-500/30 rounded-lg bg-orange-500/10">
                <p className="text-sm text-orange-500 flex items-center gap-2">
                  <AlertCircle size={16} />
                  Você precisa criar pelo menos um script antes de criar um gatilho.
                </p>
              </div>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleScriptDropdown();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-left hover:border-[var(--accent-pink)] transition-colors"
                >
                  <div className="text-muted-foreground flex-shrink-0">
                    <Zap size={16} />
                  </div>
                  <span className="flex-1 truncate text-sm text-foreground">
                    {getScriptName(formData.scriptId)}
                  </span>
                  <ChevronDown size={16} className={`text-muted-foreground transition-transform ${openScriptDropdown ? 'rotate-180' : ''}`} />
                </button>

                {openScriptDropdown && (
                  <div
                    className="absolute z-50 w-full mt-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg max-h-60 overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {scripts.map((script) => (
                      <button
                        key={script.id}
                        type="button"
                        onClick={() => selectScript(script.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-tertiary)] transition-colors ${
                          formData.scriptId === script.id ? 'bg-[var(--accent-pink)]/10 border-l-2 border-[var(--accent-pink)]' : ''
                        }`}
                      >
                        <div className="text-muted-foreground flex-shrink-0">
                          <Zap size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{script.name}</p>
                          {script.description && (
                            <p className="text-xs text-muted-foreground truncate">{script.description}</p>
                          )}
                        </div>
                        {formData.scriptId === script.id && (
                          <Check size={16} className="text-[var(--accent-pink)] flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              O script será executado quando todas as condições forem atendidas.
            </p>
          </div>

          {/* Status (Ativado/Desativado) */}
          <div className="flex items-center justify-between p-4 border border-[var(--border-color)] rounded-lg bg-[var(--bg-secondary)]">
            <div className="space-y-0.5">
              <Label htmlFor="enabled">Gatilho ativado</Label>
              <p className="text-xs text-muted-foreground">
                Quando desativado, o gatilho não será executado
              </p>
            </div>
            <Switch
              id="enabled"
              checked={formData.enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
            />
          </div>

          {/* Opções de Envio */}
          <div className="space-y-3">
            <Label>Opções de Envio</Label>

            {/* Não enviar para contatos */}
            <div className="flex items-center justify-between p-4 border border-[var(--border-color)] rounded-lg bg-[var(--bg-secondary)]">
              <div className="space-y-0.5">
                <Label htmlFor="skipContacts">Não enviar para contatos</Label>
                <p className="text-xs text-muted-foreground">
                  O gatilho não será acionado em conversas individuais
                </p>
              </div>
              <Switch
                id="skipContacts"
                checked={formData.skipContacts || false}
                onCheckedChange={(checked) => setFormData({ ...formData, skipContacts: checked })}
              />
            </div>

            {/* Não enviar para grupos */}
            <div className="flex items-center justify-between p-4 border border-[var(--border-color)] rounded-lg bg-[var(--bg-secondary)]">
              <div className="space-y-0.5">
                <Label htmlFor="skipGroups">Não enviar para grupos</Label>
                <p className="text-xs text-muted-foreground">
                  O gatilho não será acionado em conversas de grupo
                </p>
              </div>
              <Switch
                id="skipGroups"
                checked={formData.skipGroups || false}
                onCheckedChange={(checked) => setFormData({ ...formData, skipGroups: checked })}
              />
            </div>
          </div>

          {/* Condições */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Condições *</Label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddCondition}
              >
                <Plus size={16} />
                Adicionar Condição
              </Button>
            </div>

            {formData.conditions.length === 0 && (
              <div className="p-8 border-2 border-dashed border-[var(--border-color)] rounded-lg text-center">
                <Type size={48} className="mx-auto mb-3 text-[var(--text-tertiary)]" />
                <p className="text-sm text-[var(--text-secondary)]">
                  Nenhuma condição adicionada ainda
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                  Clique em "Adicionar Condição" para começar
                </p>
              </div>
            )}

            <div className="space-y-3">
              {formData.conditions.map((condition, index) => (
                <div
                  key={index}
                  className="p-4 border border-[var(--border-color)] rounded-lg bg-[var(--bg-secondary)] space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--accent-pink)] text-white font-semibold text-sm flex-shrink-0">
                      {index + 1}
                    </div>
                    <div className="flex-1 space-y-3">
                      {/* Tipo de Condição */}
                      <div className="space-y-2">
                        <Label>Tipo de Condição</Label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleConditionTypeDropdown(index);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-left hover:border-[var(--accent-pink)] transition-colors"
                          >
                            <span className="flex-1 text-sm text-foreground">
                              {getConditionTypeLabel(condition.type)}
                            </span>
                            <ChevronDown size={16} className={`text-muted-foreground transition-transform ${openConditionTypeDropdowns[index] ? 'rotate-180' : ''}`} />
                          </button>

                          {openConditionTypeDropdowns[index] && (
                            <div
                              className="absolute z-50 w-full mt-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg max-h-60 overflow-y-auto"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {conditionTypes.map((ct) => (
                                <button
                                  key={ct.value}
                                  type="button"
                                  onClick={() => selectConditionType(index, ct.value)}
                                  className={`w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-tertiary)] transition-colors ${
                                    condition.type === ct.value ? 'bg-[var(--accent-pink)]/10 border-l-2 border-[var(--accent-pink)]' : ''
                                  }`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-foreground font-medium">{ct.label}</p>
                                    <p className="text-xs text-muted-foreground">{ct.description}</p>
                                  </div>
                                  {condition.type === ct.value && (
                                    <Check size={16} className="text-[var(--accent-pink)] flex-shrink-0 mt-0.5" />
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Valor */}
                      <div className="space-y-2">
                        <Label>Valor a Verificar</Label>
                        <Input
                          value={condition.value}
                          onChange={(e) => handleUpdateCondition(index, 'value', e.target.value)}
                          placeholder={
                            condition.type === 'regex'
                              ? 'Ex: ^(oi|olá|hello).*'
                              : 'Ex: preço, quanto custa, etc.'
                          }
                        />
                      </div>

                      {/* Case Sensitive */}
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`case-sensitive-${index}`}
                          checked={condition.caseSensitive}
                          onCheckedChange={(checked) => handleUpdateCondition(index, 'caseSensitive', checked)}
                        />
                        <Label htmlFor={`case-sensitive-${index}`} className="text-sm cursor-pointer">
                          Diferenciar maiúsculas de minúsculas (case sensitive)
                        </Label>
                      </div>
                    </div>

                    {/* Botão de Remover */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveCondition(index)}
                      title="Remover condição"
                      className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10 flex-shrink-0"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Aviso sobre operador AND */}
            {formData.conditions.length > 1 && (
              <div className="p-4 border border-blue-500/30 rounded-lg bg-blue-500/5">
                <div className="flex items-start gap-2 text-sm">
                  <AlertCircle size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-500">Todas as condições devem ser verdadeiras</p>
                    <p className="text-xs text-blue-400 mt-1">
                      O gatilho será ativado apenas quando TODAS as condições forem atendidas (operador AND).
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={onSave} disabled={scripts.length === 0}>
            <Target size={16} />
            {editingTrigger ? 'Atualizar' : 'Criar'} Gatilho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewTriggerModal;
