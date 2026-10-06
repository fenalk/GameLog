import type { User } from '../../src/backend/src/generated/prisma/client.js';
import { env } from '../../src/backend/src/config/env.js';
import { hashPassword } from '../../src/backend/src/lib/password.js';
import { prisma } from '../../src/backend/src/lib/prisma.js';
import { assertSafeTestDatabase } from '../setup/test-database.js';

/**
 * Limpa as tabelas de identidade entre testes (refresh tokens antes dos usuários) e o
 * catálogo (jogos e taxonomias da F3; as relações N:N caem por cascade) — incluindo o
 * diário (F8) e as resenhas (F10), que também cairiam por cascade dos jogos/usuários.
 * A guarda impede que a limpeza alcance um banco que não seja o dedicado aos testes.
 */
export async function resetDatabase(): Promise<void> {
  assertSafeTestDatabase(env.DATABASE_URL);

  await prisma.review.deleteMany();
  await prisma.gameLog.deleteMany();
  await prisma.game.deleteMany();
  await prisma.genre.deleteMany();
  await prisma.platform.deleteMany();
  await prisma.developer.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export type TestUserOverrides = {
  username?: string;
  email?: string;
  password?: string;
  role?: 'PLAYER' | 'ADMIN';
  status?: 'ACTIVE' | 'SUSPENDED';
};

/** Cria um usuário direto no banco, útil para cenários de papel/status. */
export async function createTestUser(overrides: TestUserOverrides = {}): Promise<User> {
  const username = overrides.username ?? 'jogador_01';
  const email = overrides.email ?? `${username}@example.com`;
  const password = overrides.password ?? 'senhaForte1';

  return prisma.user.create({
    data: {
      username,
      email,
      passwordHash: await hashPassword(password),
      role: overrides.role ?? 'PLAYER',
      status: overrides.status ?? 'ACTIVE',
    },
  });
}

export { prisma };
