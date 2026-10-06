import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';

const BACKEND_DIR = fileURLToPath(new URL('../../src/backend', import.meta.url));
const BACKEND_ENV_FILE = fileURLToPath(new URL('../../src/backend/.env', import.meta.url));
const PRISMA_BIN = fileURLToPath(
  new URL(
    `../../node_modules/.bin/prisma${process.platform === 'win32' ? '.cmd' : ''}`,
    import.meta.url,
  ),
);

/**
 * Sufixo obrigatório do banco usado pelos testes. A suíte de integração limpa as
 * tabelas de identidade, então só um banco dedicado (nome terminando em `_test`) pode
 * ser alvo — ver AUD-03 da auditoria da SPEC F1.
 */
export const TEST_DATABASE_SUFFIX = '_test';

/** Garante que a URL aponta para um banco dedicado aos testes. */
export function assertSafeTestDatabase(databaseUrl: string): string {
  let database: string;

  try {
    database = new URL(databaseUrl).pathname.replace(/^\//, '');
  } catch {
    throw new Error(`DATABASE_URL de testes inválida: "${databaseUrl}".`);
  }

  if (!database.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `Os testes só podem apagar dados de um banco dedicado (nome terminando em "${TEST_DATABASE_SUFFIX}"), ` +
        `mas a URL aponta para "${database}". Defina TEST_DATABASE_URL ou ajuste DATABASE_URL em src/backend/.env.`,
    );
  }

  return databaseUrl;
}

/**
 * URL do banco de testes: `TEST_DATABASE_URL` quando definida; caso contrário, a
 * `DATABASE_URL` de src/backend/.env com o nome do banco acrescido de `_test`
 * (ex.: `gamelog` → `gamelog_test`).
 */
export function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;

  if (explicit) {
    return assertSafeTestDatabase(explicit);
  }

  loadEnv({ path: BACKEND_ENV_FILE, quiet: true });

  const base = process.env.DATABASE_URL;

  if (!base) {
    throw new Error(
      'Defina DATABASE_URL (copie src/backend/.env.example para src/backend/.env) ou TEST_DATABASE_URL para rodar os testes.',
    );
  }

  const url = new URL(base);
  url.pathname = `${url.pathname}${TEST_DATABASE_SUFFIX}`;

  return assertSafeTestDatabase(url.toString());
}

/**
 * Cria (se não existir) e migra o banco de testes. Idempotente: o `prisma migrate
 * deploy` cria o banco e aplica as migrations pendentes.
 */
export function prepareTestDatabase(): void {
  const databaseUrl = resolveTestDatabaseUrl();

  try {
    execFileSync(PRISMA_BIN, ['migrate', 'deploy'], {
      cwd: BACKEND_DIR,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    const details = [stdout?.toString(), stderr?.toString()].filter(Boolean).join('\n');

    throw new Error(
      `Falha ao preparar o banco de testes "${databaseUrl}":\n${details || String(error)}`,
      { cause: error },
    );
  }
}
