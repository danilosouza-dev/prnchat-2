import React, { useEffect, useState } from 'react';
import { Message, Tag } from '@/types';
import { db } from '@/storage/db';
import { formatDate } from '@/utils/helpers';

interface MessageListProps {
  messages: Message[];
  onSendMessage: (message: Message) => void;
  isExecuting: boolean;
  disabled: boolean;
}

const TagIcon = ({ color, size = 14 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
    <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>
  </svg>
);

const MessageList: React.FC<MessageListProps> = ({
  messages,
  onSendMessage,
  isExecuting,
  disabled,
}) => {
  const [tags, setTags] = useState<Record<string, Tag>>({});

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    const tagsData = await db.getAllTags();
    const tagsMap = tagsData.reduce((acc, tag) => {
      acc[tag.id] = tag;
      return acc;
    }, {} as Record<string, Tag>);
    setTags(tagsMap);
  };

  return (
    <div className="message-list">
      {messages.map((message) => (
        <div key={message.id} className="message-card">
          <div className="message-header">
            <span className={`message-type-badge ${message.type}`}>
              {message.type === 'text' ? '💬 Texto' : '🎤 Áudio'}
            </span>
            {message.duration && (
              <span className="message-duration">
                {Math.floor(message.duration)}s
              </span>
            )}
          </div>

          <div className="message-content">
            {message.type === 'text' ? (
              <p className="message-text">{message.content}</p>
            ) : (
              <div className="audio-preview">
                <span className="audio-icon">🎤</span>
                <span className="audio-name">{message.content}</span>
              </div>
            )}
          </div>

          {message.tags && message.tags.length > 0 && (
            <div className="message-tags">
              {message.tags.map(tagId => {
                const tag = tags[tagId];
                return tag ? (
                  <span
                    key={tagId}
                    className="tag"
                  >
                    <TagIcon color={tag.color} size={14} />
                    {tag.name}
                  </span>
                ) : null;
              })}
            </div>
          )}

          <div className="message-footer">
            <span className="message-date">{formatDate(message.createdAt)}</span>
            <button
              className="btn-send"
              onClick={() => onSendMessage(message)}
              disabled={disabled || isExecuting}
            >
              {isExecuting ? '⏳ Enviando...' : '📤 Enviar'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MessageList;
