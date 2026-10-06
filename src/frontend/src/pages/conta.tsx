import { AUTH_ROUTES, type MeResponse } from '@gamelog/shared';
import { useEffect, useState } from 'react';

import { authorizedRequest } from '@/lib/auth-store';
import { formMessageFor } from '@/lib/forms';

const ROLE_LABELS: Record<MeResponse['role'], string> = {
  PLAYER: 'Jogador',
  ADMIN: 'Administrador',
};

const STATUS_LABELS: Record<MeResponse['status'], string> = {
  ACTIVE: 'Ativa',
  SUSPENDED: 'Suspensa',
};

/**
 * Rota protegida de exemplo da Etapa 1: exibe os dados da conta autenticada obtidos de
 * `GET /auth/me`. O gerenciamento de perfil é a funcionalidade F2.
 */
export function ContaPage() {
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    authorizedRequest<MeResponse>(AUTH_ROUTES.me)
      .then((data) => {
        if (active) {
          setProfile(data);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(formMessageFor(requestError));
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
          Dados da sua conta no GameLog. A edição de perfil chega na funcionalidade F2.
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {profile ? (
        <dl
          data-testid="dados-da-conta"
          className="grid gap-x-6 gap-y-3 rounded-xl border bg-card p-6 text-sm sm:grid-cols-[auto_1fr]"
        >
          <dt className="text-muted-foreground">Nome de usuário</dt>
          <dd className="font-mono">{profile.username}</dd>
          <dt className="text-muted-foreground">E-mail</dt>
          <dd className="font-mono">{profile.email}</dd>
          <dt className="text-muted-foreground">Papel</dt>
          <dd>{ROLE_LABELS[profile.role]}</dd>
          <dt className="text-muted-foreground">Situação</dt>
          <dd>{STATUS_LABELS[profile.status]}</dd>
        </dl>
      ) : !error ? (
        <p className="text-muted-foreground">Carregando dados da conta…</p>
      ) : null}
    </main>
  );
}
