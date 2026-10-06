import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/backend/src/generated/prisma/client.js';
import { resolveTestDatabaseUrl } from './test-database.js';

/**
 * Remove os dados de identidade criados pelos testes e2e. Só roda no banco dedicado aos
 * testes (`*_test`, garantido por `resolveTestDatabaseUrl`), e o smoke test não cria
 * usuários — ao final, o banco volta ao estado inicial.
 *
 * Observação: quando o Playwright reutiliza servidores já em execução
 * (`reuseExistingServer`), eles podem apontar para outro banco; nesse caso a limpeza
 * não alcança os usuários criados por eles.
 */
export default async function cleanupE2eData(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: resolveTestDatabaseUrl() }),
  });

  try {
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  } finally {
    await prisma.$disconnect();
  }
}
