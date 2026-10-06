import { registerSchema } from '@gamelog/shared';
import { describe, expect, it } from 'vitest';

/**
 * AUD-02: as mensagens padrão do Zod (sem mensagem customizada no schema) devem sair
 * em pt-BR, conforme a seção 2 da SPEC F1.
 */
describe('mensagens padrão de validação em pt-BR', () => {
  it('campo ausente gera mensagem em português', () => {
    const result = registerSchema.safeParse({});

    expect(result.success).toBe(false);

    const messages = result.error?.issues.map((issue) => issue.message) ?? [];
    expect(messages.join(' | ')).toMatch(/esperava um texto/i);
    expect(messages.join(' | ')).not.toMatch(/invalid input|expected string/i);
  });

  it('tipo incorreto gera mensagem em português', () => {
    const result = registerSchema.safeParse({
      username: 42,
      email: 'jogador@example.com',
      password: 'senhaForte1',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/esperava um texto/i);
  });
});
