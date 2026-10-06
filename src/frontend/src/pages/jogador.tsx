import { publicProfilePath, type PublicProfile } from '@gamelog/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { NotFound } from '@/components/not-found';
import { ProfileAvatar } from '@/components/profile-avatar';
import { ApiError, apiRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formMessageFor } from '@/lib/forms';
import { formatMemberSince } from '@/lib/profile';

/** Seções entregues pelas SPECs posteriores (F8–F11): reservadas, ainda sem conteúdo. */
const RESERVED_SECTIONS = [
  { label: 'Diário', spec: 'F8' },
  { label: 'Avaliações', spec: 'F9' },
  { label: 'Resenhas', spec: 'F10' },
  { label: 'Listas', spec: 'F11' },
] as const;

type ProfileState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profile: PublicProfile };

/** Página de perfil público (seção 3 da SPEC F2): avatar, nome, bio e "membro desde". */
function PublicProfileView({ username }: { username: string }) {
  const { user } = useAuth();
  const [state, setState] = useState<ProfileState>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    apiRequest<PublicProfile>(publicProfilePath(username))
      .then((profile) => {
        if (active) {
          setState({ status: 'ready', profile });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setState({ status: 'not-found' });
        } else {
          setState({ status: 'error', message: formMessageFor(error) });
        }
      });

    return () => {
      active = false;
    };
  }, [username]);

  if (state.status === 'not-found') {
    return <NotFound message="Perfil não encontrado" />;
  }

  if (state.status === 'error') {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-12">
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      </main>
    );
  }

  if (state.status === 'loading') {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-12">
        <p className="text-muted-foreground">Carregando perfil…</p>
      </main>
    );
  }

  const { profile } = state;
  const isOwnProfile = user?.username === profile.username;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-6 rounded-xl border bg-card p-6 sm:flex-row sm:items-start">
        <ProfileAvatar displayName={profile.displayName} avatarUrl={profile.avatarUrl} />

        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h1
                data-testid="perfil-display-name"
                className="text-2xl font-semibold tracking-tight"
              >
                {profile.displayName}
              </h1>
              <p data-testid="perfil-username" className="font-mono text-sm text-muted-foreground">
                @{profile.username}
              </p>
            </div>

            {isOwnProfile ? (
              <Link
                to="/conta"
                className="rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Editar perfil
              </Link>
            ) : null}
          </div>

          {profile.bio ? (
            <p data-testid="perfil-bio" className="text-sm whitespace-pre-line">
              {profile.bio}
            </p>
          ) : null}

          <p className="text-sm text-muted-foreground">
            Membro desde {formatMemberSince(profile.createdAt)}
          </p>
        </div>
      </header>

      <nav aria-label="Seções do perfil" className="flex flex-wrap gap-2">
        {RESERVED_SECTIONS.map((section) => (
          <span
            key={section.label}
            title={`Chega na funcionalidade ${section.spec}`}
            className="rounded-full border px-3 py-1 text-sm text-muted-foreground opacity-70"
          >
            {section.label} · em breve
          </span>
        ))}
      </nav>
    </main>
  );
}

/**
 * Rota `/jogadores/:username`. O `key` remonta a view ao trocar de username, evitando
 * exibir o perfil anterior enquanto o novo é carregado.
 */
export function JogadorPage() {
  const { username } = useParams();

  if (!username) {
    return <NotFound message="Perfil não encontrado" />;
  }

  return <PublicProfileView key={username} username={username} />;
}
