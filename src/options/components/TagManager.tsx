import React, { useState } from 'react';
import { Tag } from '@/types';
import { db } from '@/storage/db';
import { generateId } from '@/utils/helpers';
import { Checkbox } from '@/components/ui/checkbox';
import { X } from 'lucide-react';

interface TagManagerProps {
  availableTags: Tag[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  onTagsUpdate: () => void;
}

const PRESET_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6',
  '#6366f1', '#8b5cf6', '#ec4899', '#06b6d4',
];

const TagIcon = ({ color, size = 14 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
    <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>
  </svg>
);

const TagManager: React.FC<TagManagerProps> = ({
  availableTags,
  selectedTags,
  onTagsChange,
  onTagsUpdate,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);

  const toggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      onTagsChange(selectedTags.filter((id) => id !== tagId));
    } else {
      onTagsChange([...selectedTags, tagId]);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      alert('Digite um nome para a tag');
      return;
    }

    try {
      const tag: Tag = {
        id: generateId(),
        name: newTagName.trim(),
        color: newTagColor,
      };

      await db.saveTag(tag);
      await onTagsUpdate();

      // Auto-select the new tag
      onTagsChange([...selectedTags, tag.id]);

      // Reset form
      setNewTagName('');
      setNewTagColor(PRESET_COLORS[0]);
      setIsCreating(false);
    } catch (error) {
      console.error('Error creating tag:', error);
      alert('Erro ao criar tag');
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (confirm('Tem certeza que deseja excluir esta tag?')) {
      try {
        await db.deleteTag(tagId);
        await onTagsUpdate();

        // Remove from selected if present
        if (selectedTags.includes(tagId)) {
          onTagsChange(selectedTags.filter((id) => id !== tagId));
        }
      } catch (error) {
        console.error('Error deleting tag:', error);
        alert('Erro ao excluir tag');
      }
    }
  };

  return (
    <div className="tag-manager">
      <div className="tags-selection">
        {availableTags.map((tag) => (
          <div key={tag.id} className="tag-item">
            <label className="tag-checkbox-label">
              <Checkbox
                checked={selectedTags.includes(tag.id)}
                onCheckedChange={() => toggleTag(tag.id)}
              />
              <span className="tag-display">
                <TagIcon color={tag.color} size={14} />
                {tag.name}
              </span>
            </label>
            <button
              type="button"
              className="tag-delete-btn"
              onClick={() => handleDeleteTag(tag.id)}
              title="Excluir tag"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {availableTags.length === 0 && !isCreating && (
          <div className="empty-state-sm">Nenhuma tag criada</div>
        )}
      </div>

      {isCreating ? (
        <div className="tag-creation-form">
          <input
            type="text"
            className="tag-name-input"
            placeholder="Nome da tag..."
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            maxLength={20}
          />

          <div className="color-picker">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`color-option ${newTagColor === color ? 'selected' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setNewTagColor(color)}
                title={color}
              />
            ))}
          </div>

          <div className="tag-form-actions">
            <button
              type="button"
              className="btn-secondary-sm"
              onClick={() => {
                setIsCreating(false);
                setNewTagName('');
                setNewTagColor(PRESET_COLORS[0]);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary-sm"
              onClick={handleCreateTag}
            >
              Criar Tag
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn-create-tag"
          onClick={() => setIsCreating(true)}
        >
          ➕ Nova Tag
        </button>
      )}
    </div>
  );
};

export default TagManager;
