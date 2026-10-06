import {
  AVATAR_URL_MAX_LENGTH,
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  PROFILE_ROUTES,
  emailChangeSchema,
  passwordChangeResponseSchema,
  passwordChangeSchema,
  profileUpdateSchema,
  type OwnProfile,
} from '@gamelog/shared';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

import { FormField } from '@/components/form-field';
import { FormTextArea } from '@/components/form-textarea';
import { PasswordField } from '@/components/password-field';
import { ProfileAvatar } from '@/components/profile-avatar';
import { ApiError } from '@/lib/api';
import { authorizedRequest, clearSession, updateAccessToken } from '@/lib/auth-store';
import {
  fieldErrorsFromDetails,
  fieldErrorsFromZod,
  focusFirstField,
  formMessageFor,
} from '@/lib/forms';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<OwnProfile['role'], string> = {
  PLAYER: 'Jogador',
  ADMIN: 'Administrador',
};

type AccountTab = 'perfil' | 'seguranca' | 'exclusao';

const TABS: { id: AccountTab; label: string }[] = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'seguranca', label: 'Segurança' },
  { id: 'exclusao', label: 'Excluir conta' },
];

const SUBMIT_BUTTON_CLASS =
  'h-10 self-start rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60';

const SUCCESS_CLASS =
  'rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground';

const ERROR_CLASS =
  'rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive';

