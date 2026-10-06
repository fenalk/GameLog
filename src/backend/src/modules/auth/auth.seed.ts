import { adminSeedSchema } from '@gamelog/shared';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { hashPassword } from '../../lib/password.js';

export type SeedAdminResult =
  { status: 'created'; userId: string } | { status: 'existing'; userId: string };

export type SeedAdminInput = {
  email: string;
  username: string;
  password: string;
};

/**
 * Seed idempotente do administrador inicial (RN-F1-14): cria **um** `ADMIN` com status
 * `ACTIVE` a partir de `ADMIN_EMAIL`, `ADMIN_USERNAME` e `ADMIN_PASSWORD`. Se a conta já
 * existir (mesmo username ou e-mail), nada é alterado.
 */
export async function seedAdminUser(
  client: PrismaClient,
  input: SeedAdminInput,
): Promise<SeedAdminResult> {
  const parsed = adminSeedSchema.safeParse(input);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Credenciais inválidas para o seed do administrador:\n${issues}`);
  }

  const { username, email, password } = parsed.data;

  const existing = await client.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { id: true },
  });

  if (existing) {
    return { status: 'existing', userId: existing.id };
  }

  const user = await client.user.create({
    data: {
      username,
      email,
      passwordHash: await hashPassword(password),
      role: 'ADMIN',
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  return { status: 'created', userId: user.id };
}
