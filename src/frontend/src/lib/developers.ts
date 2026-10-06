import {
  DEVELOPER_ROUTES,
  developerDetailSchema,
  developerListSchema,
  type DeveloperCreateInput,
  type DeveloperDetail,
  type DeveloperRef,
  type DeveloperUpdateInput,
} from '@gamelog/shared';

import { apiRequest } from '@/lib/api';
import { authorizedRequest } from '@/lib/auth-store';

/** Identificador de uma desenvolvedora nas rotas de detalhe (slug ou id). */
function developerDetailPath(identifier: string): string {
  return `${DEVELOPER_ROUTES.list}/${encodeURIComponent(identifier)}`;
}

/** Lista pública de desenvolvedoras (SPEC F7, seção 3) — usada pelo catálogo e pela administração. */
export async function fetchDevelopers(): Promise<DeveloperRef[]> {
  return developerListSchema.parse(await apiRequest(DEVELOPER_ROUTES.list)).data;
}

export async function fetchDeveloperDetail(identifier: string): Promise<DeveloperDetail> {
  return developerDetailSchema.parse(await apiRequest(developerDetailPath(identifier)));
}

/** Criação (ADMIN): o slug é derivado do nome quando omitido (RN-F7-03). */
export async function createDeveloper(input: DeveloperCreateInput): Promise<DeveloperDetail> {
  return developerDetailSchema.parse(
    await authorizedRequest(DEVELOPER_ROUTES.list, { method: 'POST', body: input }),
  );
}

/** Renomeação (ADMIN): somente o nome muda; o slug é imutável (RN-F7-04). */
export async function renameDeveloper(
  identifier: string,
  input: DeveloperUpdateInput,
): Promise<DeveloperDetail> {
  return developerDetailSchema.parse(
    await authorizedRequest(developerDetailPath(identifier), { method: 'PATCH', body: input }),
  );
}

/** Exclusão (ADMIN): responde `409 DEVELOPER_IN_USE` quando há jogos vinculados (RN-F7-07). */
export async function deleteDeveloper(identifier: string): Promise<void> {
  await authorizedRequest<void>(developerDetailPath(identifier), { method: 'DELETE' });
}
