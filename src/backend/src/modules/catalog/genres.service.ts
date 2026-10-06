import {
  deriveSlug,
  ERROR_CODES,
  GENRE_SLUG_MAX_LENGTH,
  normalizeTaxonomyName,
  type GenreCreateInput,
  type GenreDetail,
  type GenreList,
  type GenreRef,
  type GenreUpdateInput,
} from '@gamelog/shared';

import { apiErrors } from '../../lib/api-error.js';
import { parseIdentifier } from '../../lib/identifier.js';
import { prisma } from '../../lib/prisma.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';

/** Campos do gênero nas leituras públicas, com a contagem de jogos (RN-F5-08). */
const GENRE_SELECT = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { games: true } },
} as const;

type GenreRecord = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { games: number };
};

/** Ordenação por nome em pt-BR ignorando caixa, com desempate por `slug` (RN-F5-08). */
const byName = new Intl.Collator('pt-BR', { sensitivity: 'base' });

function toGenreRef(genre: GenreRecord): GenreRef {
  return {
    id: genre.id,
    name: genre.name,
    slug: genre.slug,
    gameCount: genre._count.games,
  };
}

function toGenreDetail(genre: GenreRecord): GenreDetail {
  return {
    ...toGenreRef(genre),
    createdAt: genre.createdAt.toISOString(),
    updatedAt: genre.updatedAt.toISOString(),
  };
}

/** Resolve `:genre` (slug ou id) ou responde `404 NOT_FOUND` (RN-F5-09). */
async function findGenreOrFail(rawIdentifier: string): Promise<GenreRecord> {
  const identifier = parseIdentifier(rawIdentifier);

  const genre = await prisma.genre.findUnique({
    where: identifier.kind === 'id' ? { id: identifier.value } : { slug: identifier.value },
    select: GENRE_SELECT,
  });

  if (!genre) {
    throw apiErrors.notFound('Gênero não encontrado');
  }

  return genre;
}

/** Converte a violação de unicidade de uma corrida no código de domínio correto (RN-F5-05). */
function conflictFromUniqueViolation(error: unknown): unknown {
  if (isUniqueViolation(error, 'name_normalized')) {
    throw apiErrors.conflict(ERROR_CODES.genreNameTaken, 'Já existe um gênero com este nome');
  }

  if (isUniqueViolation(error, 'slug')) {
    throw apiErrors.conflict(
      ERROR_CODES.genreSlugTaken,
      'Já existe um gênero com este identificador',
    );
  }

  return error;
}

async function assertNameAvailable(nameNormalized: string, exceptId?: string): Promise<void> {
  const existing = await prisma.genre.findUnique({
    where: { nameNormalized },
    select: { id: true },
  });

  if (existing && existing.id !== exceptId) {
    throw apiErrors.conflict(ERROR_CODES.genreNameTaken, 'Já existe um gênero com este nome');
  }
}

async function assertSlugAvailable(slug: string): Promise<void> {
  const existing = await prisma.genre.findUnique({ where: { slug }, select: { id: true } });

  if (existing) {
    throw apiErrors.conflict(
      ERROR_CODES.genreSlugTaken,
      'Já existe um gênero com este identificador',
    );
  }
}

/** Lista pública completa, ordenada por nome (RN-F5-08) — uma única consulta (RN-F5-10). */
export async function listGenres(): Promise<GenreList> {
  const genres = await prisma.genre.findMany({ select: GENRE_SELECT });

  return {
    data: genres
      .map(toGenreRef)
      .sort((a, b) => byName.compare(a.name, b.name) || a.slug.localeCompare(b.slug)),
  };
}

/** Detalhe público por slug ou id (RN-F5-09). */
export async function getGenreDetail(rawIdentifier: string): Promise<GenreDetail> {
  return toGenreDetail(await findGenreOrFail(rawIdentifier));
}

/**
 * Criação (RN-F5-03 a RN-F5-06): o slug informado é respeitado; quando omitido, é
 * derivado do nome. Nome e slug são únicos, com a unicidade do nome ignorando caixa e
 * acentos (RN-F5-02).
 */
export async function createGenre(input: GenreCreateInput): Promise<GenreDetail> {
  const slug = input.slug ?? deriveSlug(input.name, GENRE_SLUG_MAX_LENGTH);

  if (slug.length === 0) {
    throw apiErrors.validation('Não foi possível derivar o identificador a partir do nome', [
      {
        field: 'name',
        message: 'Informe um nome com letras ou números, ou um identificador explícito',
      },
    ]);
  }

  const nameNormalized = normalizeTaxonomyName(input.name);

  await assertNameAvailable(nameNormalized);
  await assertSlugAvailable(slug);

  try {
    const genre = await prisma.genre.create({
      data: { name: input.name, nameNormalized, slug },
      select: GENRE_SELECT,
    });

    return toGenreDetail(genre);
  } catch (error) {
    throw conflictFromUniqueViolation(error);
  }
}

/**
 * Renomeação (RN-F5-04 e RN-F5-06): preserva `slug` e `createdAt`; um nome equivalente ao
 * atual é aceito sem alteração efetiva (`updatedAt` não muda).
 */
export async function updateGenre(
  rawIdentifier: string,
  input: GenreUpdateInput,
): Promise<GenreDetail> {
  const existing = await findGenreOrFail(rawIdentifier);
  const nameNormalized = normalizeTaxonomyName(input.name);

  if (normalizeTaxonomyName(existing.name) === nameNormalized) {
    return toGenreDetail(existing);
  }

  await assertNameAvailable(nameNormalized, existing.id);

  try {
    const updated = await prisma.genre.update({
      where: { id: existing.id },
      data: { name: input.name, nameNormalized },
      select: GENRE_SELECT,
    });

    return toGenreDetail(updated);
  } catch (error) {
    throw conflictFromUniqueViolation(error);
  }
}

/**
 * Exclusão (RN-F5-07): somente quando não há jogos vinculados (`409 GENRE_IN_USE`). O
 * filtro relacional evita remover vínculos em corrida com a F4.
 */
export async function deleteGenre(rawIdentifier: string): Promise<void> {
  const genre = await findGenreOrFail(rawIdentifier);

  const deleted = await prisma.genre.deleteMany({
    where: { id: genre.id, games: { none: {} } },
  });

  if (deleted.count > 0) {
    return;
  }

  const links = await prisma.gameGenre.count({ where: { genreId: genre.id } });

  if (links > 0) {
    const games = links === 1 ? '1 jogo' : `${links} jogos`;

    throw apiErrors.conflict(
      ERROR_CODES.genreInUse,
      `Este gênero está vinculado a ${games} e não pode ser excluído. Remova os vínculos antes de tentar novamente.`,
    );
  }

  // Corrida: o gênero foi removido entre a leitura e a exclusão.
  throw apiErrors.notFound('Gênero não encontrado');
}
