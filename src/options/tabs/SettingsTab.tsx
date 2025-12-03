import React, { useState, useEffect } from 'react';
import { Settings as SettingsType } from '@/types';
import { db } from '@/storage/db';
import { downloadFile } from '@/utils/helpers';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
  Switch,
  Badge
} from '@/components/ui';
import {
  Download,
  Upload,
  Clock,
  MousePointerClick,
  MessageSquare,
  Play,
  HardDrive,
  Cloud,
  Trash2,
  Info,
  CheckCircle2,
  Save,
  Minus,
  Plus,
  AlertCircle,
  Settings
} from 'lucide-react';
import { toast } from 'sonner';

interface SettingsTabProps {
  setHeaderActions?: (actions: React.ReactNode) => void;
}

const SettingsTab: React.FC<SettingsTabProps> = ({ setHeaderActions }) => {
  const [settings, setSettings] = useState<SettingsType>({
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

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settingsData = await db.getSettings();
    if (settingsData) {
      setSettings(settingsData);
    }
  };

  const handleExport = async () => {
    try {
      const data = await db.exportData();
      downloadFile(data, `princhat-backup-${Date.now()}.json`, 'application/json');
      toast.success('Dados exportados com sucesso!');
    } catch (error) {
      console.error('Error exporting data:', error);
      toast.error('Erro ao exportar dados');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      await db.importData(content);
      await loadSettings();
      toast.success('Dados importados com sucesso!');
    } catch (error) {
      console.error('Error importing data:', error);
      toast.error('Erro ao importar dados');
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
          <Button variant="ghost" size="sm" onClick={() => document.getElementById('import-file-settings')?.click()} title="Importar">
            <Upload size={16} />
            Importar
          </Button>
          <input
            id="import-file-settings"
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </>
      );
    }

    return () => {
      if (setHeaderActions) {
        setHeaderActions(null);
      }
    };
  }, [handleExport, handleImport, setHeaderActions]);

  const handleSave = async () => {
    setIsSaving(true);

    try {
      await db.saveSettings(settings);
      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Erro ao salvar configurações');
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
        toast.success('Dados limpos com sucesso! A página será recarregada.');
        setTimeout(() => window.location.reload(), 1000);
      } catch (error) {
        console.error('Error clearing data:', error);
        toast.error('Erro ao limpar dados');
      }
    }
  };

  return (
    <div className="tab-content">
      <div className="max-w-4xl mx-auto space-y-6 p-6">
        {/* Preferências Gerais */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-[var(--accent-pink)]" />
              <CardTitle>Preferências Gerais</CardTitle>
            </div>
            <CardDescription>
              Configurações de comportamento padrão da extensão
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Delay Padrão */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[var(--text-secondary)]" />
                <Label htmlFor="defaultDelay">Delay Padrão entre Mensagens</Label>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const currentValue = settings.defaultDelay / 1000;
                    const newValue = Math.max(0, currentValue - 0.5);
                    setSettings({ ...settings, defaultDelay: newValue * 1000 });
                  }}
                  className="p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-white hover:bg-[var(--bg-hover)] hover:border-[var(--accent-pink)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={settings.defaultDelay === 0}
                >
                  <Minus size={16} />
                </button>
                <Input
                  id="defaultDelay"
                  type="number"
                  value={settings.defaultDelay === 0 ? '' : settings.defaultDelay / 1000}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      setSettings({ ...settings, defaultDelay: 0 });
                    } else {
                      const newDelay = Math.max(0, parseFloat(value) * 1000);
                      setSettings({ ...settings, defaultDelay: newDelay });
                    }
                  }}
                  min="0"
                  step="0.5"
                  placeholder="0"
                  className="max-w-[100px] bg-[var(--bg-tertiary)] text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const currentValue = settings.defaultDelay / 1000;
                    const newValue = currentValue + 0.5;
                    setSettings({ ...settings, defaultDelay: newValue * 1000 });
                  }}
                  className="p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-white hover:bg-[var(--bg-hover)] hover:border-[var(--accent-pink)] transition-colors"
                >
                  <Plus size={16} />
                </button>
                <span className="text-sm text-[var(--text-secondary)]">segundos</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Delay aplicado por padrão ao criar novos passos em scripts
              </p>
            </div>

            <Separator />

            {/* Auto Backup */}
            <div className="flex items-center justify-between">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-[var(--text-secondary)]" />
                  <Label htmlFor="autoBackup" className="cursor-pointer">
                    Backup automático
                  </Label>
                  <Badge variant="secondary" className="text-xs">Em desenvolvimento</Badge>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Salvar automaticamente backup dos dados localmente
                </p>
              </div>
              <Switch
                id="autoBackup"
                checked={settings.autoBackup}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, autoBackup: checked })
                }
              />
            </div>

            <Separator />

            {/* Confirmação de Envio */}
            <div className="flex items-center justify-between">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <MousePointerClick className="h-4 w-4 text-[var(--text-secondary)]" />
                  <Label htmlFor="requireConfirmation" className="cursor-pointer">
                    Exigir confirmação ao enviar mensagens
                  </Label>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Quando ativado, será necessário clicar duas vezes para confirmar o envio de uma mensagem
                </p>
              </div>
              <Switch
                id="requireConfirmation"
                checked={settings.requireSendConfirmation ?? true}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, requireSendConfirmation: checked })
                }
              />
            </div>

            <Separator />

            {/* Atalhos */}
            <div className="flex items-center justify-between">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-[var(--text-secondary)]" />
                  <Label htmlFor="showShortcuts" className="cursor-pointer">
                    Mostrar atalhos de envio no WhatsApp Web
                  </Label>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Exibe uma barra de atalhos com mensagens e scripts no rodapé do chat
                </p>
              </div>
              <Switch
                id="showShortcuts"
                checked={settings.showShortcuts ?? true}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, showShortcuts: checked })
                }
              />
            </div>

            <Separator />

            {/* Botão Flutuante */}
            <div className="flex items-center justify-between">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <MousePointerClick className="h-4 w-4 text-[var(--text-secondary)]" />
                  <Label htmlFor="showFloatingButton" className="cursor-pointer">
                    Mostrar botão flutuante no WhatsApp Web
                  </Label>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Exibe um botão flutuante arrastável que abre a extensão dentro do WhatsApp Web
                </p>
              </div>
              <Switch
                id="showFloatingButton"
                checked={settings.showFloatingButton ?? false}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, showFloatingButton: checked })
                }
              />
            </div>

            <Separator />

            {/* Popup Scripts */}
            <div className="flex items-center justify-between">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-[var(--text-secondary)]" />
                  <Label htmlFor="showScriptPopup" className="cursor-pointer">
                    Mostrar popup de execução de scripts
                  </Label>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Exibe um popup com o progresso de execução dos scripts
                </p>
              </div>
              <Switch
                id="showScriptPopup"
                checked={settings.showScriptExecutionPopup ?? true}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, showScriptExecutionPopup: checked })
                }
              />
            </div>

            <Separator />

            {/* Popup Mensagens */}
            <div className="flex items-center justify-between">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-[var(--text-secondary)]" />
                  <Label htmlFor="showMessagePopup" className="cursor-pointer">
                    Mostrar popup de envio de mensagens com delay
                  </Label>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Exibe um popup com o progresso ao enviar mensagens que possuem delay configurado
                </p>
              </div>
              <Switch
                id="showMessagePopup"
                checked={settings.showMessageExecutionPopup ?? true}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, showMessageExecutionPopup: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Armazenamento */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-[var(--accent-pink)]" />
              <CardTitle>Armazenamento</CardTitle>
            </div>
            <CardDescription>
              Escolha onde seus dados serão armazenados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label>Tipo de Armazenamento</Label>
              <div className="space-y-3">
                <div
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${settings.storageType === 'local'
                      ? 'border-[var(--accent-pink)] bg-[var(--accent-pink)]/10'
                      : 'border-[var(--border-color)] hover:border-[var(--accent-pink)]/50'
                    }`}
                  onClick={() => setSettings({ ...settings, storageType: 'local' })}
                >
                  <HardDrive className="h-5 w-5 text-[var(--accent-pink)]" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Local (IndexedDB)</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Dados armazenados no navegador
                    </p>
                  </div>
                  {settings.storageType === 'local' && (
                    <CheckCircle2 className="h-5 w-5 text-[var(--accent-pink)]" />
                  )}
                </div>

                <div
                  className="flex items-center gap-3 p-4 rounded-lg border-2 border-[var(--border-color)] opacity-50 cursor-not-allowed"
                >
                  <Cloud className="h-5 w-5 text-[var(--text-secondary)]" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Remoto (Nuvem)</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Sincronize entre dispositivos
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">Em breve</Badge>
                </div>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Armazenamento local salva todos os dados no navegador. Armazenamento
                remoto permitirá sincronizar entre dispositivos (em breve).
              </p>
            </div>

            {settings.storageType === 'remote' && (
              <div className="flex gap-2 p-3 rounded-lg bg-[var(--warning-color)]/10 border border-[var(--warning-color)]/30">
                <AlertCircle className="h-4 w-4 text-[var(--warning-color)] flex-shrink-0 mt-0.5" />
                <p className="text-xs text-[var(--warning-color)]">
                  Armazenamento remoto estará disponível em versões futuras. Por enquanto,
                  apenas o armazenamento local está disponível.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manutenção */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-[var(--error-color)]" />
              <CardTitle>Manutenção</CardTitle>
            </div>
            <CardDescription>
              Gerenciar dados da extensão
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Button
                variant="danger"
                onClick={handleClearData}
                className="w-full sm:w-auto"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Limpar Todos os Dados
              </Button>
              <p className="text-xs text-[var(--text-secondary)]">
                Remove permanentemente todas as mensagens, scripts, gatilhos e tags.
                Esta ação não pode ser desfeita!
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Sobre */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-[var(--accent-pink)]" />
              <CardTitle>Sobre</CardTitle>
            </div>
            <CardDescription>
              Informações sobre o PrinChat
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm">
                <strong className="text-[var(--accent-pink)]">PrinChat</strong> - Extensão Chrome para automação do WhatsApp Web
              </p>
              <p className="text-sm text-[var(--text-secondary)]">Versão: 1.0.0</p>
              <p className="text-sm text-[var(--text-secondary)]">
                Desenvolvido para facilitar o envio de mensagens e áudios pré-configurados
              </p>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Recursos:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-[var(--success-color)]" />
                  <span>Mensagens de texto e áudio</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-[var(--success-color)]" />
                  <span>Scripts com sequências</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-[var(--success-color)]" />
                  <span>Gatilhos automáticos (beta)</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-[var(--success-color)]" />
                  <span>Sistema de tags</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-[var(--success-color)]" />
                  <span>Armazenamento local</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Clock className="h-4 w-4" />
                  <span>Armazenamento em nuvem</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Clock className="h-4 w-4" />
                  <span>Templates dinâmicos</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Botão Salvar Fixo */}
        <div className="sticky bottom-0 bg-[var(--bg-color)] p-4 border-t border-[var(--border-color)] -mx-6 -mb-6 flex items-center justify-end">
          <Button
            variant="accent"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar Configurações
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;
