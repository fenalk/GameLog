import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { CatalogEmpty, CatalogError, GameCardSkeletons } from '@/components/catalog-feedback';
import { GameCard, GameCardGrid } from '@/components/game-card';
import { Pagination } from '@/components/pagination';
import {
  catalogRequestFromState,
  catalogStateFromSearch,
  fetchFilterOptions,
  fetchGames,
} from '@/lib/catalog';
import { useDocumentTitle } from '@/lib/document-title';
import { formMessageFor } from '@/lib/forms';

/** Atraso do debounce da busca (seção 5 da SPEC F3). */
const SEARCH_DEBOUNCE_MS = 300;
/** Mínimo de caracteres para disparar a busca (seção 5 da SPEC F3). */
const SEARCH_MIN_LENGTH = 2;
const SKELETON_COUNT = 8;

const SORT_OPTIONS = [
  { value: '', label: 'Padrão' },
  { value: 'relevance', label: 'Relevância' },
  { value: 'popularity', label: 'Mais avaliados' },
  { value: 'rating', label: 'Melhor nota' },
  { value: 'title', label: 'Título' },
  { value: 'release_date', label: 'Lançamento' },
  { value: 'recently_added', label: 'Adicionados recentemente' },
] as const;

const RATING_OPTIONS = [
  { value: '', label: 'Qualquer nota' },
  { value: '3', label: '3 ou mais' },
  { value: '4', label: '4 ou mais' },
  { value: '4.5', label: '4,5 ou mais' },
] as const;

/**
 * Campo de busca com debounce de 300 ms (seção 5 da SPEC F3). O componente é remontado
 * quando a busca confirmada muda (via `key` no pai), então o rascunho nunca fica
 * dessincronizado da URL — inclusive no botão "voltar" do navegador.
 */
