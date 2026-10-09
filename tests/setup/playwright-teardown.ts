import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/backend/src/generated/prisma/client.js';
import { resolveTestDatabaseUrl } from './test-database.js';

/**
 * Remove os dados criados pelos testes e2e: identidade (usuários e refresh tokens) e
 * catálogo (jogos e taxonomias da F3, com as relações N:N em cascade). Só roda no banco
 * dedicado aos testes (`*_test`, garantido por `resolveTestDatabaseUrl`).
 *
 * Observação: quando o Playwright reutiliza servidores já em execução
 * (`reuseExistingServer`), eles podem apontar para outro banco; nesse caso a limpeza
 * não alcança os dados criados por eles.
 */
export default async function cleanupE2eData(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: resolveTestDatabaseUrl() }),
  });

  try {
    await prisma.follow.deleteMany();
    await prisma.game.deleteMany();
    await prisma.genre.deleteMany();
    await prisma.platform.deleteMany();
    await prisma.developer.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  } finally {
    await prisma.$disconnect();
  }
}
