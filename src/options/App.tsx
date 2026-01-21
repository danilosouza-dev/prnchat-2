import React, { useState, useEffect } from 'react';
import { MessageSquare, Zap, Target, Settings } from 'lucide-react';
import MessagesTab from './tabs/MessagesTab';
import ScriptsTab from './tabs/ScriptsTab';
import TriggersTab from './tabs/TriggersTab';
import SettingsTab from './tabs/SettingsTab';
import LoginScreen from './LoginScreen';
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

import logo from '../assets/logo.png';

type Tab = 'messages' | 'scripts' | 'triggers' | 'settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('messages');
  const [headerActions, setHeaderActions] = useState<React.ReactNode>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  // Check authentication on mount
  useEffect(() => {
    checkAuth();

    // Listen for auth changes
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.auth_session) {
        const session = changes.auth_session.newValue;
        setIsAuthenticated(session?.isAuthenticated === true);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const checkAuth = async () => {
    try {
      const result = await chrome.storage.sync.get(['auth_session']);
      setIsAuthenticated(result.auth_session?.isAuthenticated === true);
    } catch (error) {
      console.error('[Options] Error checking auth:', error);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#E74C7A]"></div>
          <p className="mt-4 text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <>
      <Toaster />
      <SidebarProvider defaultOpen={true}>
        <Sidebar>
          <SidebarHeader className="border-b border-[var(--border-color)] px-6 pt-[15px] pb-[12px]">
            <img src={logo} alt="PrinChat" className="w-[140px] h-auto" />
          </SidebarHeader>

          <SidebarContent className="px-3 pt-[2rem] pb-4">
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
