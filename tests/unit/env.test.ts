import { describe, expect, it } from 'vitest';

import { MIN_JWT_SECRET_LENGTH, parseEnv } from '../../src/backend/src/config/env.js';

const DATABASE_URL = 'postgresql://gamelog:gamelog@localhost:5432/gamelog?schema=public';
const ACCESS_SECRET = 'a'.repeat(MIN_JWT_SECRET_LENGTH);
const REFRESH_SECRET = 'b'.repeat(MIN_JWT_SECRET_LENGTH);

function validEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL,
    JWT_ACCESS_SECRET: ACCESS_SECRET,
    JWT_REFRESH_SECRET: REFRESH_SECRET,
    ...overrides,
  };
}

describe('CA-F1-22: configuração de ambiente exigida pela aplicação', () => {
  it('aceita a configuração completa e aplica os padrões', () => {
    const parsed = parseEnv(validEnv());

    expect(parsed.JWT_ACCESS_SECRET).toBe(ACCESS_SECRET);
    expect(parsed.JWT_REFRESH_SECRET).toBe(REFRESH_SECRET);
    expect(parsed.NODE_ENV).toBe('development');
  });

  it('recusa iniciar sem JWT_ACCESS_SECRET', () => {
    expect(() => parseEnv(validEnv({ JWT_ACCESS_SECRET: undefined }))).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('recusa iniciar sem JWT_REFRESH_SECRET', () => {
    expect(() => parseEnv(validEnv({ JWT_REFRESH_SECRET: undefined }))).toThrow(
      /JWT_REFRESH_SECRET/,
    );
  });

  it('recusa segredo de acesso com menos de 32 caracteres', () => {
    expect(() => parseEnv(validEnv({ JWT_ACCESS_SECRET: 'a'.repeat(31) }))).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('recusa segredo de refresh com menos de 32 caracteres', () => {
    expect(() => parseEnv(validEnv({ JWT_REFRESH_SECRET: 'b'.repeat(31) }))).toThrow(
      /JWT_REFRESH_SECRET/,
    );
  });

  it('recusa segredos iguais (o refresh precisa de segredo distinto)', () => {
    expect(() => parseEnv(validEnv({ JWT_REFRESH_SECRET: ACCESS_SECRET }))).toThrow(
      /devem ser diferentes/,
    );
  });
});
