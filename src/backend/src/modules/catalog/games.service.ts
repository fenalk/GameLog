import {
  defaultGameSort,
  GAMES_PAGE_DEFAULT,
  GAMES_PAGE_SIZE_DEFAULT,
  type GameDetail,
  type GameListItem,
  type GameListQuery,
  type GameSort,
  type GameSortOrder,
  type GamesPage,
  type GameTaxonomyRef,
} from '@gamelog/shared';

import { Prisma } from '../../generated/prisma/client.js';
import { apiErrors } from '../../lib/api-error.js';
import { prisma } from '../../lib/prisma.js';
import { parseGameIdentifier } from './game-identifier.js';

type TaxonomyRecord = { id: string; name: string; slug: string };

type GenreLink = { genre: TaxonomyRecord };
type PlatformLink = { platform: TaxonomyRecord };

type GameListItemRecord = {
  id: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  releaseDate: Date | null;
  ratingAverage: number | null;
  ratingCount: number;
  genres: GenreLink[];
  platforms: PlatformLink[];
};

/** Busca textual (RN-F3-02): os termos são separados por espaço e combinados por "e". */
function searchTermsFrom(query: string): string[] {
  return query.split(/\s+/).filter((term) => term.length > 0);
}

function searchCondition(terms: string[]): Prisma.Sql {
  const parts = terms.map(
    (term) => Prisma.sql`strpos(unaccent(lower(g.title)), unaccent(lower(${term}))) > 0`,
  );

  return Prisma.join(parts, ' AND ');
}

/**
 * Filtro por taxonomia: dentro de um mesmo filtro vale "ou" (o `IN`); slugs inexistentes
 * simplesmente não casam com nada (RN-F3-04).
 */
function taxonomyFilter(table: string, column: string, ids: string[]): Prisma.Sql {
  if (ids.length === 0) {
    return Prisma.sql`FALSE`;
  }

  return Prisma.sql`EXISTS (SELECT 1 FROM ${Prisma.raw(table)} t WHERE t.game_id = g.id AND t.${Prisma.raw(column)} IN (${Prisma.join(ids)}))`;
}

/**
 * Relevância (RN-F3-03), do melhor para o pior: título idêntico, título que começa com a
 * busca, termo que inicia uma palavra do título e demais títulos.
 */
function relevanceRank(query: string, terms: string[]): Prisma.Sql {
  const titleKey = Prisma.sql`unaccent(lower(g.title))`;
  const startsWord = Prisma.join(
    terms.map((term) => Prisma.sql`strpos(w, unaccent(lower(${term}))) = 1`),
    ' OR ',
  );

  return Prisma.sql`CASE
    WHEN ${titleKey} = unaccent(lower(${query})) THEN 0
    WHEN strpos(${titleKey}, unaccent(lower(${query}))) = 1 THEN 1
    WHEN EXISTS (
      SELECT 1 FROM unnest(regexp_split_to_array(${titleKey}, '[^a-z0-9]+')) AS w
      WHERE ${startsWord}
    ) THEN 2
    ELSE 3
  END`;
}

/**
 * Ordenação (RN-F3-05) com desempate final por título e id. Em `rating` e
 * `release_date`, jogos sem nota/sem data ficam sempre ao final.
 */
function orderByClause(
  sort: GameSort,
  order: GameSortOrder,
  query: string | undefined,
): Prisma.Sql {
  const titleKey = Prisma.sql`unaccent(lower(g.title))`;
  const direction = Prisma.raw(order === 'asc' ? 'ASC' : 'DESC');

  switch (sort) {
    case 'relevance':
      return Prisma.sql`${relevanceRank(query ?? '', searchTermsFrom(query ?? ''))} ASC, g.rating_count DESC, ${titleKey} ASC, g.id ASC`;
    case 'rating':
      return Prisma.sql`g.rating_average ${direction} NULLS LAST, ${titleKey} ASC, g.id ASC`;
    case 'title':
      return Prisma.sql`${titleKey} ${direction}, g.id ASC`;
    case 'release_date':
      return Prisma.sql`g.release_date ${direction} NULLS LAST, ${titleKey} ASC, g.id ASC`;
    case 'recently_added':
      return Prisma.sql`g.created_at ${direction}, ${titleKey} ASC, g.id ASC`;
    case 'popularity':
    default:
      return Prisma.sql`g.rating_count ${direction}, ${titleKey} ASC, g.id ASC`;
  }
}

/** Ordem padrão quando `order` não é enviado: `asc` apenas em `title` (RN-F3-05). */
function defaultGameOrder(sort: GameSort): GameSortOrder {
  return sort === 'title' ? 'asc' : 'desc';
}

/** Normaliza um parâmetro repetível (`genre=rpg&genre=acao`), removendo vazios e repetidos. */
function toSlugList(value: string | string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  const items = Array.isArray(value) ? value : [value];

  return [...new Set(items.map((item) => item.trim()).filter((item) => item.length > 0))];
}

async function genreIdsBySlug(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) {
    return [];
  }

  const rows = await prisma.genre.findMany({
    where: { slug: { in: slugs } },
    select: { id: true },
  });

  return rows.map((row) => row.id);
}

async function platformIdsBySlug(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) {
    return [];
  }

  const rows = await prisma.platform.findMany({
    where: { slug: { in: slugs } },
    select: { id: true },
  });

  return rows.map((row) => row.id);
}

