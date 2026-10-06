import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { MIN_RATINGS_FOR_RANKING, type GameListItem } from '@gamelog/shared';

import { CatalogEmpty, CatalogError, GameCardSkeletons } from '@/components/catalog-feedback';
import { GameCard, GameCardGrid } from '@/components/game-card';
import { fetchGames } from '@/lib/catalog';
import { useDocumentTitle } from '@/lib/document-title';
import { formMessageFor } from '@/lib/forms';

const SECTION_SIZE = 6;
/** Jogos consultados antes de aplicar o mínimo de avaliações do destaque (RN-F3-09). */
const RANKING_FETCH_SIZE = 20;

function HighlightSection({
  title,
  testId,
  games,
  isPending,
  error,
  isFetching,
  onRetry,
  emptyMessage,
}: {
  title: string;
  testId: string;
  games: GameListItem[] | undefined;
  isPending: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
  emptyMessage: string;
}) {
  return (
    <section data-testid={testId} aria-label={title} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-medium">{title}</h2>
        <Link
          to="/jogos"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Ver catálogo
        </Link>
      </div>

      {isPending ? <GameCardSkeletons count={4} /> : null}

      {!isPending && error ? (
        <CatalogError message={formMessageFor(error)} onRetry={onRetry} retrying={isFetching} />
      ) : null}

      {games && games.length === 0 ? <CatalogEmpty message={emptyMessage} /> : null}

      {games && games.length > 0 ? (
        <GameCardGrid>
          {games.map((game) => (
            <li key={game.id}>
              <GameCard game={game} />
            </li>
          ))}
        </GameCardGrid>
      ) : null}
    </section>
  );
}

/**
 * Home `/` (seção 5 da SPEC F3): busca em destaque e três grades — adicionados
 * recentemente, mais bem avaliados (RN-F3-09) e mais avaliados.
 */
export function HomePage() {
  useDocumentTitle('GameLog — catálogo de jogos');
  const navigate = useNavigate();
  const [term, setTerm] = useState('');

  const recent = useQuery({
    queryKey: ['home', 'recently-added'],
    queryFn: () => fetchGames({ sort: 'recently_added', order: 'desc', pageSize: SECTION_SIZE }),
    retry: 1,
  });

  const topRated = useQuery({
    queryKey: ['home', 'top-rated'],
    queryFn: () => fetchGames({ sort: 'rating', order: 'desc', pageSize: RANKING_FETCH_SIZE }),
    retry: 1,
  });

  const popular = useQuery({
    queryKey: ['home', 'popular'],
    queryFn: () => fetchGames({ sort: 'popularity', order: 'desc', pageSize: SECTION_SIZE }),
    retry: 1,
  });

  const topRatedGames = topRated.data?.data
    .filter((game) => game.ratingCount >= MIN_RATINGS_FOR_RANKING)
    .slice(0, SECTION_SIZE);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = term.trim();

    navigate(query.length > 0 ? `/jogos?q=${encodeURIComponent(query)}` : '/jogos');
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">GameLog</h1>
        <p className="max-w-xl text-muted-foreground">
          Descubra jogos, acompanhe o que você já jogou e veja a opinião de outros jogadores.
        </p>

        <form
          role="search"
          onSubmit={handleSubmit}
          className="flex w-full max-w-xl items-center gap-2"
        >
          <label htmlFor="busca-home" className="sr-only">
            Buscar jogos
          </label>
          <input
            id="busca-home"
            name="q"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Buscar jogos pelo título"
            autoComplete="off"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Buscar
          </button>
        </form>
      </header>

      <HighlightSection
        title="Adicionados recentemente"
        testId="destaque-recentes"
        games={recent.data?.data}
        isPending={recent.isPending}
        error={recent.error}
        isFetching={recent.isFetching}
        onRetry={() => void recent.refetch()}
        emptyMessage="O catálogo ainda não tem jogos."
      />

      <HighlightSection
        title="Mais bem avaliados"
        testId="destaque-melhores"
        games={topRatedGames}
        isPending={topRated.isPending}
        error={topRated.error}
        isFetching={topRated.isFetching}
        onRetry={() => void topRated.refetch()}
        emptyMessage="Ainda não há jogos com avaliações suficientes."
      />

      <HighlightSection
        title="Mais avaliados"
        testId="destaque-populares"
        games={popular.data?.data}
        isPending={popular.isPending}
        error={popular.error}
        isFetching={popular.isFetching}
        onRetry={() => void popular.refetch()}
        emptyMessage="O catálogo ainda não tem jogos."
      />
    </main>
  );
}
