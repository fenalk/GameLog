import { PrismaPg } from '@prisma/adapter-pg';

import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

// Cliente Prisma único da aplicação (ver seção 3.1 da SPEC de arquitetura: todo acesso
// a dados passa pelo Prisma). Nenhuma conexão é aberta até a primeira consulta.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

// Em testes, o cliente emite eventos de consulta (sem imprimir no console) para que a
// suíte verifique que a listagem do catálogo tem número constante de consultas
// (CA-F3-13). Nos demais ambientes não há custo adicional.
export const prisma = new PrismaClient({
  adapter,
  ...(env.NODE_ENV === 'test'
    ? { log: [{ emit: 'event' as const, level: 'query' as const }] }
    : {}),
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
