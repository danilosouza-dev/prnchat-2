import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        className={`w-full px-4 py-3 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-sm text-white placeholder:text-[var(--text-disabled)] transition-all focus:outline-none focus:border-[var(--accent-primary)] focus:bg-[var(--bg-tertiary)] ${className}`}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };
