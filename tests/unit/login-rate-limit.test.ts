import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLoginAttemptLimiter } from '../../src/backend/src/lib/login-rate-limit.js';

const KEY = 'jogador_01|127.0.0.1';

describe('RN-F1-08: limite de tentativas de login em memória', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('bloqueia a partir da sexta falha na mesma janela', () => {
    const limiter = createLoginAttemptLimiter();

    for (let failure = 0; failure < 5; failure += 1) {
      expect(limiter.check(KEY).blocked).toBe(false);
      limiter.registerFailure(KEY);
    }

    const blocked = limiter.check(KEY);
    expect(blocked.blocked).toBe(true);
    if (blocked.blocked) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
    }
  });

  it('conta as falhas por chave (identifier + IP)', () => {
    const limiter = createLoginAttemptLimiter();

    for (let failure = 0; failure < 5; failure += 1) {
      limiter.registerFailure(KEY);
    }

    expect(limiter.check(KEY).blocked).toBe(true);
    expect(limiter.check('outro_identificador|127.0.0.1').blocked).toBe(false);
    expect(limiter.check('jogador_01|10.0.0.2').blocked).toBe(false);
  });

  it('libera novamente depois de a janela expirar', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const limiter = createLoginAttemptLimiter();

    for (let failure = 0; failure < 5; failure += 1) {
      limiter.registerFailure(KEY);
    }
    expect(limiter.check(KEY).blocked).toBe(true);

    vi.setSystemTime(new Date(Date.now() + 15 * 60 * 1000 + 1));
    expect(limiter.check(KEY).blocked).toBe(false);
  });

  it('zera o contador em caso de sucesso', () => {
    const limiter = createLoginAttemptLimiter();

    for (let failure = 0; failure < 5; failure += 1) {
      limiter.registerFailure(KEY);
    }
    expect(limiter.check(KEY).blocked).toBe(true);

    limiter.reset(KEY);
    expect(limiter.check(KEY).blocked).toBe(false);
  });

  it('mantém o comportamento correto após limpar janelas expiradas', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const limiter = createLoginAttemptLimiter();

    for (let failure = 0; failure < 5; failure += 1) {
      limiter.registerFailure(KEY);
    }
    expect(limiter.check(KEY).blocked).toBe(true);

    // Ultrapassa o limite interno, que dispara a limpeza das janelas expiradas.
    for (let index = 0; index < 1_100; index += 1) {
      limiter.registerFailure(`usuario_${index}|127.0.0.1`);
    }

    expect(limiter.check(KEY).blocked).toBe(true);
    expect(limiter.check('usuario_novo|127.0.0.1').blocked).toBe(false);
  });
});
