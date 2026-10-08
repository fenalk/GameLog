import {
  GAME_LOG_STATUSES,
  gameLogStatusLabel,
  publicProfilePath,
  type GameLogEntry,
  type ListSummary,
  type PublicProfile,
  type ReviewSummary,
} from '@gamelog/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { DiaryEmpty, DiaryError, DiaryItem, DiarySkeletons } from '@/components/game-log-list';
import { GameLogFormDialog } from '@/components/game-log-form';
import { ListCard, ListEmpty, ListError, ListSkeletons } from '@/components/list-card';
import { ConfirmDialog } from '@/components/modal';
import { NotFound } from '@/components/not-found';
import { Pagination } from '@/components/pagination';
import { ProfileAvatar } from '@/components/profile-avatar';
import { ReviewEmpty, ReviewError, ReviewItem, ReviewSkeletons } from '@/components/review-list';
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
import {
  LIST_SORT_OPTIONS,
  deleteMyList,
  fetchMyLists,
  fetchPublicLists,
  listEditorPath,
  listsRequestFromState,
  listsStateFromSearch,
} from '@/lib/lists';
import { formatMemberSince } from '@/lib/profile';
import {
  REVIEW_SORT_OPTIONS,
  deleteMyReview,
  fetchMyReviews,
  fetchPublicReviews,
  reviewEditorPath,
  reviewsRequestFromState,
  reviewsStateFromSearch,
} from '@/lib/reviews';

/** Seções entregues pelas SPECs posteriores (F9): reservadas, ainda sem conteúdo. */
const RESERVED_SECTIONS = [{ label: 'Avaliações', spec: 'F9' }] as const;

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

/**
 * Aba Resenhas do perfil (seção 4 da SPEC F10): lista as resenhas do jogador com
 * paginação e ordenação sincronizadas na URL. Para o dono, usa `GET /me/reviews` (inclui
 * as não publicadas, com selo de status) e mostra as ações de editar/remover; para os
 * demais, usa a listagem pública (somente publicadas) em modo leitura.
 */
function ReviewSection({ username, isOwner }: { username: string; isOwner: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const state = reviewsStateFromSearch(searchParams, 'r');
  const request = reviewsRequestFromState(state);

  const [removing, setRemoving] = useState<ReviewSummary | null>(null);
  const [removeError, setRemoveError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ['reviews', 'list', isOwner ? 'mine' : 'public', username, request],
    queryFn: () => (isOwner ? fetchMyReviews(request) : fetchPublicReviews(username, request)),
    placeholderData: keepPreviousData,
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

  function selectSort(value: string) {
    updateParams((params) => {
      if (value === 'recently_created') {
        params.delete('rsort');
      } else {
        params.set('rsort', value);
      }

      params.delete('rpage');
    });
  }

  function goToPage(page: number) {
    updateParams((params) => {
      if (page > 1) {
        params.set('rpage', String(page));
      } else {
        params.delete('rpage');
      }
    });
  }

  async function handleRemove() {
    if (!removing) {
      return;
    }

    setBusy(true);
    setRemoveError(undefined);

    try {
      await deleteMyReview(removing.game.slug);
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ['reviews'] });
    } catch (error) {
      setRemoveError(formMessageFor(error));
    } finally {
      setBusy(false);
    }
  }

  const page = query.data;

  return (
    <section data-testid="resenhas-secao" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Resenhas</h2>

        <div className="flex items-center gap-2">
          <label htmlFor="ordem-resenhas-perfil" className="text-sm font-medium">
            Ordenar
          </label>
          <select
            id="ordem-resenhas-perfil"
            name="rsort"
            value={state.sort || 'recently_created'}
            onChange={(event) => selectSort(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {REVIEW_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {query.isPending ? <ReviewSkeletons /> : null}

      {query.isError ? (
        <ReviewError
          message={formMessageFor(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : null}

      {page ? (
        page.data.length === 0 ? (
          isOwner ? (
            <ReviewEmpty
              message="Você ainda não escreveu resenhas"
              hint="Escreva uma resenha pela página de um jogo do catálogo."
            />
          ) : (
            <ReviewEmpty message="Este jogador ainda não escreveu resenhas" />
          )
        ) : (
          <>
            <ul data-testid="resenhas-lista" className="flex flex-col gap-3">
              {page.data.map((review) => (
                <ReviewItem
                  key={review.id}
                  review={review}
                  showGame
                  isOwner={isOwner}
                  onEdit={(item) => navigate(reviewEditorPath(item.game.slug))}
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

      {removing ? (
        <ConfirmDialog
          title="Remover resenha"
          message={`Remover a sua resenha de "${removing.game.title}"? Esta ação não pode ser desfeita.`}
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

/**
 * Aba Listas do perfil (seção 4 da SPEC F11): lista as listas do jogador com paginação e
 * ordenação sincronizadas na URL. Para o dono, usa `GET /me/lists` (inclui as privadas,
 * com selo de visibilidade) e mostra as ações de editar/excluir; para os demais, usa a
 * listagem pública (somente `PUBLIC`) em modo leitura.
 */
function ListSection({ username, isOwner }: { username: string; isOwner: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const state = listsStateFromSearch(searchParams, 'l');
  const request = listsRequestFromState(state);

  const [removing, setRemoving] = useState<ListSummary | null>(null);
  const [removeError, setRemoveError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ['lists', 'list', isOwner ? 'mine' : 'public', username, request],
    queryFn: () => (isOwner ? fetchMyLists(request) : fetchPublicLists(username, request)),
    placeholderData: keepPreviousData,
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

  function selectSort(value: string) {
    updateParams((params) => {
      if (value === 'recently_updated') {
        params.delete('lsort');
      } else {
        params.set('lsort', value);
      }

      params.delete('lpage');
    });
  }

  function goToPage(page: number) {
    updateParams((params) => {
      if (page > 1) {
        params.set('lpage', String(page));
      } else {
        params.delete('lpage');
      }
    });
  }

  async function handleRemove() {
    if (!removing) {
      return;
    }

    setBusy(true);
    setRemoveError(undefined);

    try {
      await deleteMyList(removing.id);
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ['lists'] });
    } catch (error) {
      setRemoveError(formMessageFor(error));
    } finally {
      setBusy(false);
    }
  }

  const page = query.data;

  return (
    <section data-testid="listas-secao" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Listas</h2>

        <div className="flex flex-wrap items-center gap-2">
          {isOwner ? (
            <Link
              to={listEditorPath()}
              data-testid="listas-nova"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              Nova lista
            </Link>
          ) : null}

          <label htmlFor="ordem-listas-perfil" className="text-sm font-medium">
            Ordenar
          </label>
          <select
            id="ordem-listas-perfil"
            name="lsort"
            value={state.sort || 'recently_updated'}
            onChange={(event) => selectSort(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {LIST_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {query.isPending ? <ListSkeletons /> : null}

      {query.isError ? (
        <ListError
          message={formMessageFor(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : null}

      {page ? (
        page.data.length === 0 ? (
          <ListEmpty
            message={
              isOwner ? 'Você ainda não criou listas' : 'Este jogador ainda não criou listas'
            }
            {...(isOwner ? { hint: 'Crie uma lista para organizar seus jogos.' } : {})}
          />
        ) : (
          <>
            <ul data-testid="listas-lista" className="flex flex-col gap-3">
              {page.data.map((list) => (
                <ListCard
                  key={list.id}
                  list={list}
                  isOwner={isOwner}
                  onEdit={(item) => navigate(listEditorPath(item.id))}
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

      {removing ? (
        <ConfirmDialog
          title="Excluir lista"
          message={`Excluir a lista "${removing.title}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
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

/** Aba do perfil (Diário/Resenhas), com `aria-current` na seção ativa. */
function ProfileTab({
  active,
  testId,
  onClick,
  children,
}: {
  active: boolean;
  testId: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={
        active
          ? 'rounded-full border border-foreground/30 bg-accent px-3 py-1 text-sm font-medium'
          : 'rounded-full border px-3 py-1 text-sm text-muted-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40'
      }
    >
      {children}
    </button>
  );
}

/** Página de perfil público (seção 3 da SPEC F2): avatar, nome, bio e "membro desde". */
function PublicProfileView({ username }: { username: string }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<ProfileState>({ status: 'loading' });

  const sectionParam = searchParams.get('secao');
  const section =
    sectionParam === 'resenhas' ? 'resenhas' : sectionParam === 'listas' ? 'listas' : 'diario';

  function selectSection(next: 'diario' | 'resenhas' | 'listas') {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);

        if (next === 'diario') {
          params.delete('secao');
        } else {
          params.set('secao', next);
        }

        return params;
      },
      { replace: true },
    );
  }

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
        <ProfileTab
          active={section === 'diario'}
          testId="aba-diario"
          onClick={() => selectSection('diario')}
        >
          Diário
        </ProfileTab>

        <ProfileTab
          active={section === 'resenhas'}
          testId="aba-resenhas"
          onClick={() => selectSection('resenhas')}
        >
          Resenhas
        </ProfileTab>

        <ProfileTab
          active={section === 'listas'}
          testId="aba-listas"
          onClick={() => selectSection('listas')}
        >
          Listas
        </ProfileTab>

        {RESERVED_SECTIONS.map((reserved) => (
          <span
            key={reserved.label}
            title={`Chega na funcionalidade ${reserved.spec}`}
            className="rounded-full border px-3 py-1 text-sm text-muted-foreground opacity-70"
          >
            {reserved.label} · em breve
          </span>
        ))}
      </nav>

      {section === 'resenhas' ? (
        <ReviewSection username={profile.username} isOwner={isOwnProfile} />
      ) : section === 'listas' ? (
        <ListSection username={profile.username} isOwner={isOwnProfile} />
      ) : (
        <DiarySection username={profile.username} isOwner={isOwnProfile} />
      )}
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
