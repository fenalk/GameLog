import type { GameLogEntry } from '@gamelog/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { CatalogError } from '@/components/catalog-feedback';
import { GameLogCard } from '@/components/game-log-card';
import { GameLogFormDialog } from '@/components/game-log-form';
import { GameCover } from '@/components/game-card';
import { ConfirmDialog } from '@/components/modal';
import { NotFound } from '@/components/not-found';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { fetchGameDetail, formatRating, formatReleaseDate, gamePagePath } from '@/lib/catalog';
import { useDocumentTitle } from '@/lib/document-title';
import { formMessageFor } from '@/lib/forms';
import { deleteMyGameLog, fetchMyGameLog } from '@/lib/game-logs';

/** Ações do jogador entregues pelas SPECs posteriores (F9–F11), ainda sem conteúdo. */
const RESERVED_ACTIONS = [
  { label: 'Avaliar', spec: 'F9' },
  { label: 'Escrever resenha', spec: 'F10' },
  { label: 'Adicionar a lista', spec: 'F11' },
] as const;

function GameTaxonomyLink({ slug, name, param }: { slug: string; name: string; param: string }) {
  return (
    <Link
      to={`/jogos?${param}=${encodeURIComponent(slug)}`}
      className="rounded-full border px-3 py-1 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      {name}
    </Link>
  );
}

/**
 * Página de detalhe do jogo `/jogos/:slug` (seção 5 da SPEC F3 e seção 4 da SPEC F8):
 * capa, dados de lançamento, taxonomias, descrição, nota e o diário do jogador — com o
 * formulário de registro, o cartão "No seu diário" (editar/remover) e o convite de login
 * para o visitante.
 */
