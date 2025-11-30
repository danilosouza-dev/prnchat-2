import React, { useState } from 'react';
import MessagesTab from './tabs/MessagesTab';
import ScriptsTab from './tabs/ScriptsTab';
import TriggersTab from './tabs/TriggersTab';
import SettingsTab from './tabs/SettingsTab';

type Tab = 'messages' | 'scripts' | 'triggers' | 'settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('messages');

  return (
    <div className="options-container">
      <header className="options-header">
        <div className="header-content">
          <h1 className="logo">X1Flox</h1>
          <p className="subtitle">Configurações e Gerenciamento</p>
        </div>
      </header>

      <nav className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'messages' ? 'active' : ''}`}
          onClick={() => setActiveTab('messages')}
        >
          💬 Mensagens
        </button>
        <button
          className={`tab-btn ${activeTab === 'scripts' ? 'active' : ''}`}
          onClick={() => setActiveTab('scripts')}
        >
          ⚡ Scripts
        </button>
        <button
          className={`tab-btn ${activeTab === 'triggers' ? 'active' : ''}`}
          onClick={() => setActiveTab('triggers')}
        >
          🎯 Gatilhos
        </button>
        <button
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ Configurações
        </button>
      </nav>

      <main className="options-content">
        {activeTab === 'messages' && <MessagesTab />}
        {activeTab === 'scripts' && <ScriptsTab />}
        {activeTab === 'triggers' && <TriggersTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </main>
    </div>
  );
};

export default App;
