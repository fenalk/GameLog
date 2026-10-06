import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type FormSelectProps = {
  label: string;
  name: string;
  error?: string | undefined;
  children: ReactNode;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'name' | 'children'>;

/**
 * Campo de seleção acessível, no mesmo formato do `FormField` (label associado, erro por
 * campo com `role="alert"` e `aria-invalid`/`aria-describedby`).
 */
export function FormSelect({
  label,
  name,
  error,
  children,
  className,
  ...selectProps
}: FormSelectProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors outline-none',
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
          'disabled:cursor-not-allowed disabled:opacity-60',
          error && 'border-destructive focus-visible:ring-destructive/30',
          className,
        )}
        {...selectProps}
      >
        {children}
      </select>
      {error ? (
        <p
          id={errorId}
          role="alert"
          data-testid={`erro-${name}`}
          className="text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
