import {
  GAME_LOG_PAGE_SIZE_DEFAULT,
  GAME_LOG_ROUTES,
  gameLogEntryPath,
  gameLogEntrySchema,
  gameLogPageSchema,
  gameLogPublicPath,
  gameLogStatusSchema,
  type GameLogEntry,
  type GameLogEntryInput,
  type GameLogEntryUpdateInput,
  type GameLogPage,
  type GameLogSort,
  type GameLogSortOrder,
  type GameLogStatus,
} from '@gamelog/shared';

import { apiRequest } from '@/lib/api';
import { authorizedRequest } from '@/lib/auth-store';

/**
 * Cliente do diário (SPEC F8, seção 3): escrita e leitura do próprio diário exigem
 * sessão (`authorizedRequest`, com renovação transparente), enquanto o diário público é
 * lido sem autenticação.
 */

export type DiaryRequest = {
  statuses?: GameLogStatus[];
  sort?: GameLogSort | undefined;
  order?: GameLogSortOrder | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
};

/** Monta a query string da listagem (o filtro `status` é repetível). */
export function diaryQueryString(request: DiaryRequest): string {
  const params = new URLSearchParams();

  for (const status of request.statuses ?? []) {
    params.append('status', status);
  }

  if (request.sort) {
    params.set('sort', request.sort);
  }

  if (request.order) {
    params.set('order', request.order);
  }

  if (request.page !== undefined && request.page > 1) {
    params.set('page', String(request.page));
  }

  if (request.pageSize !== undefined) {
    params.set('pageSize', String(request.pageSize));
  }

  const query = params.toString();

  return query ? `?${query}` : '';
}

/** Diário próprio (autenticado) — RN-F8-08. */
export async function fetchMyDiary(request: DiaryRequest): Promise<GameLogPage> {
  return gameLogPageSchema.parse(
    await authorizedRequest(`${GAME_LOG_ROUTES.myDiary}${diaryQueryString(request)}`),
  );
}

/** Diário público de um jogador (sem autenticação) — RN-F8-09. */
export async function fetchPublicDiary(
  username: string,
  request: DiaryRequest,
): Promise<GameLogPage> {
  return gameLogPageSchema.parse(
    await apiRequest(`${gameLogPublicPath(username)}${diaryQueryString(request)}`),
  );
}

/** Registro do usuário para o jogo (`:game` aceita slug ou id); `404` quando não existe. */
export async function fetchMyGameLog(identifier: string): Promise<GameLogEntry> {
  return gameLogEntrySchema.parse(await authorizedRequest(gameLogEntryPath(identifier)));
}

/** Criação/substituição completa do registro — RN-F8-02. */
export async function saveMyGameLog(
  identifier: string,
  input: GameLogEntryInput,
): Promise<GameLogEntry> {
  return gameLogEntrySchema.parse(
    await authorizedRequest(gameLogEntryPath(identifier), { method: 'PUT', body: input }),
  );
}

/** Edição parcial do registro — RN-F8-02. */
export async function updateMyGameLog(
  identifier: string,
  input: GameLogEntryUpdateInput,
): Promise<GameLogEntry> {
  return gameLogEntrySchema.parse(
    await authorizedRequest(gameLogEntryPath(identifier), { method: 'PATCH', body: input }),
  );
}

export async function deleteMyGameLog(identifier: string): Promise<void> {
  await authorizedRequest<void>(gameLogEntryPath(identifier), { method: 'DELETE' });
}

/** Estado do diário refletido na URL do perfil (`/jogadores/:username`). */
export type DiaryUrlState = {
  statuses: GameLogStatus[];
  page: number;
};

export function diaryStateFromSearch(search: URLSearchParams): DiaryUrlState {
  const statuses: GameLogStatus[] = [];

  for (const value of search.getAll('status')) {
    const parsed = gameLogStatusSchema.safeParse(value.trim().toUpperCase());

    if (parsed.success && !statuses.includes(parsed.data)) {
      statuses.push(parsed.data);
    }
  }

  const page = Number(search.get('page'));

  return { statuses, page: Number.isInteger(page) && page > 1 ? page : 1 };
}

/** Traduz o estado da URL para os parâmetros da API, com os padrões da SPEC F8. */
export function diaryRequestFromState(
  state: DiaryUrlState,
  pageSize: number = GAME_LOG_PAGE_SIZE_DEFAULT,
): DiaryRequest {
  return {
    statuses: state.statuses,
    sort: 'recently_updated',
    page: state.page,
    pageSize,
  };
}
