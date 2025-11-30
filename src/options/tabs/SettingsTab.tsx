import React, { useState, useEffect } from 'react';
import { Settings } from '@/types';
import { db } from '@/storage/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save, RefreshCw, Settings as SettingsIcon, Shield, Trash2, Info } from 'lucide-react';

const SettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<Settings>({
    apiKey: '',
    webhookUrl: '',
    autoReply: false,
    delayBetweenMessages: 1000,
    storageType: 'local',
    autoBackup: false,
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
    const data = await db.getSettings();
    if (data) {
      setSettings({
        ...data,
        apiKey: data.apiKey || '',
        webhookUrl: data.webhookUrl || '',
        autoReply: data.autoReply || false,
        delayBetweenMessages: data.delayBetweenMessages || 1000,
        storageType: data.storageType || 'local',
        autoBackup: data.autoBackup || false,
        requireSendConfirmation: data.requireSendConfirmation ?? true,
        showShortcuts: data.showShortcuts ?? true,
        showFloatingButton: data.showFloatingButton ?? true,
        showScriptExecutionPopup: data.showScriptExecutionPopup ?? true,
        showMessageExecutionPopup: data.showMessageExecutionPopup ?? true,
      });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await db.saveSettings(settings);
      await new Promise(resolve => setTimeout(resolve, 500));
      alert('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (confirm('Tem certeza que deseja restaurar as configurações padrão?')) {
      const defaultSettings: Settings = {
        apiKey: '',
        webhookUrl: '',
        autoReply: false,
        delayBetweenMessages: 1000,
        storageType: 'local',
        autoBackup: false,
        requireSendConfirmation: true,
        showShortcuts: true,
        showFloatingButton: true,
        showScriptExecutionPopup: true,
        showMessageExecutionPopup: true,
      };
      setSettings(defaultSettings);
      await db.saveSettings(defaultSettings);
    }
  };

  const handleClearData = async () => {
    if (confirm('Tem certeza que deseja limpar TODOS os dados? Esta ação não pode ser desfeita.')) {
      try {
        await db.clearAll();
        alert('Todos os dados foram limpos com sucesso!');
        loadSettings();
      } catch (error) {
        console.error('Error clearing data:', error);
        alert('Erro ao limpar dados.');
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Configurações</h2>
        <p className="text-muted-foreground mt-1">
          Gerencie as configurações globais da extensão.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Geral */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-primary" />
              <CardTitle>Geral</CardTitle>
            </div>
            <CardDescription>
              Configurações básicas de funcionamento da extensão.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Resposta Automática</Label>
                <p className="text-sm text-muted-foreground">
                  Ativar ou desativar o sistema de resposta automática globalmente.
                </p>
              </div>
              <Switch
                checked={settings.autoReply}
                onCheckedChange={(checked) => setSettings({ ...settings, autoReply: checked })}
              />
            </div>

            <div className="space-y-2">
              <Label>Delay Padrão entre Mensagens (ms)</Label>
              <div className="flex items-center gap-4">
                <Input
                  type="number"
                  value={settings.delayBetweenMessages}
                  onChange={(e) => setSettings({ ...settings, delayBetweenMessages: parseInt(e.target.value) || 0 })}
                  min="0"
                  step="100"
                  className="max-w-[200px]"
                />
                <span className="text-sm text-muted-foreground">
                  {settings.delayBetweenMessages / 1000} segundos
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Tempo de espera padrão entre o envio de mensagens em scripts.
              </p>
            </div>

            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Exigir confirmação ao enviar mensagens</Label>
                <p className="text-sm text-muted-foreground">
                  Quando ativado, será necessário clicar duas vezes para confirmar o envio de uma mensagem.
                </p>
              </div>
              <Switch
                checked={settings.requireSendConfirmation ?? true}
                onCheckedChange={(checked) => setSettings({ ...settings, requireSendConfirmation: checked })}
              />
            </div>

            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Mostrar atalhos de envio no WhatsApp Web</Label>
                <p className="text-sm text-muted-foreground">
                  Exibe uma barra de atalhos com mensagens e scripts no rodapé do chat.
                </p>
              </div>
              <Switch
                checked={settings.showShortcuts ?? true}
                onCheckedChange={(checked) => setSettings({ ...settings, showShortcuts: checked })}
              />
            </div>

            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Mostrar botão flutuante no WhatsApp Web</Label>
                <p className="text-sm text-muted-foreground">
                  Exibe um botão flutuante arrastável que abre a extensão dentro do WhatsApp Web.
                </p>
              </div>
              <Switch
                checked={settings.showFloatingButton ?? true}
                onCheckedChange={(checked) => setSettings({ ...settings, showFloatingButton: checked })}
              />
            </div>

            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Mostrar popup de execução de scripts</Label>
                <p className="text-sm text-muted-foreground">
                  Exibe um popup com o progresso de execução dos scripts.
                </p>
              </div>
              <Switch
                checked={settings.showScriptExecutionPopup ?? true}
                onCheckedChange={(checked) => setSettings({ ...settings, showScriptExecutionPopup: checked })}
              />
            </div>

            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Mostrar popup de envio de mensagens com delay</Label>
                <p className="text-sm text-muted-foreground">
                  Exibe um popup com o progresso ao enviar mensagens que possuem delay configurado.
                </p>
              </div>
              <Switch
                checked={settings.showMessageExecutionPopup ?? true}
                onCheckedChange={(checked) => setSettings({ ...settings, showMessageExecutionPopup: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Integrações */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Integrações (Opcional)</CardTitle>
            </div>
            <CardDescription>
              Configure chaves de API e Webhooks para recursos avançados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>API Key (OpenAI / Gemini)</Label>
              <Input
                type="password"
                value={settings.apiKey || ''}
                onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                placeholder="sk-..."
              />
              <p className="text-sm text-muted-foreground">
                Necessário apenas se você planeja usar recursos de IA generativa.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input
                type="url"
                value={settings.webhookUrl || ''}
                onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })}
                placeholder="https://seu-webhook.com/endpoint"
              />
              <p className="text-sm text-muted-foreground">
                URL para onde os eventos de mensagens recebidas serão enviados.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Manutenção */}
        <Card className="border-destructive/50">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              <CardTitle>Zona de Perigo</CardTitle>
            </div>
            <CardDescription>
              Ações irreversíveis que afetam seus dados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium">Limpar Todos os Dados</p>
                <p className="text-sm text-muted-foreground">
                  Remove permanentemente todas as mensagens, scripts, gatilhos e tags.
                </p>
              </div>
              <Button variant="destructive" onClick={handleClearData}>
                Limpar Tudo
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sobre */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              <CardTitle>Sobre</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground space-y-2">
              <p><strong>X1Flox</strong> - Extensão Chrome para automação do WhatsApp Web</p>
              <p>Versão: 1.0.0</p>
              <p>Desenvolvido para facilitar o envio de mensagens e áudios pré-configurados.</p>
            </div>
          </CardContent>
        </Card>

        {/* Actions Footer */}
        <div className="flex justify-end gap-4 sticky bottom-0 bg-background/80 backdrop-blur-sm p-4 border-t mt-4">
          <Button variant="outline" onClick={handleReset} type="button">
            <RefreshCw className="mr-2 h-4 w-4" />
            Restaurar Padrões
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;
