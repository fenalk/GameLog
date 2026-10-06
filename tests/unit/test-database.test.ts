import { afterEach, describe, expect, it } from 'vitest';

import {
  assertSafeTestDatabase,
  resolveTestDatabaseUrl,
  TEST_DATABASE_SUFFIX,
} from '../setup/test-database.js';

const BASE_URL = 'postgresql://gamelog:gamelog@localhost:5432/gamelog?schema=public';
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalTestDatabaseUrl = process.env.TEST_DATABASE_URL;

describe('AUD-03: banco dedicado aos testes', () => {
  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    if (originalTestDatabaseUrl === undefined) {
      delete process.env.TEST_DATABASE_URL;
    } else {
      process.env.TEST_DATABASE_URL = originalTestDatabaseUrl;
    }
  });

  it('aceita apenas banco com sufixo de teste', () => {
    expect(TEST_DATABASE_SUFFIX).toBe('_test');
    expect(assertSafeTestDatabase('postgresql://u:p@host:5432/gamelog_test')).toBe(
      'postgresql://u:p@host:5432/gamelog_test',
    );
    expect(() => assertSafeTestDatabase('postgresql://u:p@host:5432/gamelog')).toThrow(/_test/);
    expect(() => assertSafeTestDatabase('postgresql://u:p@host:5432/gamelog_prod')).toThrow(
      /dedicado/,
    );
    expect(() => assertSafeTestDatabase('nao-e-url')).toThrow(/inválida/);
  });

  it('deriva o banco de teste a partir da DATABASE_URL', () => {
    delete process.env.TEST_DATABASE_URL;
    process.env.DATABASE_URL = BASE_URL;

    const resolved = new URL(resolveTestDatabaseUrl());

    expect(resolved.pathname).toBe('/gamelog_test');
    expect(resolved.searchParams.get('schema')).toBe('public');
  });

  it('respeita TEST_DATABASE_URL quando definida', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://u:p@host:5432/outro_test';

    expect(resolveTestDatabaseUrl()).toBe('postgresql://u:p@host:5432/outro_test');
  });

  it('recusa TEST_DATABASE_URL apontando para o banco de desenvolvimento', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://u:p@host:5432/gamelog';

    expect(() => resolveTestDatabaseUrl()).toThrow(/_test/);
  });
});
