import React, { useState, useEffect } from 'react';
import { X, Eye, Pencil, Trash2, FileText } from 'lucide-react';
import { Note } from '@/types';
import { db } from '@/storage/db';

interface GlobalNotesPopupProps {
    onClose: () => void;
    onViewNote: (note: Note) => void;
    onEditNote: (note: Note) => void;
    onDeleteNote: (note: Note) => void;
}

const GlobalNotesPopup: React.FC<GlobalNotesPopupProps> = ({
    onClose,
    onViewNote,
    onEditNote,
    onDeleteNote,
}) => {
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);

    const loadNotes = async () => {
        try {
            const allNotes = await db.getAllNotes();
            setNotes(allNotes);
        } catch (error) {
            console.error('[GlobalNotesPopup] Error loading notes:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadNotes();

        // Listen for notes changes for real-time updates
        const handleStorageChange = (changes: any, areaName: string) => {
            if (areaName === 'local' && changes.notes) {
                console.log('[GlobalNotesPopup] Notes changed, reloading...');
                loadNotes();
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => {
            chrome.storage.onChanged.removeListener(handleStorageChange);
        };
    }, []);

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return `Hoje às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        } else if (diffDays === 1) {
            return 'Ontem';
        } else if (diffDays < 7) {
            return `${diffDays} dias atrás`;
        } else {
            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
    };

    const getTextPreview = (html: string, maxLength: number = 100): string => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const text = tempDiv.textContent || tempDiv.innerText || '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    return (
        <div className="global-notes-popup-backdrop" onClick={onClose}>
            <div className="global-notes-popup" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="global-notes-header">
                    <div className="global-notes-title">
                        <FileText size={20} />
                        <span>Todas as Notas</span>
                    </div>
                    <button className="global-notes-close-btn" onClick={onClose} title="Fechar">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="global-notes-content">
                    {loading ? (
                        <div className="global-notes-loading">Carregando...</div>
                    ) : notes.length === 0 ? (
                        <div className="global-notes-empty">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" />
                                <path d="M2 6h4" />
                                <path d="M2 10h4" />
                                <path d="M2 14h4" />
                                <path d="M2 18h4" />
                                <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />
                            </svg>
                            <p>Nenhuma nota criada</p>
                            <span>Notas criadas nos chats aparecerão aqui</span>
                        </div>
                    ) : (
                        <div className="global-notes-grid">
                            {notes.map((note) => (
                                <div key={note.id} className="global-note-card">
                                    {/* Header with contact info */}
                                    <div className="global-note-card-header">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="global-note-icon">
                                            <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" />
                                            <path d="M2 6h4" />
                                            <path d="M2 10h4" />
                                            <path d="M2 14h4" />
                                            <path d="M2 18h4" />
                                            <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />
                                        </svg>
                                        <div className="global-note-info">
                                            <span className="global-note-contact">{note.chatName}</span>
                                            <span className="global-note-title">{note.title}</span>
                                        </div>
                                    </div>

                                    {/* Content preview */}
                                    <div className="global-note-preview">
                                        {getTextPreview(note.content)}
                                    </div>

                                    {/* Actions */}
                                    <div className="global-note-actions">
                                        <button
                                            className="global-note-action-btn"
                                            onClick={() => onViewNote(note)}
                                            title="Visualizar"
                                        >
                                            <Eye size={16} />
                                        </button>
                                        <button
                                            className="global-note-action-btn"
                                            onClick={() => onEditNote(note)}
                                            title="Editar"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            className="global-note-action-btn global-note-delete-btn"
                                            onClick={() => onDeleteNote(note)}
                                            title="Excluir"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    {/* Footer with date */}
                                    <div className="global-note-footer">
                                        <span className="global-note-date">{formatDate(note.createdAt)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GlobalNotesPopup;