function SearchInput({
  committed,
  onCommit,
}: {
  committed: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(committed);

  useEffect(() => {
    const value = draft.trim();

    if (value === committed) {
      return;
    }

    const timer = window.setTimeout(() => onCommit(value), SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [draft, committed, onCommit]);

  return (
    <input
      id="busca-catalogo"
      name="q"
      type="search"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      placeholder="Digite ao menos 2 caracteres"
      autoComplete="off"
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    />
  );
}

function FilterCheckbox({
  name,
  value,
  label,
  checked,
  onChange,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded border-input accent-foreground"
      />
      {label}
    </label>
  );
}

/**
 * Catálogo público `/jogos` (seção 5 da SPEC F3): busca com debounce, filtros, ordenação
 * e paginação, com todo o estado sincronizado na URL.
 */
export function CatalogoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = catalogStateFromSearch(searchParams);

  useDocumentTitle(state.q ? `Busca: ${state.q} · GameLog` : 'Catálogo · GameLog');

  const updateParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          mutate(params);
          return params;
        },
        // Atualização síncrona: o estado dos controles reflete o clique imediatamente.
        { replace: true, flushSync: true },
      );
    },
    [setSearchParams],
  );

  // Busca confirmada (após o debounce): aplicada a partir de 2 caracteres (seção 5).
  const commitSearch = useCallback(
    (value: string) => {
      updateParams((params) => {
        if (value.length >= SEARCH_MIN_LENGTH) {
          params.set('q', value);
        } else {
          params.delete('q');
        }

        params.delete('page');
      });
    },
    [updateParams],
  );

  const request = catalogRequestFromState(state);

  const gamesQuery = useQuery({
    queryKey: ['catalog', 'games', request],
    queryFn: () => fetchGames(request),
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const optionsQuery = useQuery({
    queryKey: ['catalog', 'filter-options'],
    queryFn: fetchFilterOptions,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  function toggleFilter(key: 'genre' | 'platform', slug: string, checked: boolean) {
    updateParams((params) => {
      const values = params.getAll(key).filter((value) => value !== slug);

      if (checked) {
        values.push(slug);
      }

      params.delete(key);

      for (const value of values) {
        params.append(key, value);
      }

      params.delete('page');
    });
  }

  function setParam(key: string, value: string) {
    updateParams((params) => {
      if (value.length > 0) {
        params.set(key, value);
      } else {
        params.delete(key);
      }

      params.delete('page');
    });
  }

  function clearFilters() {
    updateParams((params) => {
      params.delete('genre');
      params.delete('platform');
      params.delete('releaseYearFrom');
      params.delete('releaseYearTo');
      params.delete('minRating');
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

    window.scrollTo({ top: 0 });
  }

  const page = gamesQuery.data;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Catálogo</h1>
        <p className="text-sm text-muted-foreground">
          Pesquise por título e refine por gênero, plataforma, ano e nota.
        </p>
      </header>

      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="busca-catalogo" className="text-sm font-medium">
            Buscar jogos
          </label>
          <SearchInput key={state.q} committed={state.q} onCommit={commitSearch} />
        </div>

        <div className="flex flex-wrap items-end gap-4 text-sm">
          <div className="flex flex-col gap-1">
            <label htmlFor="ordenar-por" className="font-medium">
              Ordenar por
            </label>
            <select
              id="ordenar-por"
              name="sort"
              value={state.sort}
              onChange={(event) => setParam('sort', event.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5"
            >
              {SORT_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={option.value === 'relevance' && state.q.trim().length === 0}
                >
                  {option.value === ''
                    ? `Padrão (${state.q.trim() ? 'Relevância' : 'Popularidade'})`
                    : option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="ordem" className="font-medium">
              Ordem
            </label>
            <select
              id="ordem"
              name="order"
              value={state.order}
              onChange={(event) => setParam('order', event.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5"
            >
              <option value="">Padrão</option>
              <option value="asc">Crescente</option>
              <option value="desc">Decrescente</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="nota-minima" className="font-medium">
              Nota mínima
            </label>
            <select
              id="nota-minima"
              name="minRating"
              value={state.minRating}
              onChange={(event) => setParam('minRating', event.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5"
            >
              {RATING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="ano-de" className="font-medium">
              Ano (de)
            </label>
            <input
              id="ano-de"
              name="releaseYearFrom"
              type="number"
              inputMode="numeric"
              key={`releaseYearFrom-${state.releaseYearFrom}`}
              defaultValue={state.releaseYearFrom}
              onBlur={(event) => setParam('releaseYearFrom', event.target.value)}
              className="w-24 rounded-md border border-input bg-background px-2 py-1.5"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="ano-ate" className="font-medium">
              Ano (até)
            </label>
            <input
              id="ano-ate"
              name="releaseYearTo"
              type="number"
              inputMode="numeric"
              key={`releaseYearTo-${state.releaseYearTo}`}
              defaultValue={state.releaseYearTo}
              onBlur={(event) => setParam('releaseYearTo', event.target.value)}
              className="w-24 rounded-md border border-input bg-background px-2 py-1.5"
            />
          </div>

          <button
            type="button"
            data-testid="limpar-filtros"
            onClick={clearFilters}
            className="rounded-md border px-3 py-1.5 transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Limpar filtros
          </button>
        </div>

        {optionsQuery.data ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Gêneros</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {optionsQuery.data.genres.map((genre) => (
                  <FilterCheckbox
                    key={genre.slug}
                    name="genero"
                    value={genre.slug}
                    label={genre.name}
                    checked={state.genres.includes(genre.slug)}
                    onChange={(checked) => toggleFilter('genre', genre.slug, checked)}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Plataformas</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {optionsQuery.data.platforms.map((platform) => (
                  <FilterCheckbox
                    key={platform.slug}
                    name="plataforma"
                    value={platform.slug}
                    label={platform.name}
                    checked={state.platforms.includes(platform.slug)}
                    onChange={(checked) => toggleFilter('platform', platform.slug, checked)}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}
      </div>

      {gamesQuery.isPending ? <GameCardSkeletons count={SKELETON_COUNT} /> : null}

      {gamesQuery.isError ? (
        <CatalogError
          message={formMessageFor(gamesQuery.error)}
          onRetry={() => void gamesQuery.refetch()}
          retrying={gamesQuery.isFetching}
        />
      ) : null}

      {page ? (
        <>
          <p data-testid="catalogo-total" className="text-sm text-muted-foreground">
            {page.meta.total === 1 ? '1 jogo encontrado' : `${page.meta.total} jogos encontrados`}
          </p>

          {page.data.length === 0 ? (
            <CatalogEmpty hint="Ajuste a busca ou os filtros e tente novamente." />
          ) : (
            <GameCardGrid>
              {page.data.map((game) => (
                <li key={game.id}>
                  <GameCard game={game} />
                </li>
              ))}
            </GameCardGrid>
          )}

          <Pagination
            page={page.meta.page}
            totalPages={page.meta.totalPages}
            onPageChange={goToPage}
          />
        </>
      ) : null}
    </main>
  );
}
