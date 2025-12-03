import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        className={`w-full px-4 py-3 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-sm text-white placeholder:text-[var(--text-muted)] transition-all duration-200 outline-none focus:border-[var(--accent-pink)] focus:shadow-[0_0_0_2px_rgba(233,30,99,0.15)] focus:bg-[var(--bg-tertiary)] ${className}`}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };
