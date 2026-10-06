import { useId, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type FormTextAreaProps = {
  label: string;
  name: string;
  error?: string | undefined;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'name'>;

/** Campo de texto multilinha acessível, no mesmo padrão do `FormField`. */
export function FormTextArea({
  label,
  name,
  error,
  className,
  ...textAreaProps
}: FormTextAreaProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors outline-none',
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
          'disabled:cursor-not-allowed disabled:opacity-60',
          error && 'border-destructive focus-visible:ring-destructive/30',
          className,
        )}
        {...textAreaProps}
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
