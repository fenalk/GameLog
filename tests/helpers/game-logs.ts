import type { GameLogStatus, PrismaClient } from '../../src/backend/src/generated/prisma/client.js';

/**
 * Fixtures do diário (F8) usadas pelos testes de integração e e2e: criam registros
 * direto no banco para os cenários de leitura (listagens, filtros, ordenação, cascatas)
 * sem depender das rotas de escrita.
 */

export type TestGameLogInput = {
  userId: string;
  gameId: string;
  status: GameLogStatus;
  /** Datas no formato `YYYY-MM-DD` (gravadas em UTC, como o serviço). */
  startedAt?: string | null;
  finishedAt?: string | null;
  playtimeMinutes?: number | null;
  platformId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

function toDbDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function createGameLog(
  prisma: PrismaClient,
  input: TestGameLogInput,
): Promise<{ id: string }> {
  const log = await prisma.gameLog.create({
    data: {
      userId: input.userId,
      gameId: input.gameId,
      status: input.status,
      startedAt: toDbDate(input.startedAt),
      finishedAt: toDbDate(input.finishedAt),
      playtimeMinutes: input.playtimeMinutes ?? null,
      platformId: input.platformId ?? null,
    },
    select: { id: true },
  });

  // `created_at`/`updated_at` são definidos por `@updatedAt`/`@default(now())`; para os
  // cenários de ordenação os valores são fixados por SQL, depois da criação.
  if (input.createdAt || input.updatedAt) {
    await prisma.$executeRaw`
      UPDATE game_logs
      SET created_at = COALESCE(${input.createdAt ?? null}, created_at),
          updated_at = COALESCE(${input.updatedAt ?? null}, updated_at)
      WHERE id = ${log.id}::uuid
    `;
  }

  return log;
}
