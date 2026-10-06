import { normalizeTaxonomyName } from '@gamelog/shared';

import type { Game, PrismaClient } from '../../src/backend/src/generated/prisma/client.js';

/**
 * Fixtures do catálogo (F3) usadas pelos testes de integração e e2e, já que a gestão de
 * jogos (F4) ainda não existe. As funções recebem o cliente Prisma para que os testes
 * e2e possam apontar para o banco dedicado sem usar o singleton da aplicação.
 */

export type TestTaxonomyInput = { name: string; slug: string };

export async function createGenre(
  prisma: PrismaClient,
  input: TestTaxonomyInput,
): Promise<{ id: string }> {
  const data = { ...input, nameNormalized: normalizeTaxonomyName(input.name) };

  return prisma.genre.upsert({
    where: { slug: input.slug },
    update: data,
    create: data,
    select: { id: true },
  });
}

export async function createPlatform(
  prisma: PrismaClient,
  input: TestTaxonomyInput,
): Promise<{ id: string }> {
  const data = { ...input, nameNormalized: normalizeTaxonomyName(input.name) };

  return prisma.platform.upsert({
    where: { slug: input.slug },
    update: data,
    create: data,
    select: { id: true },
  });
}

export async function createDeveloper(
  prisma: PrismaClient,
  input: TestTaxonomyInput,
): Promise<{ id: string }> {
  const data = { ...input, nameNormalized: normalizeTaxonomyName(input.name) };

  return prisma.developer.upsert({
    where: { slug: input.slug },
    update: data,
    create: data,
    select: { id: true },
  });
}

export type TestGameInput = {
  slug: string;
  title?: string;
  description?: string | null;
  /** Data no formato `YYYY-MM-DD`; `null` = jogo sem data de lançamento. */
  releaseDate?: string | null;
  coverUrl?: string | null;
  ratingAverage?: number | null;
  ratingCount?: number;
  /** Slugs de taxonomias já criadas com as funções acima. */
  genres?: string[];
  platforms?: string[];
  developers?: string[];
  createdAt?: Date;
};

export async function createGame(prisma: PrismaClient, input: TestGameInput): Promise<Game> {
  const { genres = [], platforms = [], developers = [], ...game } = input;

  return prisma.game.create({
    data: {
      slug: game.slug,
      title: game.title ?? game.slug,
      description: game.description ?? null,
      releaseDate: game.releaseDate ? new Date(`${game.releaseDate}T00:00:00.000Z`) : null,
      coverUrl: game.coverUrl ?? null,
      ratingAverage: game.ratingAverage ?? null,
      ratingCount: game.ratingCount ?? 0,
      ...(game.createdAt ? { createdAt: game.createdAt } : {}),
      genres: { create: genres.map((slug) => ({ genre: { connect: { slug } } })) },
      platforms: { create: platforms.map((slug) => ({ platform: { connect: { slug } } })) },
      developers: { create: developers.map((slug) => ({ developer: { connect: { slug } } })) },
    },
  });
}
