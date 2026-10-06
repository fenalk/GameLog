import {
  deriveSlug,
  ERROR_CODES,
  PLATFORM_SLUG_MAX_LENGTH,
  normalizeTaxonomyName,
  type PlatformCreateInput,
  type PlatformDetail,
  type PlatformList,
  type PlatformRef,
  type PlatformUpdateInput,
} from '@gamelog/shared';

import { apiErrors } from '../../lib/api-error.js';
import { parseIdentifier } from '../../lib/identifier.js';
import { prisma } from '../../lib/prisma.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';

/** Campos da plataforma nas leituras públicas, com a contagem de jogos (RN-F6-08). */
const PLATFORM_SELECT = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { games: true } },
} as const;

type PlatformRecord = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { games: number };
};

/** Ordenação por nome em pt-BR ignorando caixa, com desempate por `slug` (RN-F6-08). */
const byName = new Intl.Collator('pt-BR', { sensitivity: 'base' });

function toPlatformRef(platform: PlatformRecord): PlatformRef {
  return {
    id: platform.id,
    name: platform.name,
    slug: platform.slug,
    gameCount: platform._count.games,
  };
}

function toPlatformDetail(platform: PlatformRecord): PlatformDetail {
  return {
    ...toPlatformRef(platform),
    createdAt: platform.createdAt.toISOString(),
    updatedAt: platform.updatedAt.toISOString(),
  };
}

/** Resolve `:platform` (slug ou id) ou responde `404 NOT_FOUND` (RN-F6-09). */
async function findPlatformOrFail(rawIdentifier: string): Promise<PlatformRecord> {
  const identifier = parseIdentifier(rawIdentifier);

  const platform = await prisma.platform.findUnique({
    where: identifier.kind === 'id' ? { id: identifier.value } : { slug: identifier.value },
    select: PLATFORM_SELECT,
  });

  if (!platform) {
    throw apiErrors.notFound('Plataforma não encontrada');
  }

  return platform;
}

/** Converte a violação de unicidade de uma corrida no código de domínio correto (RN-F6-05). */
function conflictFromUniqueViolation(error: unknown): unknown {
  if (isUniqueViolation(error, 'name_normalized')) {
    throw apiErrors.conflict(
      ERROR_CODES.platformNameTaken,
      'Já existe uma plataforma com este nome',
    );
  }

  if (isUniqueViolation(error, 'slug')) {
    throw apiErrors.conflict(
      ERROR_CODES.platformSlugTaken,
      'Já existe uma plataforma com este identificador',
    );
  }

  return error;
}

async function assertNameAvailable(nameNormalized: string, exceptId?: string): Promise<void> {
  const existing = await prisma.platform.findUnique({
    where: { nameNormalized },
    select: { id: true },
  });

  if (existing && existing.id !== exceptId) {
    throw apiErrors.conflict(
      ERROR_CODES.platformNameTaken,
      'Já existe uma plataforma com este nome',
    );
  }
}

async function assertSlugAvailable(slug: string): Promise<void> {
  const existing = await prisma.platform.findUnique({ where: { slug }, select: { id: true } });

  if (existing) {
    throw apiErrors.conflict(
      ERROR_CODES.platformSlugTaken,
      'Já existe uma plataforma com este identificador',
    );
  }
}

/** Lista pública completa, ordenada por nome (RN-F6-08) — uma única consulta (RN-F6-10). */
export async function listPlatforms(): Promise<PlatformList> {
  const platforms = await prisma.platform.findMany({ select: PLATFORM_SELECT });

  return {
    data: platforms
      .map(toPlatformRef)
      .sort((a, b) => byName.compare(a.name, b.name) || a.slug.localeCompare(b.slug)),
  };
}

/** Detalhe público por slug ou id (RN-F6-09). */
export async function getPlatformDetail(rawIdentifier: string): Promise<PlatformDetail> {
  return toPlatformDetail(await findPlatformOrFail(rawIdentifier));
}

/**
 * Criação (RN-F6-03 a RN-F6-06): o slug informado é respeitado; quando omitido, é
 * derivado do nome. Nome e slug são únicos, com a unicidade do nome ignorando caixa e
 * acentos (RN-F6-02).
 */
export async function createPlatform(input: PlatformCreateInput): Promise<PlatformDetail> {
  const slug = input.slug ?? deriveSlug(input.name, PLATFORM_SLUG_MAX_LENGTH);

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
    const platform = await prisma.platform.create({
      data: { name: input.name, nameNormalized, slug },
      select: PLATFORM_SELECT,
    });

    return toPlatformDetail(platform);
  } catch (error) {
    throw conflictFromUniqueViolation(error);
  }
}

/**
 * Renomeação (RN-F6-04 e RN-F6-06): preserva `slug` e `createdAt`; um nome equivalente ao
 * atual é aceito sem alteração efetiva (`updatedAt` não muda).
 */
export async function updatePlatform(
  rawIdentifier: string,
  input: PlatformUpdateInput,
): Promise<PlatformDetail> {
  const existing = await findPlatformOrFail(rawIdentifier);
  const nameNormalized = normalizeTaxonomyName(input.name);

  if (normalizeTaxonomyName(existing.name) === nameNormalized) {
    return toPlatformDetail(existing);
  }

  await assertNameAvailable(nameNormalized, existing.id);

  try {
    const updated = await prisma.platform.update({
      where: { id: existing.id },
      data: { name: input.name, nameNormalized },
      select: PLATFORM_SELECT,
    });

    return toPlatformDetail(updated);
  } catch (error) {
    throw conflictFromUniqueViolation(error);
  }
}

/**
 * Exclusão (RN-F6-07): somente quando não há jogos vinculados (`409 PLATFORM_IN_USE`). O
 * filtro relacional evita remover vínculos em corrida com a F4.
 */
export async function deletePlatform(rawIdentifier: string): Promise<void> {
  const platform = await findPlatformOrFail(rawIdentifier);

  const deleted = await prisma.platform.deleteMany({
    where: { id: platform.id, games: { none: {} } },
  });

  if (deleted.count > 0) {
    return;
  }

  const links = await prisma.gamePlatform.count({ where: { platformId: platform.id } });

  if (links > 0) {
    const games = links === 1 ? '1 jogo' : `${links} jogos`;

    throw apiErrors.conflict(
      ERROR_CODES.platformInUse,
      `Esta plataforma está vinculada a ${games} e não pode ser excluída. Remova os vínculos antes de tentar novamente.`,
    );
  }

  // Corrida: a plataforma foi removida entre a leitura e a exclusão.
  throw apiErrors.notFound('Plataforma não encontrada');
}
