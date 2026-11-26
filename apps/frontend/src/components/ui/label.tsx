import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-ui font-medium text-ink peer-disabled:cursor-not-allowed peer-disabled:opacity-60', className)}
    {...props}
  />
));
Label.displayName = 'Label';

interface FieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
  optional?: boolean;
}

/** Envoltorio de campo de formulario: etiqueta, control, ayuda y error. */
export function Field({ label, htmlFor, hint, error, className, children, optional }: FieldProps) {
  const messageId = htmlFor ? `${htmlFor}-message` : undefined;
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={htmlFor} className="flex items-baseline gap-1.5">
        {label}
        {optional ? <span className="text-xs font-normal text-muted">Optional</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={messageId} role="alert" className="text-ui text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-ui text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