/** Formulário de edição do perfil (aba Perfil) — RN-F2-02 e RN-F2-04. */
function ProfileForm({
  profile,
  onSaved,
}: {
  profile: OwnProfile;
  onSaved: (profile: OwnProfile) => void;
}) {
  const [values, setValues] = useState({
    displayName: profile.displayName,
    bio: profile.bio ?? '',
    avatarUrl: profile.avatarUrl ?? '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateValue(field: keyof typeof values) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Campo vazio vira `null`: limpa bio/avatarUrl e restaura o username no displayName.
    const parsed = profileUpdateSchema.safeParse({
      displayName: values.displayName.trim() === '' ? null : values.displayName,
      bio: values.bio.trim() === '' ? null : values.bio,
      avatarUrl: values.avatarUrl.trim() === '' ? null : values.avatarUrl,
    });

    if (!parsed.success) {
      const errors = fieldErrorsFromZod(parsed.error);
      setFieldErrors(errors);
      setFormError(null);
      setSuccess(null);
      focusFirstField(errors);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const updated = await authorizedRequest<OwnProfile>(PROFILE_ROUTES.myProfile, {
        method: 'PATCH',
        body: parsed.data,
      });

      onSaved(updated);
      setValues({
        displayName: updated.displayName,
        bio: updated.bio ?? '',
        avatarUrl: updated.avatarUrl ?? '',
      });
      setSuccess('Perfil atualizado.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.details.length > 0) {
        setFieldErrors(fieldErrorsFromDetails(error.details));
      } else {
        setFormError(formMessageFor(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const previewName = values.displayName.trim() === '' ? profile.username : values.displayName;
  const previewAvatarUrl = values.avatarUrl.trim() === '' ? null : values.avatarUrl.trim();

  return (
    <form
      data-testid="form-perfil"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className="flex flex-col gap-5"
    >
      <div className="flex items-center gap-4">
        <ProfileAvatar
          displayName={previewName}
          avatarUrl={previewAvatarUrl}
          className="size-12 text-base"
        />
        <p className="text-sm text-muted-foreground">Pré-visualização do avatar</p>
      </div>

      {success ? (
        <p role="status" data-testid="sucesso-perfil" className={SUCCESS_CLASS}>
          {success}
        </p>
      ) : null}

      {formError ? (
        <p role="alert" data-testid="erro-perfil" className={ERROR_CLASS}>
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <FormField
          label="Nome de exibição"
          name="displayName"
          autoComplete="nickname"
          value={values.displayName}
          onChange={updateValue('displayName')}
          error={fieldErrors.displayName}
        />
        <p className="text-xs text-muted-foreground">
          {values.displayName.length}/{DISPLAY_NAME_MAX_LENGTH} caracteres · vazio restaura o nome
          de usuário
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <FormTextArea
          label="Bio"
          name="bio"
          rows={4}
          value={values.bio}
          onChange={updateValue('bio')}
          error={fieldErrors.bio}
        />
        <p className="text-xs text-muted-foreground">
          {values.bio.length}/{BIO_MAX_LENGTH} caracteres
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <FormField
          label="URL do avatar"
          name="avatarUrl"
          type="url"
          placeholder="https://exemplo.com/avatar.png"
          value={values.avatarUrl}
          onChange={updateValue('avatarUrl')}
          error={fieldErrors.avatarUrl}
        />
        <p className="text-xs text-muted-foreground">
          {values.avatarUrl.length}/{AVATAR_URL_MAX_LENGTH} caracteres · apenas URLs https
        </p>
      </div>

      <button type="submit" disabled={submitting} className={SUBMIT_BUTTON_CLASS}>
        {submitting ? 'Salvando…' : 'Salvar perfil'}
      </button>
    </form>
  );
}

/** Troca de e-mail (aba Segurança) — RN-F2-05. */
function EmailForm({
  email,
  onChanged,
}: {
  email: string;
  onChanged: (profile: OwnProfile) => void;
}) {
  const [values, setValues] = useState({ email: '', emailCurrentPassword: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateValue(field: keyof typeof values) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // O campo de senha tem nome próprio no formulário; a API o chama de currentPassword.
    const parsed = emailChangeSchema.safeParse({
      email: values.email,
      currentPassword: values.emailCurrentPassword,
    });

    if (!parsed.success) {
      const errors = fieldErrorsFromZod(parsed.error);
      const currentPassword = errors.currentPassword;
      delete errors.currentPassword;
      if (currentPassword) {
        errors.emailCurrentPassword = currentPassword;
      }
      setFieldErrors(errors);
      setFormError(null);
      setSuccess(null);
      focusFirstField(errors);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const updated = await authorizedRequest<OwnProfile>(PROFILE_ROUTES.myEmail, {
        method: 'PATCH',
        body: parsed.data,
      });

      onChanged(updated);
      setValues({ email: '', emailCurrentPassword: '' });
      setSuccess(`E-mail alterado para ${updated.email}.`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_TAKEN') {
        setFieldErrors({ email: error.message });
      } else if (error instanceof ApiError && error.code === 'INVALID_CURRENT_PASSWORD') {
        setFieldErrors({ emailCurrentPassword: error.message });
      } else if (error instanceof ApiError && error.status === 400 && error.details.length > 0) {
        const details = fieldErrorsFromDetails(error.details);
        const currentPassword = details.currentPassword;
        delete details.currentPassword;
        if (currentPassword) {
          details.emailCurrentPassword = currentPassword;
        }
        setFieldErrors(details);
      } else {
        setFormError(formMessageFor(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      data-testid="form-email"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Trocar e-mail</h2>
        <p className="text-sm text-muted-foreground">E-mail atual: {email}</p>
      </div>

      {success ? (
        <p role="status" data-testid="sucesso-email" className={SUCCESS_CLASS}>
          {success}
        </p>
      ) : null}

      {formError ? (
        <p role="alert" data-testid="erro-email" className={ERROR_CLASS}>
          {formError}
        </p>
      ) : null}

      <FormField
        label="Novo e-mail"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={values.email}
        onChange={updateValue('email')}
        error={fieldErrors.email}
      />

      <PasswordField
        label="Senha atual"
        name="emailCurrentPassword"
        autoComplete="current-password"
        required
        value={values.emailCurrentPassword}
        onChange={updateValue('emailCurrentPassword')}
        error={fieldErrors.emailCurrentPassword}
      />

      <button type="submit" disabled={submitting} className={SUBMIT_BUTTON_CLASS}>
        {submitting ? 'Alterando…' : 'Alterar e-mail'}
      </button>
    </form>
  );
}

/** Troca de senha (aba Segurança) — RN-F2-06. */
function PasswordForm() {
  const [values, setValues] = useState({ currentPassword: '', newPassword: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateValue(field: keyof typeof values) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = passwordChangeSchema.safeParse(values);

    if (!parsed.success) {
      const errors = fieldErrorsFromZod(parsed.error);
      setFieldErrors(errors);
      setFormError(null);
      setSuccess(null);
      focusFirstField(errors);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const payload = passwordChangeResponseSchema.parse(
        await authorizedRequest(PROFILE_ROUTES.myPassword, {
          method: 'PATCH',
          body: parsed.data,
        }),
      );

      updateAccessToken(payload.accessToken);
      setValues({ currentPassword: '', newPassword: '' });
      setSuccess('Senha alterada. As outras sessões foram encerradas.');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_CURRENT_PASSWORD') {
        setFieldErrors({ currentPassword: error.message });
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
    <form
      data-testid="form-senha"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Trocar senha</h2>
        <p className="text-sm text-muted-foreground">
          A nova senha deve ter de 8 a 128 caracteres, com ao menos uma letra e um número.
        </p>
      </div>

      {success ? (
        <p role="status" data-testid="sucesso-senha" className={SUCCESS_CLASS}>
          {success}
        </p>
      ) : null}

      {formError ? (
        <p role="alert" data-testid="erro-senha" className={ERROR_CLASS}>
          {formError}
        </p>
      ) : null}

      <PasswordField
        label="Senha atual"
        name="currentPassword"
        autoComplete="current-password"
        required
        value={values.currentPassword}
        onChange={updateValue('currentPassword')}
        error={fieldErrors.currentPassword}
      />

      <PasswordField
        label="Nova senha"
        name="newPassword"
        autoComplete="new-password"
        required
        value={values.newPassword}
        onChange={updateValue('newPassword')}
        error={fieldErrors.newPassword}
      />

      <button type="submit" disabled={submitting} className={SUBMIT_BUTTON_CLASS}>
        {submitting ? 'Alterando…' : 'Alterar senha'}
      </button>
    </form>
  );
}

/** Exclusão de conta (aba Excluir conta) — RN-F2-07. */
function DeleteAccountForm({ username }: { username: string }) {
  const navigate = useNavigate();
  const [values, setValues] = useState({ confirmUsername: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canDelete =
    values.confirmUsername === username && values.password.length > 0 && !submitting;

  function updateValue(field: keyof typeof values) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canDelete) {
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);

    try {
      await authorizedRequest<void>(PROFILE_ROUTES.myAccount, {
        method: 'DELETE',
        body: { password: values.password },
      });

      // Sai da rota protegida antes de limpar a sessão: com a sessão anônima em
      // `/conta`, o `RequireAuth` redirecionaria para o login (returnTo=/conta).
      navigate('/', { replace: true, flushSync: true });
      clearSession();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_CURRENT_PASSWORD') {
        setFieldErrors({ password: error.message });
      } else if (error instanceof ApiError && error.code === 'LAST_ADMIN') {
        setFormError(error.message);
      } else {
        setFormError(formMessageFor(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      data-testid="form-exclusao"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Excluir conta</h2>
        <p className="text-sm text-muted-foreground">
          Esta ação é irreversível: diário, avaliações, resenhas e listas serão removidos. Para
          confirmar, digite seu nome de usuário e sua senha.
        </p>
      </div>

      {formError ? (
        <p role="alert" data-testid="erro-exclusao" className={ERROR_CLASS}>
          {formError}
        </p>
      ) : null}

      <FormField
        label="Digite seu nome de usuário para confirmar"
        name="confirmUsername"
        autoComplete="off"
        value={values.confirmUsername}
        onChange={updateValue('confirmUsername')}
        error={fieldErrors.confirmUsername}
      />

      <PasswordField
        label="Senha"
        name="password"
        autoComplete="current-password"
        value={values.password}
        onChange={updateValue('password')}
        error={fieldErrors.password}
      />

      <button
        type="submit"
        disabled={!canDelete}
        className="h-10 self-start rounded-md bg-destructive px-4 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Excluindo…' : 'Excluir minha conta'}
      </button>
    </form>
  );
}

/**
 * Página `/conta` (seção 3 da SPEC F2): abas Perfil, Segurança e Excluir conta, com os
 * dados da conta autenticada obtidos de `GET /me/profile`.
 */
export function ContaPage() {
  const [tab, setTab] = useState<AccountTab>('perfil');
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    authorizedRequest<OwnProfile>(PROFILE_ROUTES.myProfile)
      .then((data) => {
        if (active) {
          setProfile(data);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(formMessageFor(error));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Minha conta</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie seu perfil público, sua segurança e sua conta no GameLog.
        </p>
      </header>

      {loadError ? (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      {profile ? (
        <>
          <dl
            data-testid="dados-da-conta"
            className="grid gap-x-6 gap-y-3 rounded-xl border bg-card p-6 text-sm sm:grid-cols-[auto_1fr]"
          >
            <dt className="text-muted-foreground">Nome de usuário</dt>
            <dd className="font-mono">{profile.username}</dd>
            <dt className="text-muted-foreground">Nome de exibição</dt>
            <dd>{profile.displayName}</dd>
            <dt className="text-muted-foreground">E-mail</dt>
            <dd className="font-mono">{profile.email}</dd>
            <dt className="text-muted-foreground">Papel</dt>
            <dd>{ROLE_LABELS[profile.role]}</dd>
          </dl>

          <div
            role="tablist"
            aria-label="Seções da conta"
            className="flex flex-wrap gap-2 border-b pb-2"
          >
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`aba-${item.id}`}
                aria-selected={tab === item.id}
                aria-controls={`painel-${item.id}`}
                onClick={() => setTab(item.id)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  tab === item.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'perfil' ? (
            <section
              role="tabpanel"
              id="painel-perfil"
              aria-labelledby="aba-perfil"
              className="rounded-xl border bg-card p-6"
            >
              <ProfileForm profile={profile} onSaved={setProfile} />
            </section>
          ) : null}

          {tab === 'seguranca' ? (
            <section
              role="tabpanel"
              id="painel-seguranca"
              aria-labelledby="aba-seguranca"
              className="flex flex-col gap-8 rounded-xl border bg-card p-6"
            >
              <EmailForm email={profile.email} onChanged={setProfile} />
              <PasswordForm />
            </section>
          ) : null}

          {tab === 'exclusao' ? (
            <section
              role="tabpanel"
              id="painel-exclusao"
              aria-labelledby="aba-exclusao"
              className="rounded-xl border border-destructive/40 bg-card p-6"
            >
              <DeleteAccountForm username={profile.username} />
            </section>
          ) : null}
        </>
      ) : !loadError ? (
        <p className="text-muted-foreground">Carregando dados da conta…</p>
      ) : null}
    </main>
  );
}
