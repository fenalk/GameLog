import { randomUUID } from 'node:crypto';

import argon2 from 'argon2';

/**
 * Parâmetros argon2id no mínimo recomendado pela OWASP (RN-F1-04):
 * 19 MiB de memória, 2 iterações e paralelismo 1.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}

let fakeHash: Promise<string> | undefined;

/**
 * Hash fictício usado quando o usuário não existe: mantém o custo de verificação
 * semelhante ao de uma senha errada, para não revelar quais contas existem (RN-F1-06).
 */
export function fakePasswordHash(): Promise<string> {
  fakeHash ??= argon2.hash(randomUUID(), ARGON2_OPTIONS);
  return fakeHash;
}
