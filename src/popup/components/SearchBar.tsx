import React, { useEffect, useState } from 'react';
import { Tag } from '@/types';
import { db } from '@/storage/db';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedTags,
  onTagsChange,
}) => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [showTagsDropdown, setShowTagsDropdown] = useState(false);

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    const tagsData = await db.getAllTags();
    setTags(tagsData);
  };

  const toggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      onTagsChange(selectedTags.filter(id => id !== tagId));
    } else {
      onTagsChange([...selectedTags, tagId]);
    }
  };

  const clearFilters = () => {
    onSearchChange('');
    onTagsChange([]);
  };

  return (
    <div className="search-bar">
      <div className="search-input-wrapper">
        <input
          type="text"
          className="search-input"
          placeholder="🔍 Buscar mensagens..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button
            className="clear-search-btn"
            onClick={() => onSearchChange('')}
          >
            ✕
          </button>
        )}
      </div>

      <div className="filter-section">
        <button
          className={`filter-btn ${showTagsDropdown ? 'active' : ''}`}
          onClick={() => setShowTagsDropdown(!showTagsDropdown)}
        >
          🏷️ Tags {selectedTags.length > 0 && `(${selectedTags.length})`}
        </button>

        {(searchQuery || selectedTags.length > 0) && (
          <button className="clear-filters-btn" onClick={clearFilters}>
            Limpar filtros
          </button>
        )}
      </div>

      {showTagsDropdown && (
        <div className="tags-dropdown">
          {tags.length === 0 ? (
            <div className="tags-empty">Nenhuma tag criada</div>
          ) : (
            tags.map(tag => (
              <label key={tag.id} className="tag-checkbox">
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag.id)}
                  onChange={() => toggleTag(tag.id)}
                />
                <span
                  className="tag-label"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
