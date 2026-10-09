import {
  publicProfilePath,
  publicProfileSchema,
  type FollowItem,
  type FollowState,
  type PublicProfile,
} from '@gamelog/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import { FollowButton } from '@/components/follow-button';
import { NotFound } from '@/components/not-found';
import { Pagination } from '@/components/pagination';
import { ProfileAvatar } from '@/components/profile-avatar';
import { ApiError, apiRequest } from '@/lib/api';
import { authorizedRequest, getAuthState, useAuth } from '@/lib/auth-store';
import { useDocumentTitle } from '@/lib/document-title';
import {
  FOLLOW_SORT_OPTIONS,
  fetchFollowList,
  followListPagePath,
  followListRequestFromState,
  followListStateFromSearch,
  formatFollowedAt,
  type FollowListKind,
} from '@/lib/follows';
import { formMessageFor } from '@/lib/forms';

/** Textos das duas páginas (seção 4 da SPEC F12). */
const TEXTS: Record<FollowListKind, { label: string; empty: string }> = {
  followers: { label: 'Seguidores', empty: 'Ainda não tem seguidores' },
  following: { label: 'Seguindo', empty: 'Ainda não segue ninguém' },
};

/** Carrega o perfil (para o cabeçalho reduzido), enviando o token quando há sessão. */
async function fetchProfile(username: string): Promise<PublicProfile> {
  const path = publicProfilePath(username);
  const payload = getAuthState().accessToken
    ? await authorizedRequest(path)
    : await apiRequest(path);

  return publicProfileSchema.parse(payload);
}

function FollowItemRow({
  item,
  hideButton,
  returnTo,
  onFollowed,
  onUnfollowed,
}: {
  item: FollowItem;
  hideButton: boolean;
  returnTo: string;
  onFollowed: (state: FollowState) => void;
  onUnfollowed: () => void;
}) {
  return (
    <li
      data-testid="seguidor-item"
      className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4"
    >
      <ProfileAvatar
        displayName={item.displayName}
        avatarUrl={item.avatarUrl}
        className="size-12"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          to={`/jogadores/${encodeURIComponent(item.username)}`}
          className="truncate font-medium underline-offset-4 hover:underline"
        >
          {item.displayName}
        </Link>
        <span className="truncate font-mono text-sm text-muted-foreground">@{item.username}</span>
        <span className="text-xs text-muted-foreground">
          Seguindo desde {formatFollowedAt(item.followedAt)}
        </span>
      </div>

      {hideButton ? null : (
        <FollowButton
          username={item.username}
          displayName={item.displayName}
          isFollowing={item.isFollowedByMe}
          returnTo={returnTo}
          onFollowed={onFollowed}
          onUnfollowed={onUnfollowed}
        />
      )}
    </li>
  );
}

/**
 * Página de seguidores/seguindo (seção 4 da SPEC F12): cabeçalho reduzido do perfil, lista
 * pública paginada com ordenação sincronizada na URL, botão Seguir/Seguindo para os itens
 * (oculto no próprio perfil e no item do próprio usuário) e estados de carregamento, vazio
 * e erro com "Tentar novamente". Username inexistente exibe a página 404.
 */
