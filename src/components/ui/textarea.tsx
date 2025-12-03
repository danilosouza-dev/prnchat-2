import React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <textarea
        className={`w-full px-4 py-3 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-sm text-white placeholder:text-[var(--text-muted)] transition-colors resize-vertical min-h-[100px] outline-none focus:border-[var(--accent-pink)] focus:shadow-[0_0_0_2px_rgba(233,30,99,0.15)] focus:bg-[var(--bg-tertiary)] ${className}`}
        ref={ref}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea };
