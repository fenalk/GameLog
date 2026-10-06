import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { seedAdminUser } from '../../src/backend/src/modules/auth/auth.seed.js';
import { disconnectDatabase, prisma, resetDatabase } from '../helpers/db.js';

const ADMIN_INPUT = {
  email: 'admin@gamelog.local',
  username: 'gamelog_admin',
  password: 'adminForte1',
};

describe('CA-F1-23: seed do administrador inicial', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('cria um único ADMIN com hash argon2id', async () => {
    const result = await seedAdminUser(prisma, ADMIN_INPUT);

    expect(result.status).toBe('created');

    const admin = await prisma.user.findUniqueOrThrow({
      where: { username: 'gamelog_admin' },
    });

    expect(admin.email).toBe('admin@gamelog.local');
    expect(admin.role).toBe('ADMIN');
    expect(admin.status).toBe('ACTIVE');
    expect(admin.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await prisma.user.count()).toBe(1);
  });

  it('a segunda execução não duplica nem altera a conta existente', async () => {
    await seedAdminUser(prisma, ADMIN_INPUT);
    const before = await prisma.user.findUniqueOrThrow({ where: { username: 'gamelog_admin' } });

    const secondRun = await seedAdminUser(prisma, ADMIN_INPUT);

    expect(secondRun.status).toBe('existing');
    expect(secondRun.userId).toBe(before.id);

    const after = await prisma.user.findUniqueOrThrow({ where: { username: 'gamelog_admin' } });
    expect(after).toEqual(before);
    expect(await prisma.user.count()).toBe(1);
  });

  it('não altera uma conta já existente mesmo com outra senha informada', async () => {
    await seedAdminUser(prisma, ADMIN_INPUT);
    const before = await prisma.user.findUniqueOrThrow({ where: { username: 'gamelog_admin' } });

    const secondRun = await seedAdminUser(prisma, { ...ADMIN_INPUT, password: 'outraSenha2' });

    expect(secondRun.status).toBe('existing');
    const after = await prisma.user.findUniqueOrThrow({ where: { username: 'gamelog_admin' } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('recusa credenciais inválidas para o seed', async () => {
    await expect(seedAdminUser(prisma, { ...ADMIN_INPUT, password: 'curta' })).rejects.toThrow(
      /Credenciais inválidas/,
    );
  });

  it('.env.example contém apenas placeholders, sem segredos reais', async () => {
    const path = fileURLToPath(new URL('../../src/backend/.env.example', import.meta.url));
    const contents = await readFile(path, 'utf8');

    for (const variable of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ADMIN_PASSWORD']) {
      const value = new RegExp(`^${variable}="([^"]*)"`, 'm').exec(contents)?.[1];
      expect(value, `${variable} deve estar no .env.example`).toBeTruthy();
      expect(value, `${variable} deve ser um placeholder`).toContain('troque');
    }
  });
});
