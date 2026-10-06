import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type PasswordFieldProps = {
  label: string;
  name: string;
  error?: string | undefined;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'name' | 'type'>;

/** Campo de senha com alternância de visibilidade acessível por teclado. */
export function PasswordField({
  label,
  name,
  error,
  className,
  ...inputProps
}: PasswordFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'h-10 w-full rounded-md border border-input bg-background px-3 pr-11 text-sm shadow-xs transition-colors outline-none',
            'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
            'disabled:cursor-not-allowed disabled:opacity-60',
            error && 'border-destructive focus-visible:ring-destructive/30',
            className,
          )}
          {...inputProps}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {visible ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
        </button>
      </div>
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
