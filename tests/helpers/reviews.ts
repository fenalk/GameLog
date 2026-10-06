import type { PrismaClient, ReviewStatus } from '../../src/backend/src/generated/prisma/client.js';

/**
 * Fixtures de resenhas (F10) usadas pelos testes de integração e e2e: criam resenhas
 * direto no banco para os cenários de leitura (listagens, ordenação, visibilidade e
 * cascatas) sem depender das rotas de escrita.
 */

export type TestReviewInput = {
  userId: string;
  gameId: string;
  title?: string;
  body?: string;
  status?: ReviewStatus;
  createdAt?: Date;
  updatedAt?: Date;
};

export async function createReview(
  prisma: PrismaClient,
  input: TestReviewInput,
): Promise<{ id: string }> {
  const review = await prisma.review.create({
    data: {
      userId: input.userId,
      gameId: input.gameId,
      title: input.title ?? 'Uma boa surpresa',
      body: input.body ?? 'O jogo acerta no ritmo e no level design.',
      ...(input.status ? { status: input.status } : {}),
    },
    select: { id: true },
  });

  // `created_at`/`updated_at` são definidos por `@updatedAt`/`@default(now())`; para os
  // cenários de ordenação os valores são fixados por SQL, depois da criação.
  if (input.createdAt || input.updatedAt) {
    await prisma.$executeRaw`
      UPDATE reviews
      SET created_at = COALESCE(${input.createdAt ?? null}, created_at),
          updated_at = COALESCE(${input.updatedAt ?? null}, updated_at)
      WHERE id = ${review.id}::uuid
    `;
  }

  return review;
}
