/**
 * Kanban System Type Definitions
 * Lead management and organization system
 */

/**
 * Kanban Column
 * Represents a column in the Kanban board
 */
export interface KanbanColumn {
    id: string;              // Unique identifier
    name: string;            // Display name (e.g., "Recentes", "Em Andamento")
    color: string;           // Column header color (hex)
    description?: string;    // Optional column description
    order: number;           // Display order (0-based)
    isDefault: boolean;      // true for "Recentes" column
    canDelete: boolean;      // false for "Recentes" column
    canEdit: boolean;        // false for "Recentes" column
    createdAt: number;       // Timestamp
    updatedAt: number;       // Timestamp
}

/**
 * Lead Contact
 * Represents a contact/lead in the Kanban system
 */
export interface LeadContact {
    id: string;              // WhatsApp Chat ID
    name: string;            // Contact name
    phone: string;           // Phone number
    photo?: string;          // Profile photo URL (base64 or blob URL)
    columnId: string;        // ID of the column this lead is in
    order: number;           // Order within the column (for drag-drop)
    lastMessage?: string;    // Last message preview
    lastMessageTime?: number; // Timestamp of last message
    notes?: string;          // User notes about this lead
    tags?: string[];         // Tags for categorization
    createdAt: number;       // When added to Kanban
    updatedAt: number;       // Last modification
}

/**
 * Default Kanban Columns
 */
export const DEFAULT_KANBAN_COLUMNS: Omit<KanbanColumn, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
        name: 'Recentes',
        color: '#4caf50',      // Green (same as INBOX tag)
        description: 'Novos leads que chegaram recentemente e aguardam primeira interação',
        order: 0,
        isDefault: true,
        canDelete: false,
        canEdit: false,
    },
    {
        name: 'Em Andamento',
        color: '#ff9800',      // Orange
        description: 'Leads em processo ativo de negociação ou atendimento',
        order: 1,
        isDefault: false,
        canDelete: true,
        canEdit: true,
    },
    {
        name: 'Pendentes',
        color: '#9c27b0',      // Purple
        description: 'Leads aguardando resposta ou ação futura',
        order: 2,
        isDefault: false,
        canDelete: true,
        canEdit: true,
    },
    {
        name: 'Concluídas',
        color: '#4caf50',      // Green
        description: 'Negociações finalizadas com sucesso',
        order: 3,
        isDefault: false,
        canDelete: true,
        canEdit: true,
    },
];
