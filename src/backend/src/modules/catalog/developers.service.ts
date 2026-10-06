import {
  deriveSlug,
  DEVELOPER_SLUG_MAX_LENGTH,
  ERROR_CODES,
  normalizeTaxonomyName,
  type DeveloperCreateInput,
  type DeveloperDetail,
  type DeveloperList,
  type DeveloperRef,
  type DeveloperUpdateInput,
} from '@gamelog/shared';

import { apiErrors } from '../../lib/api-error.js';
import { parseIdentifier } from '../../lib/identifier.js';
import { prisma } from '../../lib/prisma.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';

/** Campos da desenvolvedora nas leituras públicas, com a contagem de jogos (RN-F7-08). */
const DEVELOPER_SELECT = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { games: true } },
} as const;

type DeveloperRecord = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { games: number };
};

/** Ordenação por nome em pt-BR ignorando caixa, com desempate por `slug` (RN-F7-08). */
const byName = new Intl.Collator('pt-BR', { sensitivity: 'base' });

function toDeveloperRef(developer: DeveloperRecord): DeveloperRef {
  return {
    id: developer.id,
    name: developer.name,
    slug: developer.slug,
    gameCount: developer._count.games,
  };
}

function toDeveloperDetail(developer: DeveloperRecord): DeveloperDetail {
  return {
    ...toDeveloperRef(developer),
    createdAt: developer.createdAt.toISOString(),
    updatedAt: developer.updatedAt.toISOString(),
  };
}

/** Resolve `:developer` (slug ou id) ou responde `404 NOT_FOUND` (RN-F7-09). */
async function findDeveloperOrFail(rawIdentifier: string): Promise<DeveloperRecord> {
  const identifier = parseIdentifier(rawIdentifier);

  const developer = await prisma.developer.findUnique({
    where: identifier.kind === 'id' ? { id: identifier.value } : { slug: identifier.value },
    select: DEVELOPER_SELECT,
  });

  if (!developer) {
    throw apiErrors.notFound('Desenvolvedora não encontrada');
  }

  return developer;
}

/** Converte a violação de unicidade de uma corrida no código de domínio correto (RN-F7-05). */
function conflictFromUniqueViolation(error: unknown): unknown {
  if (isUniqueViolation(error, 'name_normalized')) {
    throw apiErrors.conflict(
      ERROR_CODES.developerNameTaken,
      'Já existe uma desenvolvedora com este nome',
    );
  }

  if (isUniqueViolation(error, 'slug')) {
    throw apiErrors.conflict(
      ERROR_CODES.developerSlugTaken,
      'Já existe uma desenvolvedora com este identificador',
    );
  }

  return error;
}

async function assertNameAvailable(nameNormalized: string, exceptId?: string): Promise<void> {
  const existing = await prisma.developer.findUnique({
    where: { nameNormalized },
    select: { id: true },
  });

  if (existing && existing.id !== exceptId) {
    throw apiErrors.conflict(
      ERROR_CODES.developerNameTaken,
      'Já existe uma desenvolvedora com este nome',
    );
  }
}

async function assertSlugAvailable(slug: string): Promise<void> {
  const existing = await prisma.developer.findUnique({ where: { slug }, select: { id: true } });

  if (existing) {
    throw apiErrors.conflict(
      ERROR_CODES.developerSlugTaken,
      'Já existe uma desenvolvedora com este identificador',
    );
  }
}

/** Lista pública completa, ordenada por nome (RN-F7-08) — uma única consulta (RN-F7-10). */
export async function listDevelopers(): Promise<DeveloperList> {
  const developers = await prisma.developer.findMany({ select: DEVELOPER_SELECT });

  return {
    data: developers
      .map(toDeveloperRef)
      .sort((a, b) => byName.compare(a.name, b.name) || a.slug.localeCompare(b.slug)),
  };
}

/** Detalhe público por slug ou id (RN-F7-09). */
export async function getDeveloperDetail(rawIdentifier: string): Promise<DeveloperDetail> {
  return toDeveloperDetail(await findDeveloperOrFail(rawIdentifier));
}

/**
 * Criação (RN-F7-03 a RN-F7-06): o slug informado é respeitado; quando omitido, é
 * derivado do nome. Nome e slug são únicos, com a unicidade do nome ignorando caixa e
 * acentos (RN-F7-02).
 */
export async function createDeveloper(input: DeveloperCreateInput): Promise<DeveloperDetail> {
  const slug = input.slug ?? deriveSlug(input.name, DEVELOPER_SLUG_MAX_LENGTH);

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
    const developer = await prisma.developer.create({
      data: { name: input.name, nameNormalized, slug },
      select: DEVELOPER_SELECT,
    });

    return toDeveloperDetail(developer);
  } catch (error) {
    throw conflictFromUniqueViolation(error);
  }
}

/**
 * Renomeação (RN-F7-04 e RN-F7-06): preserva `slug` e `createdAt`; um nome equivalente ao
 * atual é aceito sem alteração efetiva (`updatedAt` não muda).
 */
export async function updateDeveloper(
  rawIdentifier: string,
  input: DeveloperUpdateInput,
): Promise<DeveloperDetail> {
  const existing = await findDeveloperOrFail(rawIdentifier);
  const nameNormalized = normalizeTaxonomyName(input.name);

  if (normalizeTaxonomyName(existing.name) === nameNormalized) {
    return toDeveloperDetail(existing);
  }

  await assertNameAvailable(nameNormalized, existing.id);

  try {
    const updated = await prisma.developer.update({
      where: { id: existing.id },
      data: { name: input.name, nameNormalized },
      select: DEVELOPER_SELECT,
    });

    return toDeveloperDetail(updated);
  } catch (error) {
    throw conflictFromUniqueViolation(error);
  }
}

/**
 * Exclusão (RN-F7-07): somente quando não há jogos vinculados (`409 DEVELOPER_IN_USE`). O
 * filtro relacional evita remover vínculos em corrida com a F4.
 */
export async function deleteDeveloper(rawIdentifier: string): Promise<void> {
  const developer = await findDeveloperOrFail(rawIdentifier);

  const deleted = await prisma.developer.deleteMany({
    where: { id: developer.id, games: { none: {} } },
  });

  if (deleted.count > 0) {
    return;
  }

  const links = await prisma.gameDeveloper.count({ where: { developerId: developer.id } });

  if (links > 0) {
    const games = links === 1 ? '1 jogo' : `${links} jogos`;

    throw apiErrors.conflict(
      ERROR_CODES.developerInUse,
      `Esta desenvolvedora está vinculada a ${games} e não pode ser excluída. Remova os vínculos antes de tentar novamente.`,
    );
  }

  // Corrida: a desenvolvedora foi removida entre a leitura e a exclusão.
  throw apiErrors.notFound('Desenvolvedora não encontrada');
}
