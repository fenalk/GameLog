import {
  GAME_LOG_STATUSES,
  gameLogStatusLabel,
  publicProfilePath,
  type GameLogEntry,
  type PublicProfile,
} from '@gamelog/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import { DiaryEmpty, DiaryError, DiaryItem, DiarySkeletons } from '@/components/game-log-list';
import { GameLogFormDialog } from '@/components/game-log-form';
import { ConfirmDialog } from '@/components/modal';
import { NotFound } from '@/components/not-found';
import { Pagination } from '@/components/pagination';
import { ProfileAvatar } from '@/components/profile-avatar';
import { ApiError, apiRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { fetchGameDetail } from '@/lib/catalog';
import { formMessageFor } from '@/lib/forms';
import {
  deleteMyGameLog,
  diaryRequestFromState,
  diaryStateFromSearch,
  fetchPublicDiary,
} from '@/lib/game-logs';
import { formatMemberSince } from '@/lib/profile';

/** Seções entregues pelas SPECs posteriores (F9–F11): reservadas, ainda sem conteúdo. */
const RESERVED_SECTIONS = [
  { label: 'Avaliações', spec: 'F9' },
  { label: 'Resenhas', spec: 'F10' },
  { label: 'Listas', spec: 'F11' },
] as const;

/**
 * Aba Diário do perfil (seção 4 da SPEC F8): lista o diário público com filtro por status
 * e paginação sincronizados na URL, estados de carregamento/vazio/erro e as ações de
 * editar/remover para o dono do perfil. Os dados vêm de `GET /users/:username/games`,
 * que é público e serve tanto o dono quanto os visitantes.
 */
function DiarySection({ username, isOwner }: { username: string; isOwner: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const state = diaryStateFromSearch(searchParams);
  const request = diaryRequestFromState(state);

  const [editing, setEditing] = useState<GameLogEntry | null>(null);
  const [removing, setRemoving] = useState<GameLogEntry | null>(null);
  const [removeError, setRemoveError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ['diary', 'list', 'public', username, request],
    queryFn: () => fetchPublicDiary(username, request),
    placeholderData: keepPreviousData,
    retry: 1,
  });

  // As plataformas do formulário vêm do detalhe do jogo, carregado só ao editar.
  const platformsQuery = useQuery({
    queryKey: ['catalog', 'game', editing?.game.slug],
    queryFn: () => fetchGameDetail(editing?.game.slug ?? ''),
    enabled: editing !== null,
    retry: 1,
  });

  const updateParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          mutate(params);
          return params;
        },
        { replace: true, flushSync: true },
      );
    },
    [setSearchParams],
  );

  function selectStatus(value: string) {
    updateParams((params) => {
      if (value.length > 0) {
        params.set('status', value);
      } else {
        params.delete('status');
      }

      params.delete('page');
    });
  }

  function goToPage(page: number) {
    updateParams((params) => {
      if (page > 1) {
        params.set('page', String(page));
      } else {
        params.delete('page');
      }
    });
  }

  function handleSaved() {
    setEditing(null);
    void queryClient.invalidateQueries({ queryKey: ['diary'] });
  }

  async function handleRemove() {
    if (!removing) {
      return;
    }

    setBusy(true);
    setRemoveError(undefined);

    try {
      await deleteMyGameLog(removing.game.slug);
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ['diary'] });
    } catch (error) {
      setRemoveError(formMessageFor(error));
    } finally {
      setBusy(false);
    }
  }

  const page = query.data;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Diário</h2>

        <div className="flex items-center gap-2">
          <label htmlFor="filtro-status-diario" className="text-sm font-medium">
            Status
          </label>
          <select
            id="filtro-status-diario"
            name="status"
            value={state.statuses[0] ?? ''}
            onChange={(event) => selectStatus(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="">Todos os status</option>
            {GAME_LOG_STATUSES.map((status) => (
              <option key={status} value={status}>
                {gameLogStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {query.isPending ? <DiarySkeletons /> : null}

      {query.isError ? (
        <DiaryError
          message={formMessageFor(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : null}

      {page ? (
        page.data.length === 0 ? (
          state.statuses.length > 0 ? (
            <p
              data-testid="diario-vazio-filtro"
              className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground"
            >
              Nenhum registro com este status
            </p>
          ) : (
            <DiaryEmpty isOwner={isOwner} />
          )
        ) : (
          <>
            <ul data-testid="diario-lista" className="flex flex-col gap-3">
              {page.data.map((entry) => (
                <DiaryItem
                  key={entry.id}
                  entry={entry}
                  isOwner={isOwner}
                  onEdit={setEditing}
                  onRemove={(item) => {
                    setRemoveError(undefined);
                    setRemoving(item);
                  }}
                />
              ))}
            </ul>

            <Pagination
              page={page.meta.page}
              totalPages={page.meta.totalPages}
              onPageChange={goToPage}
            />
          </>
        )
      ) : null}

      {editing ? (
        <GameLogFormDialog
          game={{ slug: editing.game.slug, title: editing.game.title }}
          entry={editing}
          platforms={platformsQuery.data?.platforms ?? []}
          platformsPending={platformsQuery.isPending}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      ) : null}

      {removing ? (
        <ConfirmDialog
          title="Remover do diário"
          message={`Remover "${removing.game.title}" do seu diário? Esta ação não pode ser desfeita.`}
          confirmLabel="Remover"
          busy={busy}
          error={removeError}
          onConfirm={() => void handleRemove()}
          onCancel={() => {
            setRemoving(null);
            setRemoveError(undefined);
          }}
        />
      ) : null}
    </section>
  );
}

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
        <span
          data-testid="aba-diario"
          aria-current="page"
          className="rounded-full border border-foreground/30 bg-accent px-3 py-1 text-sm font-medium"
        >
          Diário
        </span>

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

      <DiarySection username={profile.username} isOwner={isOwnProfile} />
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
