import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'accent' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  children?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'md', isLoading = false, children, disabled, ...props }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center gap-2 font-semibold uppercase tracking-wide transition-all duration-200 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

    const variantClasses = {
      default: 'bg-[#d0d4db] text-[#1a1f2e] hover:bg-[#c0c4cb] border-none',
      secondary: 'bg-transparent text-white border border-[var(--border-color)] hover:bg-[var(--bg-hover)] hover:border-[var(--accent-pink)]',
      accent: 'bg-[#e91e63] text-white hover:bg-[#c2185b] border-none',
      danger: 'bg-[#f44336] text-white hover:bg-[#c62828] border-none',
      ghost: 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-white border-none'
    };

    const sizeClasses = {
      sm: 'px-3 py-2 text-[11px] h-8',
      md: 'px-5 py-2.5 text-[13px] h-10',
      lg: 'px-7 py-3.5 text-[14px] h-12',
      icon: 'p-2 h-9 w-9'
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
