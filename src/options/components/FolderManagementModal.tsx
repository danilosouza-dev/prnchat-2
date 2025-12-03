import React, { useState, useEffect } from 'react';
import { Folder } from '@/types';
import { db } from '@/storage/db';
import { generateId } from '@/utils/helpers';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui';
import { Folder as FolderIcon, Plus, Edit2, Trash2, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

interface FolderManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: Folder[];
  onFoldersUpdate: () => void;
}

const PRESET_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6',
  '#6366f1', '#8b5cf6', '#ec4899', '#06b6d4',
];

const FolderManagementModal: React.FC<FolderManagementModalProps> = ({
  open,
  onOpenChange,
  folders,
  onFoldersUpdate,
}) => {
  const [localFolders, setLocalFolders] = useState<Folder[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState(PRESET_COLORS[0]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [messageCounts, setMessageCounts] = useState<Map<string, number>>(new Map());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLocalFolders([...folders]);
      loadMessageCounts();
    }
  }, [open, folders]);

  const loadMessageCounts = async () => {
    const messages = await db.getAllMessages();
    const counts = new Map<string, number>();
    folders.forEach(folder => {
      counts.set(folder.id, messages.filter(m => m.folderId === folder.id).length);
    });
    setMessageCounts(counts);
  };

  const moveFolder = (index: number, direction: 'up' | 'down') => {
    const newFolders = [...localFolders];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newFolders.length) return;

    [newFolders[index], newFolders[targetIndex]] = [newFolders[targetIndex], newFolders[index]];
    setLocalFolders(newFolders);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const draggedIndex = localFolders.findIndex(f => f.id === draggedId);
    const targetIndex = localFolders.findIndex(f => f.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newFolders = [...localFolders];
    const [removed] = newFolders.splice(draggedIndex, 1);
    newFolders.splice(targetIndex, 0, removed);

    setLocalFolders(newFolders);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  const handleSave = async () => {
    try {
      // Save all folders with their new order
      const updatedFolders = localFolders.map((folder, index) => ({
        ...folder,
        order: index,
        updatedAt: Date.now(),
      }));

      await Promise.all(updatedFolders.map(folder => db.saveFolder(folder)));
      await onFoldersUpdate();
      onOpenChange(false);
      toast.success('Pastas atualizadas com sucesso!');
    } catch (error) {
      console.error('Error saving folders:', error);
      toast.error('Erro ao salvar pastas');
    }
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) {
      toast.error('Digite um nome para a pasta');
      return;
    }

    try {
      const folder: Folder = {
        id: generateId(),
        name: folderName.trim(),
        color: folderColor,
        order: localFolders.length,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.saveFolder(folder);
      await onFoldersUpdate();

      setLocalFolders([...localFolders, folder]);
      // Add new folder to message counts with 0 messages
      setMessageCounts(new Map(messageCounts.set(folder.id, 0)));
      setCreateModalOpen(false);
      setFolderName('');
      setFolderColor(PRESET_COLORS[0]);

      toast.success('Pasta criada com sucesso!');
    } catch (error) {
      console.error('Error creating folder:', error);
      toast.error('Erro ao criar pasta');
    }
  };

  const handleEditFolder = async () => {
    if (!editingFolder || !folderName.trim()) {
      toast.error('Digite um nome para a pasta');
      return;
    }

    try {
      const updatedFolder: Folder = {
        ...editingFolder,
        name: folderName.trim(),
        color: folderColor,
        updatedAt: Date.now(),
      };

      await db.saveFolder(updatedFolder);
      await onFoldersUpdate();

      setLocalFolders(localFolders.map(f => f.id === editingFolder.id ? updatedFolder : f));
      setEditingFolder(null);
      setFolderName('');
      setFolderColor(PRESET_COLORS[0]);

      toast.success('Pasta atualizada com sucesso!');
    } catch (error) {
      console.error('Error updating folder:', error);
      toast.error('Erro ao atualizar pasta');
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await db.deleteFolder(folderId);
      await onFoldersUpdate();

      setLocalFolders(localFolders.filter(f => f.id !== folderId));
      toast.success('Pasta excluída com sucesso!');
    } catch (error) {
      console.error('Error deleting folder:', error);
      toast.error('Erro ao excluir pasta');
    }
  };

  const openEditModal = (folder: Folder) => {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderColor(folder.color);
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    setEditingFolder(null);
    setFolderName('');
    setFolderColor(PRESET_COLORS[0]);
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete) return;

    try {
      await handleDeleteFolder(folderToDelete);
      setDeleteDialogOpen(false);
      setFolderToDelete(null);
    } catch (error) {
      console.error('Error in confirmDeleteFolder:', error);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl">Gerenciar pastas</DialogTitle>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Reorganize, edite nomes e cores das suas pastas
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {/* Create Button */}
            <div className="mb-4">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => setCreateModalOpen(true)}
              >
                <Plus size={16} className="mr-2" />
                Criar nova pasta
              </Button>
            </div>

            {/* Folders List */}
            {localFolders.length > 0 ? (
              <div>
                <h4 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Pastas</h4>
                <div className="space-y-2">
                  {localFolders.map((folder, index) => (
                    <div
                      key={folder.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, folder.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, folder.id)}
                      onDragEnd={handleDragEnd}
                      className={`
                        flex items-center gap-3 p-3 rounded-lg border
                        bg-[var(--card-bg)] border-[var(--border-color)]
                        transition-all cursor-move
                        ${draggedId === folder.id ? 'opacity-50' : ''}
                        hover:bg-[var(--bg-tertiary)]
                      `}
                    >
                      <GripVertical size={18} className="text-[var(--text-muted)] flex-shrink-0" />
                      <FolderIcon size={20} color={folder.color} className="flex-shrink-0" />
                      <span className="flex-1 font-medium">{folder.name}</span>
                      <span className="text-sm text-[var(--text-muted)]">
                        {messageCounts.get(folder.id) || 0} msgs
                      </span>

                      {/* Action Buttons */}
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveFolder(index, 'up')}
                          disabled={index === 0}
                          className="h-8 w-8"
                        >
                          <ChevronUp size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveFolder(index, 'down')}
                          disabled={index === localFolders.length - 1}
                          className="h-8 w-8"
                        >
                          <ChevronDown size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditModal(folder)}
                          className="h-8 w-8"
                        >
                          <Edit2 size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setFolderToDelete(folder.id);
                            setDeleteDialogOpen(true);
                          }}
                          className="h-8 w-8 hover:text-red-500"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-[var(--text-secondary)]">
                <FolderIcon size={48} className="mx-auto mb-3 opacity-50" />
                <p>Nenhuma pasta criada</p>
                <p className="text-sm mt-1">Clique em "Criar nova pasta" para começar</p>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="accent" onClick={handleSave}>
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Folder Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingFolder ? 'Editar pasta' : 'Criar nova pasta'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="folder-name">Nome da pasta</Label>
              <Input
                id="folder-name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Digite o nome da pasta"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Cor da pasta</Label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setFolderColor(color)}
                    className={`w-10 h-10 rounded-md border-2 transition-all ${
                      folderColor === color
                        ? 'border-white scale-110'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="secondary" onClick={closeCreateModal}>
              Cancelar
            </Button>
            <Button variant="accent" onClick={editingFolder ? handleEditFolder : handleCreateFolder}>
              {editingFolder ? 'Salvar alterações' : 'Criar pasta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog para confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Pasta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta pasta? As mensagens dentro dela ficarão sem pasta. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary">Cancelar</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="danger" onClick={confirmDeleteFolder}>
                Excluir
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default FolderManagementModal;
