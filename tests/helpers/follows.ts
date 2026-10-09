import type { PrismaClient } from '../../src/backend/src/generated/prisma/client.js';

/**
 * Fixtures de seguimento (F12) usadas pelos testes de integração e e2e: criam vínculos
 * direto no banco para os cenários de listagem, ordenação e cascatas sem depender das
 * rotas de escrita.
 */

export type TestFollowInput = {
  followerId: string;
  followingId: string;
  createdAt?: Date;
};

export async function createFollow(
  prisma: PrismaClient,
  input: TestFollowInput,
): Promise<{ id: string }> {
  const follow = await prisma.follow.create({
    data: { followerId: input.followerId, followingId: input.followingId },
    select: { id: true },
  });

  // `created_at` tem `@default(now())`; para os cenários de ordenação é fixado por SQL
  // depois da criação, como nos itens de lista (F11).
  if (input.createdAt) {
    await prisma.$executeRaw`
      UPDATE follows SET created_at = ${input.createdAt} WHERE id = ${follow.id}::uuid
    `;
  }

  return follow;
}
