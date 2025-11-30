import React, { useState } from 'react';
import MessagesTab from './tabs/MessagesTab';
import ScriptsTab from './tabs/ScriptsTab';
import TriggersTab from './tabs/TriggersTab';
import SettingsTab from './tabs/SettingsTab';
import { MessageSquare, FileCode, Crosshair, Settings, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

type Tab = 'messages' | 'scripts' | 'triggers' | 'settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('messages');

  const navItems = [
    {
      id: 'messages',
      label: 'Mensagens',
      icon: MessageSquare,
      component: MessagesTab
    },
    {
      id: 'scripts',
      label: 'Scripts',
      icon: FileCode,
      component: ScriptsTab
    },
    {
      id: 'triggers',
      label: 'Gatilhos',
      icon: Crosshair,
      component: TriggersTab
    },
    {
      id: 'settings',
      label: 'Configurações',
      icon: Settings,
      component: SettingsTab
    }
  ];

  return (
    <div className="flex h-screen w-full bg-background">
      {/* Sidebar */}
      <aside className="w-64 flex-col border-r bg-zinc-950 text-white hidden md:flex">
        <div className="p-6">
          <div className="flex items-center gap-2 font-bold text-xl text-primary">
            <span className="text-2xl">⚡</span> X1Flox
          </div>
          <p className="text-xs text-zinc-400 mt-1">Automação para WhatsApp</p>
        </div>

        <Separator className="bg-zinc-800" />

        <ScrollArea className="flex-1 py-4">
          <nav className="grid gap-1 px-2">
            {navItems.map((item) => (
              <Button
                key={item.id}
                variant={activeTab === item.id ? "secondary" : "ghost"}
                className={cn(
                  "justify-start gap-3",
                  activeTab === item.id
                    ? "bg-primary/20 text-primary hover:bg-primary/30"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                )}
                onClick={() => setActiveTab(item.id as Tab)}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            ))}
          </nav>
        </ScrollArea>

        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>v1.0.0</span>
            <span>•</span>
            <span>X1Flox</span>
          </div>
        </div>
      </aside>

      {/* Mobile Header (visible only on small screens) */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-zinc-950 border-b border-zinc-800 flex items-center px-4 z-50">
        <span className="text-xl mr-2">⚡</span>
        <span className="font-bold text-white">X1Flox</span>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto md:p-0 pt-16 bg-slate-50/50 dark:bg-zinc-900/50">
        <div className="h-full">
          {activeTab === 'messages' && <MessagesTab />}
          {activeTab === 'scripts' && <ScriptsTab />}
          {activeTab === 'triggers' && <TriggersTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  );
};

export default App;
