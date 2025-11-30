import React, { useState, useEffect } from 'react';
import { Settings } from '@/types';
import { db } from '@/storage/db';

const SettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<Settings>({
    storageType: 'local',
    autoBackup: false,
    defaultDelay: 2000,
    requireSendConfirmation: true,
    showShortcuts: true,
    showFloatingButton: true,
    showScriptExecutionPopup: true,
    showMessageExecutionPopup: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settingsData = await db.getSettings();
    if (settingsData) {
      setSettings(settingsData);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');

    try {
      await db.saveSettings(settings);
      setSaveMessage('✅ Configurações salvas com sucesso!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveMessage('❌ Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearData = async () => {
    if (
      confirm(
        'Tem certeza que deseja limpar todos os dados? Esta ação não pode ser desfeita!'
      )
    ) {
      try {
        await db.clearAll();
        alert('Dados limpos com sucesso! A página será recarregada.');
        window.location.reload();
      } catch (error) {
        console.error('Error clearing data:', error);
        alert('Erro ao limpar dados');
      }
    }
  };

  return (
    <div className="tab-content">
      <div className="tab-header">
        <div>
          <h2>Configurações</h2>
          <p className="tab-description">
            Configure preferências gerais e opções de armazenamento
          </p>
        </div>
      </div>

      <div className="settings-sections">
        <section className="settings-section">
          <h3>⚙️ Preferências Gerais</h3>

          <div className="form-group">
            <label>Delay Padrão entre Mensagens (segundos)</label>
            <input
              type="number"
              className="form-input"
              value={settings.defaultDelay / 1000}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultDelay: parseInt(e.target.value) * 1000,
                })
              }
              min="0"
              step="0.5"
            />
            <p className="form-help">
              Delay aplicado por padrão ao criar novos passos em scripts
            </p>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.autoBackup}
                onChange={(e) =>
                  setSettings({ ...settings, autoBackup: e.target.checked })
                }
              />
              Backup automático (em desenvolvimento)
            </label>
            <p className="form-help">
              Salvar automaticamente backup dos dados localmente
            </p>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.requireSendConfirmation ?? true}
                onChange={(e) =>
                  setSettings({ ...settings, requireSendConfirmation: e.target.checked })
                }
              />
              Exigir confirmação ao enviar mensagens
            </label>
            <p className="form-help">
              Quando ativado, será necessário clicar duas vezes para confirmar o envio de uma mensagem
            </p>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.showShortcuts ?? true}
                onChange={(e) =>
                  setSettings({ ...settings, showShortcuts: e.target.checked })
                }
              />
              Mostrar atalhos de envio no WhatsApp Web
            </label>
            <p className="form-help">
              Exibe uma barra de atalhos com mensagens e scripts no rodapé do chat
            </p>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.showFloatingButton ?? false}
                onChange={(e) =>
                  setSettings({ ...settings, showFloatingButton: e.target.checked })
                }
              />
              Mostrar botão flutuante no WhatsApp Web
            </label>
            <p className="form-help">
              Exibe um botão flutuante arrastável que abre a extensão dentro do WhatsApp Web.
              Útil para manter o popup sempre visível mesmo ao mudar de chat.
            </p>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.showScriptExecutionPopup ?? true}
                onChange={(e) =>
                  setSettings({ ...settings, showScriptExecutionPopup: e.target.checked })
                }
              />
              Mostrar popup de execução de scripts
            </label>
            <p className="form-help">
              Exibe um popup com o progresso de execução dos scripts (atalhos, gatilhos e popup).
              Scripts continuam funcionando normalmente mesmo com o popup desabilitado.
            </p>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.showMessageExecutionPopup ?? true}
                onChange={(e) =>
                  setSettings({ ...settings, showMessageExecutionPopup: e.target.checked })
                }
              />
              Mostrar popup de envio de mensagens com delay
            </label>
            <p className="form-help">
              Exibe um popup com o progresso ao enviar mensagens que possuem delay configurado.
              Mensagens sem delay são enviadas instantaneamente sem popup.
            </p>
          </div>
        </section>

        <section className="settings-section">
          <h3>💾 Armazenamento</h3>

          <div className="form-group">
            <label>Tipo de Armazenamento</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  value="local"
                  checked={settings.storageType === 'local'}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      storageType: e.target.value as 'local' | 'remote',
                    })
                  }
                />
                💻 Local (IndexedDB)
              </label>
              <label className="radio-label disabled">
                <input
                  type="radio"
                  value="remote"
                  checked={settings.storageType === 'remote'}
                  disabled
                />
                ☁️ Remoto (Em desenvolvimento)
              </label>
            </div>
            <p className="form-help">
              Armazenamento local salva todos os dados no navegador. Armazenamento
              remoto permitirá sincronizar entre dispositivos (em breve).
            </p>
          </div>

          {settings.storageType === 'remote' && (
            <div className="info-box warning">
              ⚠️ Armazenamento remoto estará disponível em versões futuras. Por enquanto,
              apenas o armazenamento local está disponível.
            </div>
          )}
        </section>

        <section className="settings-section">
          <h3>🔧 Manutenção</h3>

          <div className="maintenance-actions">
            <button className="btn-danger" onClick={handleClearData}>
              🗑️ Limpar Todos os Dados
            </button>
            <p className="form-help">
              Remove permanentemente todas as mensagens, scripts, gatilhos e tags.
              Esta ação não pode ser desfeita!
            </p>
          </div>
        </section>

        <section className="settings-section">
          <h3>ℹ️ Sobre</h3>
          <div className="about-section">
            <p>
              <strong>X1Flox</strong> - Extensão Chrome para automação do WhatsApp Web
            </p>
            <p>Versão: 1.0.0</p>
            <p>
              Desenvolvido para facilitar o envio de mensagens e áudios pré-configurados
            </p>
            <div className="feature-list">
              <h4>Recursos:</h4>
              <ul>
                <li>✅ Mensagens de texto e áudio</li>
                <li>✅ Scripts com sequências de mensagens</li>
                <li>✅ Gatilhos automáticos (beta)</li>
                <li>✅ Sistema de tags</li>
                <li>✅ Armazenamento local (IndexedDB)</li>
                <li>🔜 Armazenamento em nuvem</li>
                <li>🔜 Templates dinâmicos</li>
              </ul>
            </div>
          </div>
        </section>
      </div>

      <div className="settings-footer">
        {saveMessage && (
          <div className={`save-message ${saveMessage.includes('✅') ? 'success' : 'error'}`}>
            {saveMessage}
          </div>
        )}
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? '⏳ Salvando...' : '💾 Salvar Configurações'}
        </button>
      </div>
    </div>
  );
};

export default SettingsTab;
