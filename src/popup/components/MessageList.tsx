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

          {message.tags.length > 0 && (
            <div className="message-tags">
              {message.tags.map(tagId => {
                const tag = tags[tagId];
                return tag ? (
                  <span
                    key={tagId}
                    className="tag"
                    style={{ backgroundColor: tag.color }}
                  >
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
