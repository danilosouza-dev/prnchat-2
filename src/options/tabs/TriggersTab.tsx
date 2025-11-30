import React, { useState, useEffect } from 'react';
import { Trigger, TriggerCondition, TriggerConditionType, Script } from '@/types';
import { db } from '@/storage/db';
import { generateId } from '@/utils/helpers';

const TriggersTab: React.FC = () => {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    enabled: true,
    scriptId: '',
    conditions: [] as TriggerCondition[],
  });

  useEffect(() => {
    loadData();
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (menuOpenId) {
        setMenuOpenId(null);
      }
    };

    if (menuOpenId) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [menuOpenId]);

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
    });
  };

  const handleEdit = (trigger: Trigger) => {
    setIsCreating(true);
    setEditingTrigger(trigger);
    setFormData({
      name: trigger.name,
      description: trigger.description || '',
      enabled: trigger.enabled,
      scriptId: trigger.scriptId,
      conditions: trigger.conditions,
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
    });
  };

  const handleAddCondition = () => {
    setFormData({
      ...formData,
      conditions: [
        ...formData.conditions,
        { type: 'contains', value: '', caseSensitive: false },
      ],
    });
  };

  const handleUpdateCondition = (
    index: number,
    field: keyof TriggerCondition,
    value: any
  ) => {
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

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Por favor, preencha o nome do gatilho');
      return;
    }

    if (formData.conditions.length === 0) {
      alert('Adicione pelo menos uma condição');
      return;
    }

    if (!formData.scriptId) {
      alert('Selecione um script');
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
        createdAt: editingTrigger?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      await db.saveTrigger(trigger);
      await loadData();
      handleCancel();
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


  const handleToggleEnabled = async (e: React.MouseEvent, trigger: Trigger) => {
    e.stopPropagation();
    try {
      await db.saveTrigger({ ...trigger, enabled: !trigger.enabled, updatedAt: Date.now() });
      await loadData();
      setMenuOpenId(null);
    } catch (error) {
      console.error('Error toggling trigger:', error);
      alert('Erro ao atualizar gatilho');
    }
  };

  const handleDeleteClick = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await handleDelete(id);
    setMenuOpenId(null);
  };

  const handleEditClick = (e: React.MouseEvent, trigger: Trigger) => {
    e.stopPropagation();
    handleEdit(trigger);
    setMenuOpenId(null);
  };

  const toggleMenu = (e: React.MouseEvent, triggerId: string) => {
    e.stopPropagation();
    setMenuOpenId(menuOpenId === triggerId ? null : triggerId);
  };

  const getScriptName = (scriptId: string): string => {
    const script = scripts.find((s) => s.id === scriptId);
    return script?.name || 'Script não encontrado';
  };

  return (
    <div className="tab-content">
      <div className="tab-header">
        <div>
          <h2>Gatilhos (Beta)</h2>
          <p className="tab-description">
            Configure gatilhos que disparam scripts automaticamente baseado em condições
          </p>
        </div>
        <div className="tab-actions">
          {!isCreating && (
            <button className="btn-primary" onClick={handleCreateNew}>
              ➕ Novo Gatilho
            </button>
          )}
        </div>
      </div>

      {isCreating && (
        <div className="form-card">
          <h3>{editingTrigger ? 'Editar Gatilho' : 'Novo Gatilho'}</h3>

          <div className="form-group">
            <label>Nome do Gatilho *</label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Responder pergunta sobre preço"
            />
          </div>

          <div className="form-group">
            <label>Descrição (opcional)</label>
            <textarea
              className="form-textarea"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descreva quando este gatilho deve ser ativado..."
              rows={2}
            />
          </div>

          <div className="form-group">
            <label>Script a Executar *</label>
            <select
              className="form-select"
              value={formData.scriptId}
              onChange={(e) => setFormData({ ...formData, scriptId: e.target.value })}
            >
              {scripts.map((script) => (
                <option key={script.id} value={script.id}>
                  {script.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              />
              Gatilho ativado
            </label>
          </div>

          <div className="form-group">
            <div className="conditions-header">
              <label>Condições *</label>
              <button className="btn-secondary-sm" onClick={handleAddCondition}>
                ➕ Adicionar Condição
              </button>
            </div>

            <div className="trigger-conditions">
              {formData.conditions.map((condition, index) => (
                <div key={index} className="trigger-condition">
                  <div className="condition-row">
                    <select
                      className="form-select"
                      value={condition.type}
                      onChange={(e) =>
                        handleUpdateCondition(
                          index,
                          'type',
                          e.target.value as TriggerConditionType
                        )
                      }
                    >
                      <option value="contains">Contém</option>
                      <option value="equals">É igual a</option>
                      <option value="starts_with">Começa com</option>
                      <option value="ends_with">Termina com</option>
                      <option value="regex">Expressão regular</option>
                    </select>

                    <input
                      type="text"
                      className="form-input"
                      value={condition.value}
                      onChange={(e) =>
                        handleUpdateCondition(index, 'value', e.target.value)
                      }
                      placeholder="Valor a verificar..."
                    />

                    <button
                      className="icon-btn delete"
                      onClick={() => handleRemoveCondition(index)}
                      title="Remover condição"
                    >
                      🗑️
                    </button>
                  </div>

                  <label className="checkbox-label-sm">
                    <input
                      type="checkbox"
                      checked={condition.caseSensitive}
                      onChange={(e) =>
                        handleUpdateCondition(index, 'caseSensitive', e.target.checked)
                      }
                    />
                    Case sensitive
                  </label>
                </div>
              ))}

              {formData.conditions.length === 0 && (
                <div className="empty-state-small">
                  Nenhuma condição adicionada ainda
                </div>
              )}
            </div>

            {formData.conditions.length > 1 && (
              <div className="info-box">
                ℹ️ Todas as condições devem ser verdadeiras (AND) para o gatilho ser ativado
              </div>
            )}
          </div>

          <div className="form-actions">
            <button className="btn-secondary" onClick={handleCancel}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={handleSave}>
              {editingTrigger ? 'Atualizar' : 'Criar'} Gatilho
            </button>
          </div>
        </div>
      )}

      <div className="triggers-list">
        {triggers.map((trigger) => (
          <div
            key={trigger.id}
            className={`trigger-item ${!trigger.enabled ? 'disabled' : ''}`}
          >
            <div className="trigger-icon">
              {trigger.enabled ? '🎯' : '⏸️'}
            </div>
            <div className="trigger-content">
              <div className="trigger-name">{trigger.name}</div>
              <div className="trigger-subtitle">
                {getScriptName(trigger.scriptId)} · {trigger.conditions.length} condição{trigger.conditions.length !== 1 ? 'ões' : ''}
                {trigger.description && ` · ${trigger.description}`}
              </div>
            </div>
            <div className="trigger-actions">
              <div className="trigger-status-badge">
                {trigger.enabled ? '✅ Ativo' : '⏸️ Inativo'}
              </div>
              <div className="trigger-menu-wrapper">
                <button
                  className="trigger-menu-btn"
                  onClick={(e) => toggleMenu(e, trigger.id)}
                  title="Mais opções"
                >
                  ⋮
                </button>
                {menuOpenId === trigger.id && (
                  <div className="trigger-dropdown-menu">
                    <button onClick={(e) => handleEditClick(e, trigger)}>
                      ✏️ Editar
                    </button>
                    <button onClick={(e) => handleToggleEnabled(e, trigger)}>
                      {trigger.enabled ? '⏸️ Desativar' : '▶️ Ativar'}
                    </button>
                    <button onClick={(e) => handleDeleteClick(e, trigger.id)} className="danger">
                      🗑️ Excluir
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {triggers.length === 0 && !isCreating && (
        <div className="empty-state-large">
          <div className="empty-icon">🎯</div>
          <h3>Nenhum gatilho criado</h3>
          <p>
            Crie gatilhos para executar scripts automaticamente quando mensagens
            recebidas atendem certas condições
          </p>
          <button
            className="btn-primary"
            onClick={handleCreateNew}
            disabled={scripts.length === 0}
          >
            {scripts.length === 0 ? '⚠️ Crie um script primeiro' : '➕ Criar Primeiro Gatilho'}
          </button>
        </div>
      )}
    </div>
  );
};

export default TriggersTab;
