import React, { useState } from 'react';
import { Folder } from '@/types';
import { db } from '@/storage/db';
import { generateId } from '@/utils/helpers';
import { Select } from '@/components/ui';
import { FolderIcon } from 'lucide-react';

interface FolderManagerProps {
  availableFolders: Folder[];
  selectedFolderId?: string;
  onFolderChange: (folderId?: string) => void;
  onFoldersUpdate: () => void;
}

const PRESET_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6',
  '#6366f1', '#8b5cf6', '#ec4899', '#06b6d4',
];

const FolderManager: React.FC<FolderManagerProps> = ({
  availableFolders,
  selectedFolderId,
  onFolderChange,
  onFoldersUpdate,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState(PRESET_COLORS[0]);

  const handleSelectFolder = (folderId?: string) => {
    onFolderChange(folderId);
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) {
      alert('Digite um nome para a pasta');
      return;
    }

    try {
      const folder: Folder = {
        id: generateId(),
        name: folderName.trim(),
        color: folderColor,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.saveFolder(folder);
      await onFoldersUpdate();

      // Auto-select the new folder
      onFolderChange(folder.id);

      // Reset form
      resetForm();
    } catch (error) {
      console.error('Error creating folder:', error);
      alert('Erro ao criar pasta');
    }
  };


  const resetForm = () => {
    setIsCreating(false);
    setFolderName('');
    setFolderColor(PRESET_COLORS[0]);
  };

  const selectedFolder = availableFolders.find(f => f.id === selectedFolderId);

  return (
    <div className="space-y-3">
      {/* Folder Select Dropdown with Icon Preview */}
      <div className="space-y-2">
        {selectedFolder && (
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <FolderIcon size={16} style={{ color: selectedFolder.color }} />
            <span>Pasta selecionada: {selectedFolder.name}</span>
          </div>
        )}
        <Select
          value={selectedFolderId || ''}
          onChange={(e) => handleSelectFolder(e.target.value || undefined)}
        >
          <option value="">📁 Sem pasta</option>
          {availableFolders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              📁 {folder.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Quick Create Folder Button and Form */}
      {isCreating ? (
        <div className="space-y-3 p-3 border border-[var(--border-color)] rounded-lg bg-[var(--bg-secondary)]">
          <input
            type="text"
            className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--accent-pink)]"
            placeholder="Nome da pasta..."
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            maxLength={30}
          />

          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`w-8 h-8 rounded-md border-2 transition-all ${
                  folderColor === color
                    ? 'border-white scale-110'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: color }}
                onClick={() => setFolderColor(color)}
                title={color}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-sm text-white hover:bg-[var(--bg-secondary)] transition-colors"
              onClick={resetForm}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="flex-1 px-3 py-2 bg-[var(--accent-pink)] rounded-lg text-sm text-white hover:bg-[var(--accent-pink-hover)] transition-colors"
              onClick={handleCreateFolder}
            >
              Criar Pasta
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-sm text-white hover:bg-[var(--bg-secondary)] transition-colors"
          onClick={() => setIsCreating(true)}
        >
          ➕ Nova Pasta
        </button>
      )}
    </div>
  );
};

export default FolderManager;
