import * as React from 'react';
import { cn } from '@/lib/utils';

export const controlClasses =
  'w-full rounded-control border border-line bg-surface text-sm text-ink placeholder:text-muted transition-colors duration-150 hover:border-line-strong focus-visible:outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/20 disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/20';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input ref={ref} type={type} className={cn(controlClasses, 'h-9 px-3', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(controlClasses, 'min-h-20 resize-y px-3 py-2 leading-relaxed', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';
