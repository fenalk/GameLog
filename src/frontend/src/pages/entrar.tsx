import { INVALID_CREDENTIALS_MESSAGE, loginSchema } from '@gamelog/shared';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { FormField } from '@/components/form-field';
import { PasswordField } from '@/components/password-field';
import { ApiError } from '@/lib/api';
import { signIn } from '@/lib/auth-store';
import { fieldErrorsFromZod, focusFirstField, formMessageFor } from '@/lib/forms';
import { safeReturnTo } from '@/lib/navigation';

const INITIAL_VALUES = { identifier: '', password: '' };

/** Login por e-mail ou username (seção 6 da SPEC F1). */
export function EntrarPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [values, setValues] = useState(INITIAL_VALUES);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateValue(field: keyof typeof INITIAL_VALUES) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = loginSchema.safeParse(values);

    if (!parsed.success) {
      const errors = fieldErrorsFromZod(parsed.error);
      setFieldErrors(errors);
      setFormError(null);
      focusFirstField(errors);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);

    try {
      await signIn(parsed.data);
      navigate(safeReturnTo(searchParams.get('returnTo')), { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') {
        // Mensagem genérica: não revela se o problema foi o usuário ou a senha.
        setFormError(INVALID_CREDENTIALS_MESSAGE);
      } else if (error instanceof ApiError && error.code === 'ACCOUNT_SUSPENDED') {
        setFormError('Conta suspensa. Entre em contato com o suporte para mais informações.');
      } else {
        setFormError(formMessageFor(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="text-sm text-muted-foreground">Use seu e-mail ou nome de usuário.</p>
      </header>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        className="flex flex-col gap-5"
      >
        {formError ? (
          <p
            role="alert"
            data-testid="erro-formulario"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}

        <FormField
          label="E-mail ou nome de usuário"
          name="identifier"
          autoComplete="username"
          required
          value={values.identifier}
          onChange={updateValue('identifier')}
          error={fieldErrors.identifier}
        />

        <PasswordField
          label="Senha"
          name="password"
          autoComplete="current-password"
          required
          value={values.password}
          onChange={updateValue('password')}
          error={fieldErrors.password}
        />

        <button
          type="submit"
          disabled={submitting}
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="text-sm text-muted-foreground">
        Ainda não tem conta?{' '}
        <Link to="/cadastro" className="underline underline-offset-4 hover:text-foreground">
          Cadastrar
        </Link>
      </p>
    </main>
  );
}