async function developerIdsBySlug(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) {
    return [];
  }

  const rows = await prisma.developer.findMany({
    where: { slug: { in: slugs } },
    select: { id: true },
  });

  return rows.map((row) => row.id);
}

/** Nota com até 2 casas (RN-F3-06); `null` enquanto a F9 não existir. */
function roundRating(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

function toTaxonomyRef(item: TaxonomyRecord): GameTaxonomyRef {
  return { id: item.id, name: item.name, slug: item.slug };
}

function sortTaxonomies(items: TaxonomyRecord[]): TaxonomyRecord[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function toListItem(game: GameListItemRecord): GameListItem {
  return {
    id: game.id,
    slug: game.slug,
    title: game.title,
    coverUrl: game.coverUrl,
    releaseDate: game.releaseDate?.toISOString().slice(0, 10) ?? null,
    genres: sortTaxonomies(game.genres.map((link) => link.genre)).map(toTaxonomyRef),
    platforms: sortTaxonomies(game.platforms.map((link) => link.platform)).map(toTaxonomyRef),
    ratingAverage: roundRating(game.ratingAverage),
    ratingCount: game.ratingCount,
  };
}

/**
 * Listagem pública do catálogo (RN-F3-01 a RN-F3-08): busca, filtros, ordenação e
 * paginação no banco. A página é buscada por id (consulta constante, sem N+1) e as
 * relações são carregadas em uma única consulta por relação — o número de consultas não
 * depende do `pageSize` (CA-F3-13).
 */
export async function listGames(query: GameListQuery): Promise<GamesPage> {
  const search = query.q?.trim();

  if (query.sort === 'relevance' && !search) {
    throw apiErrors.validation('A ordenação por relevância exige uma busca (q)', [
      { field: 'sort', message: 'Use sort=relevance apenas com o parâmetro q' },
    ]);
  }

  const sort = query.sort ?? defaultGameSort(Boolean(search));
  const order = query.order ?? defaultGameOrder(sort);
  const page = query.page ?? GAMES_PAGE_DEFAULT;
  const pageSize = query.pageSize ?? GAMES_PAGE_SIZE_DEFAULT;

  const genreSlugs = toSlugList(query.genre);
  const platformSlugs = toSlugList(query.platform);
  const developerSlugs = toSlugList(query.developer);

  const [genreIds, platformIds, developerIds] = await Promise.all([
    genreIdsBySlug(genreSlugs),
    platformIdsBySlug(platformSlugs),
    developerIdsBySlug(developerSlugs),
  ]);

  const conditions: Prisma.Sql[] = [];

  if (search) {
    conditions.push(searchCondition(searchTermsFrom(search)));
  }

  if (genreSlugs.length > 0) {
    conditions.push(taxonomyFilter('game_genres', 'genre_id', genreIds));
  }

  if (platformSlugs.length > 0) {
    conditions.push(taxonomyFilter('game_platforms', 'platform_id', platformIds));
  }

  if (developerSlugs.length > 0) {
    conditions.push(taxonomyFilter('game_developers', 'developer_id', developerIds));
  }

  if (query.releaseYearFrom !== undefined) {
    conditions.push(Prisma.sql`EXTRACT(YEAR FROM g.release_date) >= ${query.releaseYearFrom}`);
  }

  if (query.releaseYearTo !== undefined) {
    conditions.push(Prisma.sql`EXTRACT(YEAR FROM g.release_date) <= ${query.releaseYearTo}`);
  }

  if (query.minRating !== undefined) {
    conditions.push(Prisma.sql`g.rating_average >= ${query.minRating}`);
  }

  const where =
    conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

  const [countRows, pageRows] = await Promise.all([
    prisma.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS total FROM games g ${where}`,
    ),
    prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT g.id FROM games g ${where} ORDER BY ${orderByClause(sort, order, search)} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    ),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const ids = pageRows.map((row) => row.id);

  const games =
    ids.length === 0
      ? []
      : await prisma.game.findMany({
          where: { id: { in: ids } },
          include: {
            genres: { select: { genre: { select: { id: true, name: true, slug: true } } } },
            platforms: { select: { platform: { select: { id: true, name: true, slug: true } } } },
          },
        });

  const byId = new Map(games.map((game) => [game.id, game]));
  const data: GameListItem[] = [];

  for (const id of ids) {
    const game = byId.get(id);

    if (game) {
      data.push(toListItem(game));
    }
  }

  return {
    data,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

/** Detalhe público de um jogo (RN-F3-07); `404 NOT_FOUND` quando não existir. */
export async function getGameDetail(rawIdentifier: string): Promise<GameDetail> {
  const identifier = parseGameIdentifier(rawIdentifier);

  const game = await prisma.game.findUnique({
    where: identifier.kind === 'id' ? { id: identifier.value } : { slug: identifier.value },
    include: {
      genres: { select: { genre: { select: { id: true, name: true, slug: true } } } },
      platforms: { select: { platform: { select: { id: true, name: true, slug: true } } } },
      developers: { select: { developer: { select: { id: true, name: true, slug: true } } } },
    },
  });

  if (!game) {
    throw apiErrors.notFound('Jogo não encontrado');
  }

  // `reviewCount` (RN-F10-15) conta apenas as resenhas publicadas do jogo.
  const reviewCount = await prisma.review.count({
    where: { gameId: game.id, status: 'PUBLISHED' },
  });

  return {
    ...toListItem(game),
    description: game.description,
    developers: sortTaxonomies(game.developers.map((link) => link.developer)).map(toTaxonomyRef),
    reviewCount,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  };
}
