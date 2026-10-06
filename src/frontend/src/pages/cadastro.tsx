import { registerSchema } from '@gamelog/shared';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { FormField } from '@/components/form-field';
import { PasswordField } from '@/components/password-field';
import { ApiError } from '@/lib/api';
import { signUp } from '@/lib/auth-store';
import {
  fieldErrorsFromDetails,
  fieldErrorsFromZod,
  focusFirstField,
  formMessageFor,
} from '@/lib/forms';

const INITIAL_VALUES = { username: '', email: '', password: '' };

/** Cadastro de usuário (seção 6 da SPEC F1): valida com os schemas compartilhados. */
export function CadastroPage() {
  const navigate = useNavigate();
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

    const parsed = registerSchema.safeParse(values);

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
      await signUp(parsed.data);
      navigate('/', { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'USERNAME_TAKEN') {
        setFieldErrors({ username: error.message });
      } else if (error instanceof ApiError && error.code === 'EMAIL_TAKEN') {
        setFieldErrors({ email: error.message });
      } else if (error instanceof ApiError && error.status === 400 && error.details.length > 0) {
        setFieldErrors(fieldErrorsFromDetails(error.details));
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
        <h1 className="text-2xl font-semibold tracking-tight">Cadastrar</h1>
        <p className="text-sm text-muted-foreground">
          Crie sua conta no GameLog para registrar e avaliar seus jogos.
        </p>
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
          label="Nome de usuário"
          name="username"
          autoComplete="username"
          required
          value={values.username}
          onChange={updateValue('username')}
          error={fieldErrors.username}
        />

        <FormField
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={values.email}
          onChange={updateValue('email')}
          error={fieldErrors.email}
        />

        <PasswordField
          label="Senha"
          name="password"
          autoComplete="new-password"
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
          {submitting ? 'Cadastrando…' : 'Cadastrar'}
        </button>
      </form>

      <p className="text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link to="/entrar" className="underline underline-offset-4 hover:text-foreground">
          Entrar
        </Link>
      </p>
    </main>
  );
}
