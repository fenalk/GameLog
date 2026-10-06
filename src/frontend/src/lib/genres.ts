import {
  GENRE_ROUTES,
  genreDetailSchema,
  genreListSchema,
  type GenreCreateInput,
  type GenreDetail,
  type GenreRef,
  type GenreUpdateInput,
} from '@gamelog/shared';

import { apiRequest } from '@/lib/api';
import { authorizedRequest } from '@/lib/auth-store';

/** Identificador de um gênero nas rotas de detalhe (slug ou id). */
function genreDetailPath(identifier: string): string {
  return `${GENRE_ROUTES.list}/${encodeURIComponent(identifier)}`;
}

/** Lista pública de gêneros (SPEC F5, seção 3) — usada pelo catálogo e pela administração. */
export async function fetchGenres(): Promise<GenreRef[]> {
  return genreListSchema.parse(await apiRequest(GENRE_ROUTES.list)).data;
}

export async function fetchGenreDetail(identifier: string): Promise<GenreDetail> {
  return genreDetailSchema.parse(await apiRequest(genreDetailPath(identifier)));
}

/** Criação (ADMIN): o slug é derivado do nome quando omitido (RN-F5-03). */
export async function createGenre(input: GenreCreateInput): Promise<GenreDetail> {
  return genreDetailSchema.parse(
    await authorizedRequest(GENRE_ROUTES.list, { method: 'POST', body: input }),
  );
}

/** Renomeação (ADMIN): somente o nome muda; o slug é imutável (RN-F5-04). */
export async function renameGenre(
  identifier: string,
  input: GenreUpdateInput,
): Promise<GenreDetail> {
  return genreDetailSchema.parse(
    await authorizedRequest(genreDetailPath(identifier), { method: 'PATCH', body: input }),
  );
}

/** Exclusão (ADMIN): responde `409 GENRE_IN_USE` quando há jogos vinculados (RN-F5-07). */
export async function deleteGenre(identifier: string): Promise<void> {
  await authorizedRequest<void>(genreDetailPath(identifier), { method: 'DELETE' });
}
