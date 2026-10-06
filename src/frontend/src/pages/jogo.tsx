import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';

import { CatalogError } from '@/components/catalog-feedback';
import { GameCover } from '@/components/game-card';
import { NotFound } from '@/components/not-found';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { fetchGameDetail, formatRating, formatReleaseDate, gamePagePath } from '@/lib/catalog';
import { useDocumentTitle } from '@/lib/document-title';
import { formMessageFor } from '@/lib/forms';

/** Ações do jogador entregues pelas SPECs posteriores (F8–F11), ainda sem conteúdo. */
const RESERVED_ACTIONS = [
  { label: 'Registrar no diário', spec: 'F8' },
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
 * Página de detalhe do jogo `/jogos/:slug` (seção 5 da SPEC F3): capa, dados de
 * lançamento, taxonomias, descrição, nota e os pontos de extensão das ações de jogador.
 */
export function JogoPage() {
  const { slug } = useParams();
  const { status } = useAuth();

  const query = useQuery({
    queryKey: ['catalog', 'game', slug],
    queryFn: () => fetchGameDetail(slug ?? ''),
    enabled: Boolean(slug),
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
  const returnTo = gamePagePath(game.slug);

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

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-medium">Suas ações neste jogo</h2>
        <p className="text-sm text-muted-foreground">
          {status === 'authenticated'
            ? 'Os recursos de diário, avaliação, resenha e listas chegam nas próximas funcionalidades.'
            : 'Entre na sua conta para registrar, avaliar e criar listas com este jogo.'}
        </p>

        <div className="flex flex-wrap gap-2">
          {RESERVED_ACTIONS.map((action) =>
            status === 'authenticated' ? (
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
    </main>
  );
}
