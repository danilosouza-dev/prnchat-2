import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info';
  children: React.ReactNode;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = '', variant = 'default', children, ...props }, ref) => {
    const variantClasses = {
      default: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
      success: 'bg-[rgba(76,175,80,0.2)] text-[var(--success-color)]',
      error: 'bg-[rgba(244,67,54,0.2)] text-[var(--error-color)]',
      warning: 'bg-[rgba(255,152,0,0.2)] text-[var(--warning-color)]',
      info: 'bg-[rgba(33,150,243,0.2)] text-[var(--info-color)]'
    };

    return (
      <span
        ref={ref}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold uppercase ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export { Badge };