export function JogoPage() {
  const { slug } = useParams();
  const { status: authStatus } = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['catalog', 'game', slug],
    queryFn: () => fetchGameDetail(slug ?? ''),
    enabled: Boolean(slug),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });

  const entryKey = ['diary', 'entry', slug];

  const entryQuery = useQuery({
    queryKey: entryKey,
    queryFn: () => fetchMyGameLog(slug ?? ''),
    enabled: authStatus === 'authenticated' && Boolean(slug),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });

  useDocumentTitle(query.data ? `${query.data.title} · GameLog` : 'Jogo · GameLog');

  if (!slug) {
    return <NotFound message="Jogo não encontrado" />;
  }

  if (query.isPending) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <p className="text-muted-foreground">Carregando jogo…</p>
      </main>
    );
  }

  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <NotFound message="Jogo não encontrado" />;
    }

    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <CatalogError
          message={formMessageFor(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </main>
    );
  }

  const game = query.data;
  const entry: GameLogEntry | null = entryQuery.data ?? null;
  // `404` é o estado esperado de "sem registro" (RN-F8-07); só outras falhas viram erro.
  const entryFailed =
    entryQuery.isError &&
    !(entryQuery.error instanceof ApiError && entryQuery.error.status === 404);
  const returnTo = gamePagePath(game.slug);

  function handleSaved(saved: GameLogEntry) {
    setFormOpen(false);
    queryClient.setQueryData(entryKey, saved);
    void queryClient.invalidateQueries({ queryKey: ['diary', 'list'] });
  }

  async function handleRemove() {
    setRemoving(true);
    setActionError(null);

    try {
      await deleteMyGameLog(game.slug);
      setConfirming(false);
      queryClient.setQueryData(entryKey, null);
      void queryClient.invalidateQueries({ queryKey: ['diary', 'list'] });
    } catch (error) {
      setActionError(formMessageFor(error));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <article className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="w-48 shrink-0 self-center sm:self-start">
          <GameCover title={game.title} coverUrl={game.coverUrl} />
        </div>

        <div className="flex flex-1 flex-col gap-4">
          <header className="flex flex-col gap-1">
            <h1
              data-testid="jogo-titulo"
              className="text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              {game.title}
            </h1>
            <p data-testid="jogo-lancamento" className="text-sm text-muted-foreground">
              {formatReleaseDate(game.releaseDate)}
            </p>
            <p data-testid="jogo-nota" className="text-sm font-medium">
              {game.ratingAverage === null
                ? 'Sem avaliações ainda'
                : `★ ${formatRating(game.ratingAverage)} · ${game.ratingCount} avaliações`}
            </p>
          </header>

          {game.description ? (
            <p data-testid="jogo-descricao" className="text-sm leading-relaxed whitespace-pre-line">
              {game.description}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Gêneros:</span>
              {game.genres.length === 0 ? (
                <span className="text-muted-foreground">não informado</span>
              ) : (
                game.genres.map((genre) => (
                  <GameTaxonomyLink
                    key={genre.id}
                    slug={genre.slug}
                    name={genre.name}
                    param="genre"
                  />
                ))
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Plataformas:</span>
              {game.platforms.length === 0 ? (
                <span className="text-muted-foreground">não informado</span>
              ) : (
                game.platforms.map((platform) => (
                  <GameTaxonomyLink
                    key={platform.id}
                    slug={platform.slug}
                    name={platform.name}
                    param="platform"
                  />
                ))
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Desenvolvedoras:</span>
              {game.developers.length === 0 ? (
                <span className="text-muted-foreground">não informado</span>
              ) : (
                game.developers.map((developer) => (
                  <GameTaxonomyLink
                    key={developer.id}
                    slug={developer.slug}
                    name={developer.name}
                    param="developer"
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </article>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-medium">Suas ações neste jogo</h2>

        {authStatus === 'loading' ? (
          <p className="text-sm text-muted-foreground">Carregando sua sessão…</p>
        ) : null}

        {authStatus === 'anonymous' ? (
          <>
            <p className="text-sm text-muted-foreground">
              Entre na sua conta para registrar este jogo no seu diário.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/entrar?returnTo=${encodeURIComponent(returnTo)}`}
                data-testid="diario-entrar"
                className="rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Adicionar ao diário
              </Link>
            </div>
          </>
        ) : null}

        {authStatus === 'authenticated' && entry ? (
          <GameLogCard
            entry={entry}
            onEdit={() => setFormOpen(true)}
            onRemove={() => setConfirming(true)}
          />
        ) : null}

        {authStatus === 'authenticated' && !entry && entryQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Carregando seu diário…</p>
        ) : null}

        {authStatus === 'authenticated' && !entry && entryFailed ? (
          <>
            <p role="alert" className="text-sm text-destructive">
              {formMessageFor(entryQuery.error)}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="diario-tentar-novamente"
                onClick={() => void entryQuery.refetch()}
                disabled={entryQuery.isFetching}
                className="rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
              >
                Tentar novamente
              </button>
            </div>
          </>
        ) : null}

        {authStatus === 'authenticated' && !entry && !entryQuery.isPending && !entryFailed ? (
          <>
            <p className="text-sm text-muted-foreground">
              Você ainda não registrou este jogo. Adicione-o ao diário para acompanhar status, datas
              e tempo jogado.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="diario-adicionar"
                onClick={() => setFormOpen(true)}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Adicionar ao diário
              </button>
            </div>
          </>
        ) : null}

        <p className="text-sm text-muted-foreground">
          Avaliação, resenha e listas chegam nas próximas funcionalidades.
        </p>

        <div className="flex flex-wrap gap-2">
          {RESERVED_ACTIONS.map((action) =>
            authStatus === 'authenticated' ? (
              <button
                key={action.label}
                type="button"
                disabled
                title={`Chega na funcionalidade ${action.spec}`}
                className="rounded-md border px-3 py-1.5 text-sm opacity-60"
              >
                {action.label}
              </button>
            ) : (
              <Link
                key={action.label}
                to={`/entrar?returnTo=${encodeURIComponent(returnTo)}`}
                title={`Chega na funcionalidade ${action.spec}`}
                className="rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {action.label}
              </Link>
            ),
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-dashed p-4">
        <h2 className="text-lg font-medium">Jogos semelhantes</h2>
        <p className="text-sm text-muted-foreground">Em breve (F13).</p>
      </section>

      {formOpen ? (
        <GameLogFormDialog
          game={{ slug: game.slug, title: game.title }}
          entry={entry}
          platforms={game.platforms}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title="Remover do diário"
          message={`Remover "${game.title}" do seu diário? Esta ação não pode ser desfeita.`}
          confirmLabel="Remover"
          busy={removing}
          error={actionError ?? undefined}
          onConfirm={() => void handleRemove()}
          onCancel={() => {
            setConfirming(false);
            setActionError(null);
          }}
        />
      ) : null}
    </main>
  );
}
