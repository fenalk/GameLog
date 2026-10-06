import {
  PLATFORM_ROUTES,
  platformDetailSchema,
  platformListSchema,
  type PlatformCreateInput,
  type PlatformDetail,
  type PlatformRef,
  type PlatformUpdateInput,
} from '@gamelog/shared';

import { apiRequest } from '@/lib/api';
import { authorizedRequest } from '@/lib/auth-store';

/** Identificador de uma plataforma nas rotas de detalhe (slug ou id). */
function platformDetailPath(identifier: string): string {
  return `${PLATFORM_ROUTES.list}/${encodeURIComponent(identifier)}`;
}

/** Lista pública de plataformas (SPEC F6, seção 3) — usada pelo catálogo e pela administração. */
export async function fetchPlatforms(): Promise<PlatformRef[]> {
  return platformListSchema.parse(await apiRequest(PLATFORM_ROUTES.list)).data;
}

export async function fetchPlatformDetail(identifier: string): Promise<PlatformDetail> {
  return platformDetailSchema.parse(await apiRequest(platformDetailPath(identifier)));
}

/** Criação (ADMIN): o slug é derivado do nome quando omitido (RN-F6-03). */
export async function createPlatform(input: PlatformCreateInput): Promise<PlatformDetail> {
  return platformDetailSchema.parse(
    await authorizedRequest(PLATFORM_ROUTES.list, { method: 'POST', body: input }),
  );
}

/** Renomeação (ADMIN): somente o nome muda; o slug é imutável (RN-F6-04). */
export async function renamePlatform(
  identifier: string,
  input: PlatformUpdateInput,
): Promise<PlatformDetail> {
  return platformDetailSchema.parse(
    await authorizedRequest(platformDetailPath(identifier), { method: 'PATCH', body: input }),
  );
}

/** Exclusão (ADMIN): responde `409 PLATFORM_IN_USE` quando há jogos vinculados (RN-F6-07). */
export async function deletePlatform(identifier: string): Promise<void> {
  await authorizedRequest<void>(platformDetailPath(identifier), { method: 'DELETE' });
}
