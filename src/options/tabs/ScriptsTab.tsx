import React, { useState, useEffect } from 'react';
import { Script, ScriptStep, Message } from '@/types';
import { db } from '@/storage/db';
import { generateId, formatDate, formatDuration } from '@/utils/helpers';

const ScriptsTab: React.FC = () => {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isCreating, setIsCreating] = useState(false);
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
    setIsCreating(true);
    setEditingScript(null);
    setFormData({
      name: '',
      description: '',
      steps: [],
    });
  };

  const handleEdit = (script: Script) => {
    setIsCreating(true);
    setEditingScript(script);
    setFormData({
      name: script.name,
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
      handleCancel();
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
    <div className="tab-content">
      <div className="tab-header">
        <div>
          <h2>Scripts</h2>
          <p className="tab-description">
            Crie sequências de mensagens com delays personalizados
          </p>
        </div>
        <div className="tab-actions">
          {!isCreating && (
            <button className="btn-primary" onClick={handleCreateNew}>
              ➕ Novo Script
            </button>
          )}
        </div>
      </div>

      {isCreating && (
        <div className="form-card">
          <h3>{editingScript ? 'Editar Script' : 'Novo Script'}</h3>

          <div className="form-group">
            <label>Nome do Script *</label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Sequência de Boas-vindas"
            />
          </div>

          <div className="form-group">
            <label>Descrição (opcional)</label>
            <textarea
              className="form-textarea"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descreva o propósito deste script..."
              rows={3}
            />
          </div>

          <div className="form-group">
            <div className="steps-header">
              <label>Sequência de Mensagens</label>
              <button className="btn-secondary-sm" onClick={handleAddStep}>
                ➕ Adicionar Mensagem
              </button>
            </div>

            <div className="script-steps">
              {formData.steps.map((step, index) => (
                <div key={index} className="script-step">
                  <div className="step-number">{index + 1}</div>

                  <div className="step-content">
                    <div className="step-row">
                      <label>Mensagem</label>
                      <select
                        className="form-select"
                        value={step.messageId}
                        onChange={(e) =>
                          handleUpdateStep(index, 'messageId', e.target.value)
                        }
                      >
                        {messages.map((msg) => (
                          <option key={msg.id} value={msg.id}>
                            {msg.type === 'text' ? '💬' : '🎤'}{' '}
                            {msg.content.substring(0, 60)}
                            {msg.content.length > 60 ? '...' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="step-row">
                      <label>Delay após envio (segundos)</label>
                      <input
                        type="number"
                        className="form-input"
                        value={step.delayAfter / 1000}
                        onChange={(e) =>
                          handleUpdateStep(
                            index,
                            'delayAfter',
                            parseInt(e.target.value) * 1000
                          )
                        }
                        min="0"
                        step="0.5"
                      />
                    </div>
                  </div>

                  <div className="step-actions">
                    <button
                      className="icon-btn"
                      onClick={() => handleMoveStep(index, 'up')}
                      disabled={index === 0}
                      title="Mover para cima"
                    >
                      ⬆️
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => handleMoveStep(index, 'down')}
                      disabled={index === formData.steps.length - 1}
                      title="Mover para baixo"
                    >
                      ⬇️
                    </button>
                    <button
                      className="icon-btn delete"
                      onClick={() => handleRemoveStep(index)}
                      title="Remover"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}

              {formData.steps.length === 0 && (
                <div className="empty-state-small">
                  Nenhuma mensagem adicionada ainda
                </div>
              )}
            </div>

            {formData.steps.length > 0 && (
              <div className="script-summary">
                <strong>📊 Resumo:</strong> {formData.steps.length} mensagens,
                duração total: {formatDuration(calculateTotalDuration())}
              </div>
            )}
          </div>

          <div className="form-actions">
            <button className="btn-secondary" onClick={handleCancel}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={handleSave}>
              {editingScript ? 'Atualizar' : 'Criar'} Script
            </button>
          </div>
        </div>
      )}

      <div className="scripts-list">
        {scripts.map((script) => (
          <div key={script.id} className="script-card">
            <div className="script-card-header">
              <div>
                <h4>{script.name}</h4>
                {script.description && (
                  <p className="script-description">{script.description}</p>
                )}
              </div>
              <div className="script-card-actions">
                <button
                  className="icon-btn"
                  onClick={() => handleEdit(script)}
                  title="Editar"
                >
                  ✏️
                </button>
                <button
                  className="icon-btn delete"
                  onClick={() => handleDelete(script.id)}
                  title="Excluir"
                >
                  🗑️
                </button>
              </div>
            </div>

            <div className="script-steps-preview">
              {script.steps.map((step, index) => (
                <div key={index} className="step-preview">
                  <span className="step-preview-number">{index + 1}.</span>
                  <span className="step-preview-message">
                    {getMessageName(step.messageId)}
                  </span>
                  <span className="step-preview-delay">
                    +{step.delayAfter / 1000}s
                  </span>
                </div>
              ))}
            </div>

            <div className="script-card-footer">
              <span className="script-stats">
                📊 {script.steps.length} mensagens
              </span>
              <span className="script-stats">
                ⏱️ {formatDuration(script.totalDuration)}
              </span>
              <span className="script-date">{formatDate(script.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>

      {scripts.length === 0 && !isCreating && (
        <div className="empty-state-large">
          <div className="empty-icon">⚡</div>
          <h3>Nenhum script criado</h3>
          <p>Crie scripts para enviar múltiplas mensagens em sequência</p>
          <button className="btn-primary" onClick={handleCreateNew}>
            ➕ Criar Primeiro Script
          </button>
        </div>
      )}
    </div>
  );
};

export default ScriptsTab;
