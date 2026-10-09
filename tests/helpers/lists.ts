import type {
  ListVisibility,
  PrismaClient,
} from '../../src/backend/src/generated/prisma/client.js';

/**
 * Fixtures de listas (F11) usadas pelos testes de integração e e2e: criam listas e itens
 * direto no banco para os cenários de leitura (listagens, ordenação, visibilidade e
 * cascatas) sem depender das rotas de escrita.
 */

export type TestListInput = {
  userId: string;
  title?: string;
  description?: string | null;
  visibility?: ListVisibility;
  createdAt?: Date;
  updatedAt?: Date;
};

export async function createList(
  prisma: PrismaClient,
  input: TestListInput,
): Promise<{ id: string }> {
  const list = await prisma.gameList.create({
    data: {
      userId: input.userId,
      title: input.title ?? 'Minha lista',
      description: input.description ?? null,
      ...(input.visibility ? { visibility: input.visibility } : {}),
    },
    select: { id: true },
  });

  // `created_at`/`updated_at` são definidos por `@updatedAt`/`@default(now())`; para os
  // cenários de ordenação os valores são fixados por SQL, depois da criação.
  if (input.createdAt || input.updatedAt) {
    await prisma.$executeRaw`
      UPDATE game_lists
      SET created_at = COALESCE(${input.createdAt ?? null}, created_at),
          updated_at = COALESCE(${input.updatedAt ?? null}, updated_at)
      WHERE id = ${list.id}::uuid
    `;
  }

  return list;
}

export type TestListItemInput = {
  listId: string;
  gameId: string;
  position?: number;
  note?: string | null;
  createdAt?: Date;
};

export async function createListItem(
  prisma: PrismaClient,
  input: TestListItemInput,
): Promise<{ id: string }> {
  const item = await prisma.gameListItem.create({
    data: {
      listId: input.listId,
      gameId: input.gameId,
      position: input.position ?? 0,
      note: input.note ?? null,
    },
    select: { id: true },
  });

  if (input.createdAt) {
    await prisma.$executeRaw`
      UPDATE game_list_items
      SET created_at = ${input.createdAt}, updated_at = ${input.createdAt}
      WHERE id = ${item.id}::uuid
    `;
  }

  return item;
}
