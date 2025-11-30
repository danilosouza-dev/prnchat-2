import React, { createContext, useContext, useState, useCallback } from 'react';
import { LucideIcon } from 'lucide-react';

/* ========== SIDEBAR CONTEXT ========== */
interface SidebarContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  isMobile: boolean;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};

/* ========== SIDEBAR PROVIDER ========== */
export interface SidebarProviderProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const SidebarProvider: React.FC<SidebarProviderProps> = ({
  children,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
}) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [isMobile] = useState(false); // Could be enhanced with window size detection

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const setOpen = useCallback((newOpen: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  }, [controlledOpen, onOpenChange]);

  const toggleSidebar = useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  return (
    <SidebarContext.Provider value={{ open, setOpen, toggleSidebar, isMobile }}>
      {children}
    </SidebarContext.Provider>
  );
};

/* ========== SIDEBAR ========== */
export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  side?: 'left' | 'right';
  variant?: 'sidebar' | 'floating' | 'inset';
  collapsible?: 'offcanvas' | 'icon' | 'none';
}

export const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  ({ className = '', children, side = 'left', variant = 'sidebar', collapsible = 'none', ...props }, ref) => {
    const baseClasses = 'w-[260px] bg-[var(--bg-secondary)] border-r border-[var(--border-color)] flex flex-col fixed top-0 h-screen overflow-y-auto';

    const sideClasses = side === 'left' ? 'left-0' : 'right-0';

    return (
      <aside
        ref={ref}
        className={`${baseClasses} ${sideClasses} ${className}`}
        {...props}
      >
        {children}
      </aside>
    );
  }
);

Sidebar.displayName = 'Sidebar';

/* ========== SIDEBAR HEADER ========== */
export interface SidebarHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const SidebarHeader = React.forwardRef<HTMLDivElement, SidebarHeaderProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`p-8 border-b border-[var(--border-color)] ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

SidebarHeader.displayName = 'SidebarHeader';

/* ========== SIDEBAR CONTENT ========== */
export interface SidebarContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const SidebarContent = React.forwardRef<HTMLDivElement, SidebarContentProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`flex-1 p-4 flex flex-col gap-1 ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

SidebarContent.displayName = 'SidebarContent';

/* ========== SIDEBAR FOOTER ========== */
export interface SidebarFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const SidebarFooter = React.forwardRef<HTMLDivElement, SidebarFooterProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`p-4 border-t border-[var(--border-color)] ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

SidebarFooter.displayName = 'SidebarFooter';

/* ========== SIDEBAR GROUP ========== */
export interface SidebarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const SidebarGroup = React.forwardRef<HTMLDivElement, SidebarGroupProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`flex flex-col gap-1 ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

SidebarGroup.displayName = 'SidebarGroup';

/* ========== SIDEBAR GROUP LABEL ========== */
export interface SidebarGroupLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const SidebarGroupLabel = React.forwardRef<HTMLDivElement, SidebarGroupLabelProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`px-4 py-2 text-xs font-bold tracking-wider uppercase text-[var(--text-tertiary)] ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

SidebarGroupLabel.displayName = 'SidebarGroupLabel';

/* ========== SIDEBAR MENU ========== */
export interface SidebarMenuProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const SidebarMenu = React.forwardRef<HTMLDivElement, SidebarMenuProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`flex flex-col gap-1 ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

SidebarMenu.displayName = 'SidebarMenu';

/* ========== SIDEBAR MENU ITEM ========== */
export interface SidebarMenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const SidebarMenuItem = React.forwardRef<HTMLDivElement, SidebarMenuItemProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`relative ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

SidebarMenuItem.displayName = 'SidebarMenuItem';

/* ========== SIDEBAR MENU BUTTON ========== */
export interface SidebarMenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  isActive?: boolean;
  icon?: LucideIcon;
  badge?: string;
}

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ className = '', children, isActive = false, icon: Icon, badge, ...props }, ref) => {
    const baseClasses = 'flex items-center gap-3 px-4 py-3 w-full bg-transparent border-none rounded-lg cursor-pointer text-sm font-medium text-[var(--text-secondary)] transition-all duration-150 ease-in-out text-left';

    const activeClasses = isActive
      ? 'bg-gradient-to-r from-[#e91e63] to-[#f06292] text-white shadow-md'
      : 'hover:bg-[var(--bg-tertiary)] hover:text-white hover:translate-x-0.5';

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${activeClasses} ${className}`}
        {...props}
      >
        {Icon && (
          <Icon
            className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-[var(--text-secondary)]'}`}
            size={20}
          />
        )}
        <span className="flex-1 font-medium tracking-wide">{children}</span>
        {badge && (
          <span className="px-2 py-0.5 bg-white/20 rounded text-[9px] font-bold tracking-wider uppercase">
            {badge}
          </span>
        )}
      </button>
    );
  }
);

SidebarMenuButton.displayName = 'SidebarMenuButton';

/* ========== SIDEBAR SEPARATOR ========== */
export interface SidebarSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {}

export const SidebarSeparator = React.forwardRef<HTMLDivElement, SidebarSeparatorProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`h-px bg-[var(--divider-color)] my-2 ${className}`}
        {...props}
      />
    );
  }
);

SidebarSeparator.displayName = 'SidebarSeparator';

/* ========== SIDEBAR INSET (Main Content Wrapper) ========== */
export interface SidebarInsetProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export const SidebarInset = React.forwardRef<HTMLElement, SidebarInsetProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <main
        ref={ref}
        className={`flex-1 ml-[260px] min-h-screen flex flex-col ${className}`}
        {...props}
      >
        {children}
      </main>
    );
  }
);

SidebarInset.displayName = 'SidebarInset';
