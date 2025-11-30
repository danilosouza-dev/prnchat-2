import React from 'react';
import { Script } from '@/types';
import { formatDuration } from '@/utils/helpers';

interface ScriptSelectorProps {
  scripts: Script[];
  selectedScript: string | null;
  onSelectScript: (scriptId: string | null) => void;
  onExecuteScript: (scriptId: string) => void;
  isExecuting: boolean;
  disabled: boolean;
}

const ScriptSelector: React.FC<ScriptSelectorProps> = ({
  scripts,
  selectedScript,
  onSelectScript,
  onExecuteScript,
  isExecuting,
  disabled,
}) => {
  if (scripts.length === 0) {
    return null;
  }

  const handleExecute = () => {
    if (selectedScript) {
      onExecuteScript(selectedScript);
    }
  };

  const selectedScriptData = scripts.find(s => s.id === selectedScript);

  return (
    <div className="script-selector">
      <label className="script-label">⚡ Script Rápido</label>
      <div className="script-controls">
        <select
          className="script-select"
          value={selectedScript || ''}
          onChange={(e) => onSelectScript(e.target.value || null)}
          disabled={disabled || isExecuting}
        >
          <option value="">Selecione um script...</option>
          {scripts.map(script => (
            <option key={script.id} value={script.id}>
              {script.name} ({script.steps.length} msgs, {formatDuration(script.totalDuration)})
            </option>
          ))}
        </select>

        <button
          className="btn-execute-script"
          onClick={handleExecute}
          disabled={!selectedScript || disabled || isExecuting}
        >
          {isExecuting ? '⏳' : '▶️'}
        </button>
      </div>

      {selectedScriptData && (
        <div className="script-info">
          <p className="script-description">
            {selectedScriptData.description || 'Sem descrição'}
          </p>
          <div className="script-stats">
            <span>📊 {selectedScriptData.steps.length} mensagens</span>
            <span>⏱️ {formatDuration(selectedScriptData.totalDuration)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScriptSelector;
