import React, { useState, useEffect } from 'react';
import { Script, ScriptStep, Message } from '@/types';
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
} from '@/components/ui';
import { Zap, Plus, Trash2, ArrowUp, ArrowDown, Clock, Minus, MessageCircle, MessageSquare, Mic, Image, Video, AlertTriangle, ChevronDown } from 'lucide-react';
import { formatDuration } from '@/utils/helpers';

interface NewScriptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingScript: Script | null;
  formData: {
    name: string;
    description: string;
    steps: ScriptStep[];
  };
  setFormData: React.Dispatch<React.SetStateAction<{
    name: string;
    description: string;
    steps: ScriptStep[];
  }>>;
  messages: Message[];
  onSave: () => void;
  onCancel: () => void;
}

const NewScriptModal: React.FC<NewScriptModalProps> = ({
  open,
  onOpenChange,
  editingScript,
  formData,
  setFormData,
  messages,
  onSave,
  onCancel,
}) => {
  const [openDropdowns, setOpenDropdowns] = useState<{ [key: number]: boolean }>({});

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenDropdowns({});
    };

    if (Object.values(openDropdowns).some(v => v)) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openDropdowns]);

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'text':
        return <MessageSquare size={16} />;
      case 'audio':
        return <Mic size={16} />;
      case 'image':
        return <Image size={16} />;
      case 'video':
        return <Video size={16} />;
      default:
        return <MessageSquare size={16} />;
    }
  };

  const toggleDropdown = (index: number) => {
    setOpenDropdowns(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const selectMessage = (index: number, messageId: string) => {
    handleUpdateStep(index, 'messageId', messageId);
    setOpenDropdowns(prev => ({ ...prev, [index]: false }));
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Zap size={24} className="text-[var(--accent-pink)]" />
            {editingScript ? 'Editar Script' : 'Novo Script'}
          </DialogTitle>
          <DialogDescription>
            {editingScript
              ? 'Atualize as informações do script existente.'
              : 'Configure um novo script com sequência de mensagens.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Nome do Script */}
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Script *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Sequência de Boas-vindas"
              required
            />
            <p className="text-xs text-muted-foreground">
              Nome de exibição que aparecerá na lista de scripts.
            </p>
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descreva o propósito deste script..."
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Sequência de Mensagens */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Sequência de Mensagens</Label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddStep}
                disabled={messages.length === 0}
              >
                <Plus size={16} />
                Adicionar Mensagem
              </Button>
            </div>

            {messages.length === 0 && (
              <div className="p-4 border border-orange-500/30 rounded-lg bg-orange-500/10">
                <p className="text-sm text-orange-500 flex items-center gap-2">
                  <AlertTriangle size={16} />
                  Você precisa criar pelo menos uma mensagem antes de adicionar ao script.
                </p>
              </div>
            )}

            {formData.steps.length === 0 && messages.length > 0 && (
              <div className="p-8 border-2 border-dashed border-[var(--border-color)] rounded-lg text-center">
                <MessageCircle size={48} className="mx-auto mb-3 text-[var(--text-tertiary)]" />
                <p className="text-sm text-[var(--text-secondary)]">
                  Nenhuma mensagem adicionada ainda
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                  Clique em "Adicionar Mensagem" para começar
                </p>
              </div>
            )}

            <div className="space-y-3">
              {formData.steps.map((step, index) => (
                  <div
                    key={index}
                    className="p-4 border border-[var(--border-color)] rounded-lg bg-[var(--bg-secondary)] space-y-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--accent-pink)] text-white font-semibold text-sm flex-shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1 space-y-3">
                        {/* Seleção de Mensagem */}
                        <div className="space-y-2">
                          <Label>Mensagem</Label>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleDropdown(index);
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-left hover:border-[var(--accent-pink)] transition-colors"
                            >
                              <div className="text-muted-foreground flex-shrink-0">
                                {getMessageIcon(messages.find(m => m.id === step.messageId)?.type || 'text')}
                              </div>
                              <span className="flex-1 truncate text-sm text-foreground">
                                {(() => {
                                  const selectedMsg = messages.find(m => m.id === step.messageId);
                                  if (!selectedMsg) return 'Selecione uma mensagem';
                                  const displayText = selectedMsg.name || selectedMsg.content.substring(0, 50);
                                  return displayText + (!selectedMsg.name && selectedMsg.content.length > 50 ? '...' : '');
                                })()}
                              </span>
                              <ChevronDown size={16} className={`text-muted-foreground transition-transform ${openDropdowns[index] ? 'rotate-180' : ''}`} />
                            </button>

                            {openDropdowns[index] && (
                              <div
                                className="absolute z-50 w-full mt-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg max-h-60 overflow-y-auto"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {messages.map((msg) => {
                                  const displayText = msg.name || msg.content.substring(0, 50);
                                  const truncated = !msg.name && msg.content.length > 50 ? '...' : '';
                                  return (
                                    <button
                                      key={msg.id}
                                      type="button"
                                      onClick={() => selectMessage(index, msg.id)}
                                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-tertiary)] transition-colors ${
                                        step.messageId === msg.id ? 'bg-[var(--accent-pink)]/10 border-l-2 border-[var(--accent-pink)]' : ''
                                      }`}
                                    >
                                      <div className="text-muted-foreground flex-shrink-0">
                                        {getMessageIcon(msg.type)}
                                      </div>
                                      <span className="flex-1 truncate text-sm text-foreground">
                                        {displayText}{truncated}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Delay */}
                        <div className="space-y-2">
                          <Label>Delay antes do envio</Label>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                const currentValue = step.delayAfter / 1000;
                                const newValue = Math.max(0, currentValue - 0.5);
                                handleUpdateStep(index, 'delayAfter', newValue * 1000);
                              }}
                              className="p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-white hover:bg-[var(--bg-hover)] hover:border-[var(--accent-pink)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={step.delayAfter === 0}
                            >
                              <Minus size={16} />
                            </button>
                            <Input
                              type="number"
                              value={step.delayAfter / 1000}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value);
                                handleUpdateStep(index, 'delayAfter', Math.max(0, value) * 1000);
                              }}
                              min="0"
                              step="0.5"
                              className="max-w-[100px] bg-[var(--bg-tertiary)] text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const currentValue = step.delayAfter / 1000;
                                const newValue = currentValue + 0.5;
                                handleUpdateStep(index, 'delayAfter', newValue * 1000);
                              }}
                              className="p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-white hover:bg-[var(--bg-hover)] hover:border-[var(--accent-pink)] transition-colors"
                            >
                              <Plus size={16} />
                            </button>
                            <span className="text-sm text-muted-foreground">segundos</span>
                          </div>
                        </div>
                      </div>

                      {/* Botões de Ação */}
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleMoveStep(index, 'up')}
                          disabled={index === 0}
                          title="Mover para cima"
                          className="h-8 w-8"
                        >
                          <ArrowUp size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleMoveStep(index, 'down')}
                          disabled={index === formData.steps.length - 1}
                          title="Mover para baixo"
                          className="h-8 w-8"
                        >
                          <ArrowDown size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveStep(index)}
                          title="Remover"
                          className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>
              ))}
            </div>

            {/* Resumo */}
            {formData.steps.length > 0 && (
              <div className="p-4 border border-[var(--accent-pink)]/30 rounded-lg bg-[var(--accent-pink)]/5">
                <div className="flex items-center gap-2 text-sm">
                  <Clock size={16} className="text-[var(--accent-pink)]" />
                  <span className="font-medium text-[var(--accent-pink)]">Resumo:</span>
                  <span className="text-[var(--text-primary)]">
                    {formData.steps.length} mensagens
                  </span>
                  <span className="text-[var(--text-secondary)]">·</span>
                  <span className="text-[var(--text-primary)]">
                    duração total: {formatDuration(calculateTotalDuration())}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={onSave}>
            <Zap size={16} />
            {editingScript ? 'Atualizar' : 'Criar'} Script
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewScriptModal;
