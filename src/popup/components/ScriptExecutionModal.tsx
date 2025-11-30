import React, { useEffect, useState } from 'react';
import { ScriptExecutionState } from '@/types';

interface ScriptExecutionModalProps {
  executionState: ScriptExecutionState | null;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onCancelAll: () => void;
}

const ScriptExecutionModal: React.FC<ScriptExecutionModalProps> = ({
  executionState,
  onPause,
  onResume,
  onCancel,
  onCancelAll,
}) => {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (!executionState || !executionState.isRunning || executionState.isPaused) {
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - executionState.startTime) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [executionState]);

  if (!executionState) {
    return null;
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = executionState.totalMessages > 0
    ? (executionState.sentMessages / executionState.totalMessages) * 100
    : 0;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>{executionState.scriptName}</h3>
          <button className="btn-close" onClick={onCancel} title="Fechar">
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Progress Bar */}
          <div className="progress-container">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="progress-text">
              {executionState.sentMessages}/{executionState.totalMessages} mensagens
            </div>
          </div>

          {/* Time Counter */}
          <div className="time-counter">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" strokeWidth="2"/>
              <polyline points="12 6 12 12 16 14" strokeWidth="2"/>
            </svg>
            <span>{formatTime(elapsedTime)}</span>
          </div>

          {/* Status */}
          <div className="status-indicator">
            {executionState.isPaused ? (
              <span className="status-paused">⏸ Pausado</span>
            ) : (
              <span className="status-running">▶ Executando...</span>
            )}
          </div>
        </div>

        <div className="modal-footer">
          {/* Pause/Resume Button */}
          {executionState.isPaused ? (
            <button className="btn-control btn-play" onClick={onResume}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Retomar
            </button>
          ) : (
            <button className="btn-control btn-pause" onClick={onPause}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"/>
                <rect x="14" y="4" width="4" height="16"/>
              </svg>
              Pausar
            </button>
          )}

          {/* Cancel Button */}
          <button className="btn-control btn-cancel" onClick={onCancel}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18" strokeWidth="2"/>
              <line x1="6" y1="6" x2="18" y2="18" strokeWidth="2"/>
            </svg>
            Cancelar
          </button>

          {/* Cancel All Button */}
          <button className="btn-control btn-cancel-all" onClick={onCancelAll}>
            Cancelar Todos
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScriptExecutionModal;
