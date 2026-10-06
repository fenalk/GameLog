import { LOGIN_RATE_LIMIT } from '@gamelog/shared';

export type LoginRateLimitCheck = { blocked: false } | { blocked: true; retryAfterSeconds: number };

export interface LoginAttemptLimiter {
  /** Indica se novas tentativas estão bloqueadas para a chave (identifier + IP). */
  check(key: string): LoginRateLimitCheck;
  /** Contabiliza uma falha de credenciais dentro da janela deslizante. */
  registerFailure(key: string): void;
  /** Zera o contador (chamado em login bem-sucedido) — RN-F1-08. */
  reset(key: string): void;
}

type Entry = { failures: number; windowStartedAt: number };

const PRUNE_THRESHOLD = 1_000;

/**
 * Limite de tentativas de login em memória (RN-F1-08): 5 falhas em 15 min por
 * `identifier` normalizado + IP. Armazenamento em memória é aceitável nesta fase;
 * rate limiting distribuído (Redis) está fora do escopo da SPEC F1.
 */
export function createLoginAttemptLimiter(
  options: { maxFailures?: number; windowMs?: number } = {},
): LoginAttemptLimiter {
  const maxFailures = options.maxFailures ?? LOGIN_RATE_LIMIT.maxFailures;
  const windowMs = options.windowMs ?? LOGIN_RATE_LIMIT.windowSeconds * 1000;
  const entries = new Map<string, Entry>();

  function activeEntry(key: string, now: number): Entry | undefined {
    const entry = entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (now - entry.windowStartedAt >= windowMs) {
      entries.delete(key);
      return undefined;
    }

    return entry;
  }

  /** Remove as janelas já expiradas para o mapa não crescer indefinidamente. */
  function pruneExpired(now: number): void {
    for (const [key, entry] of entries) {
      if (now - entry.windowStartedAt >= windowMs) {
        entries.delete(key);
      }
    }
  }

  return {
    check(key) {
      const now = Date.now();
      const entry = activeEntry(key, now);

      if (!entry || entry.failures < maxFailures) {
        return { blocked: false };
      }

      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((entry.windowStartedAt + windowMs - now) / 1000),
      );
      return { blocked: true, retryAfterSeconds };
    },

    registerFailure(key) {
      const now = Date.now();
      const entry = activeEntry(key, now);

      if (entry) {
        entry.failures += 1;
      } else {
        entries.set(key, { failures: 1, windowStartedAt: now });
      }

      if (entries.size > PRUNE_THRESHOLD) {
        pruneExpired(now);
      }
    },

    reset(key) {
      entries.delete(key);
    },
  };
}
