import { useId, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type FormFieldProps = {
  label: string;
  name: string;
  error?: string | undefined;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'name'>;

/**
 * Campo de formulário acessível: `label` associado por `htmlFor`, erro por campo com
 * `role="alert"` e `aria-invalid`/`aria-describedby` ligados ao texto do erro.
 */
export function FormField({ label, name, error, className, ...inputProps }: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
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
        {...inputProps}
      />
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
