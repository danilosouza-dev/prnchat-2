import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'accent' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  children: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'md', isLoading = false, children, disabled, ...props }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center gap-2 font-semibold uppercase tracking-wide transition-all rounded-lg border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

    const variantClasses = {
      default: 'bg-[#d0d4db] text-[#1a1f2e] hover:bg-[#e0e4eb] hover:-translate-y-px hover:shadow-md',
      secondary: 'bg-transparent text-white border border-[var(--border-color)] hover:bg-[var(--bg-hover)] hover:border-[var(--text-secondary)]',
      accent: 'bg-gradient-to-r from-[#e91e63] to-[#f06292] text-white hover:opacity-90 hover:-translate-y-px hover:shadow-md',
      danger: 'bg-[#f44336] text-white hover:bg-[#d32f2f] hover:-translate-y-px hover:shadow-md',
      ghost: 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-white'
    };

    const sizeClasses = {
      sm: 'px-3 py-1.5 text-[11px]',
      md: 'px-5 py-2.5 text-[13px]',
      lg: 'px-7 py-3.5 text-[14px]',
      icon: 'p-2'
    };

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="animate-spin" size={16} />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
