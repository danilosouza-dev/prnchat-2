import React, { useState } from 'react';
import { MessageSquare, Zap, Target, Settings } from 'lucide-react';
import MessagesTab from './tabs/MessagesTab';
import ScriptsTab from './tabs/ScriptsTab';
import TriggersTab from './tabs/TriggersTab';
import SettingsTab from './tabs/SettingsTab';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '../components/ui/sidebar';
import { Toaster } from '../components/ui/sonner';

type Tab = 'messages' | 'scripts' | 'triggers' | 'settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('messages');
  const [headerActions, setHeaderActions] = useState<React.ReactNode>(null);

  return (
    <>
      <Toaster />
      <SidebarProvider defaultOpen={true}>
      <Sidebar>
        <SidebarHeader className="border-b border-[var(--border-color)] px-6 py-6">
          <h1 className="text-2xl font-bold text-[var(--primary-color)]">X1Flox</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Configurações e Gerenciamento</p>
        </SidebarHeader>

        <SidebarContent className="px-3 py-4">
          <SidebarGroup>
            <SidebarMenu className="gap-2">
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'messages'}
                  onClick={() => setActiveTab('messages')}
                  className="gap-3 px-4 py-3 h-auto"
                >
                  <MessageSquare className="h-5 w-5" />
                  <span className="text-sm font-medium">Mensagens</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'scripts'}
                  onClick={() => setActiveTab('scripts')}
                  className="gap-3 px-4 py-3 h-auto"
                >
                  <Zap className="h-5 w-5" />
                  <span className="text-sm font-medium">Scripts</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'triggers'}
                  onClick={() => setActiveTab('triggers')}
                  className="gap-3 px-4 py-3 h-auto"
                >
                  <Target className="h-5 w-5" />
                  <span className="text-sm font-medium">Gatilhos</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'settings'}
                  onClick={() => setActiveTab('settings')}
                  className="gap-3 px-4 py-3 h-auto"
                >
                  <Settings className="h-5 w-5" />
                  <span className="text-sm font-medium">Configurações</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-[var(--border-color)] p-4 mt-auto">
          <p className="text-xs text-[var(--text-tertiary)]">v1.0.0</p>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-16 items-center gap-4 border-b border-[var(--border-color)] px-6 bg-[var(--card-bg)]">
          <SidebarTrigger />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {activeTab === 'messages' && 'Mensagens'}
            {activeTab === 'scripts' && 'Scripts'}
            {activeTab === 'triggers' && 'Gatilhos'}
            {activeTab === 'settings' && 'Configurações'}
          </h2>
          <div className="ml-auto flex gap-2">
            {headerActions}
          </div>
        </header>
        <main className="options-content">
          {activeTab === 'messages' && <MessagesTab setHeaderActions={setHeaderActions} />}
          {activeTab === 'scripts' && <ScriptsTab setHeaderActions={setHeaderActions} />}
          {activeTab === 'triggers' && <TriggersTab setHeaderActions={setHeaderActions} />}
          {activeTab === 'settings' && <SettingsTab setHeaderActions={setHeaderActions} />}
        </main>
      </SidebarInset>
    </SidebarProvider>
    </>
  );
};

export default App;