function FollowListPage({ kind }: { kind: FollowListKind }) {
  const { username = '' } = useParams();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const state = followListStateFromSearch(searchParams);
  const request = followListRequestFromState(state);
  const texts = TEXTS[kind];

  useDocumentTitle(`GameLog — ${texts.label} de @${username}`);

  const profileQuery = useQuery({
    queryKey: ['profile', username, user?.username ?? null],
    queryFn: () => fetchProfile(username),
    retry: 1,
  });

  const listQuery = useQuery({
    queryKey: ['follows', kind, username, request],
    queryFn: () => fetchFollowList(kind, username, request),
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
      if (value === 'recently_followed') {
        params.delete('sort');
      } else {
        params.set('sort', value);
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

  function handleChanged() {
    void queryClient.invalidateQueries({ queryKey: ['follows'] });
  }

  const notFound =
    (profileQuery.error instanceof ApiError && profileQuery.error.status === 404) ||
    (listQuery.error instanceof ApiError && listQuery.error.status === 404);

  if (notFound) {
    return <NotFound message="Perfil não encontrado" />;
  }

  const profile = profileQuery.data;
  const page = listQuery.data;
  const isOwnProfile = profile !== undefined && user?.username === profile.username;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-4 rounded-xl border bg-card p-6">
        <Link
          to={`/jogadores/${encodeURIComponent(username)}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para o perfil
        </Link>

        {profile ? (
          <>
            <div className="flex items-center gap-4">
              <ProfileAvatar displayName={profile.displayName} avatarUrl={profile.avatarUrl} />

              <div className="flex flex-col gap-0.5">
                <p className="text-sm text-muted-foreground">{texts.label} de</p>
                <h1
                  data-testid="seguidores-titulo"
                  className="text-2xl font-semibold tracking-tight"
                >
                  {profile.displayName}
                </h1>
                <p className="font-mono text-sm text-muted-foreground">@{profile.username}</p>
              </div>
            </div>

            <nav aria-label="Relações do jogador" className="flex flex-wrap gap-4 text-sm">
              <Link
                to={followListPagePath('followers', profile.username)}
                aria-current={kind === 'followers' ? 'page' : undefined}
                className={
                  kind === 'followers'
                    ? 'font-medium underline underline-offset-4'
                    : 'text-muted-foreground underline-offset-4 hover:underline'
                }
              >
                <strong>{profile.followersCount}</strong> seguidores
              </Link>

              <Link
                to={followListPagePath('following', profile.username)}
                aria-current={kind === 'following' ? 'page' : undefined}
                className={
                  kind === 'following'
                    ? 'font-medium underline underline-offset-4'
                    : 'text-muted-foreground underline-offset-4 hover:underline'
                }
              >
                <strong>{profile.followingCount}</strong> seguindo
              </Link>
            </nav>
          </>
        ) : (
          <p className="text-muted-foreground">Carregando perfil…</p>
        )}
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{texts.label}</h2>

          <div className="flex items-center gap-2">
            <label htmlFor="ordenacao-seguidores" className="text-sm font-medium">
              Ordenar por
            </label>
            <select
              id="ordenacao-seguidores"
              name="sort"
              value={state.sort || 'recently_followed'}
              onChange={(event) => selectSort(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {FOLLOW_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {listQuery.isPending ? (
          <ul className="flex flex-col gap-3" aria-hidden>
            {Array.from({ length: 3 }, (_, index) => (
              <li
                key={index}
                data-testid="seguidores-esqueleto"
                className="flex animate-pulse items-center gap-3 rounded-xl border bg-card p-4"
              >
                <span className="size-12 shrink-0 rounded-full bg-muted" />
                <span className="flex flex-col gap-2">
                  <span className="h-4 w-32 rounded bg-muted" />
                  <span className="h-3 w-20 rounded bg-muted" />
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {listQuery.isError ? (
          <div
            role="alert"
            data-testid="seguidores-erro"
            className="flex flex-col items-center gap-3 rounded-xl border border-destructive/40 px-6 py-12 text-center"
          >
            <p className="text-sm text-destructive">{formMessageFor(listQuery.error)}</p>
            <button
              type="button"
              data-testid="tentar-novamente"
              onClick={() => void listQuery.refetch()}
              disabled={listQuery.isFetching}
              className="rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}

        {page ? (
          page.data.length === 0 ? (
            <p
              data-testid="seguidores-vazio"
              className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground"
            >
              {texts.empty}
            </p>
          ) : (
            <>
              <ul data-testid="seguidores-lista" className="flex flex-col gap-3">
                {page.data.map((item) => (
                  <FollowItemRow
                    key={item.username}
                    item={item}
                    hideButton={isOwnProfile || user?.username === item.username}
                    returnTo={followListPagePath(kind, username)}
                    onFollowed={handleChanged}
                    onUnfollowed={handleChanged}
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
      </section>
    </main>
  );
}

/** Rota `/jogadores/:username/seguidores` (seção 4 da SPEC F12). */
export function SeguidoresPage() {
  return <FollowListPage kind="followers" />;
}

/** Rota `/jogadores/:username/seguindo` (seção 4 da SPEC F12). */
export function SeguindoPage() {
  return <FollowListPage kind="following" />;
}
