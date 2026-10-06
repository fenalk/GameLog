import {
  REVIEW_BODY_MAX,
  REVIEW_EXCERPT_MAX,
  REVIEW_TITLE_MAX,
  defaultReviewOrder,
  excerptReviewBody,
  normalizeReviewBody,
  reviewBodySchema,
  reviewInputSchema,
  reviewQuerySchema,
  reviewTitleSchema,
  reviewUpdateSchema,
} from '@gamelog/shared';
import { describe, expect, it } from 'vitest';

/** Primeiro campo com erro em um resultado de `safeParse` (helpers da F10). */
function errorPath(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues[0]?.path.join('.');
}

describe('helpers e schemas das resenhas (CA-F10-20)', () => {
  describe('título', () => {
    it('normaliza trim e colapsa espaços internos (RN-F10-03)', () => {
      const parsed = reviewTitleSchema.safeParse('  Uma   aula   de  level design  ');

      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data).toBe('Uma aula de level design');
    });

    it('recusa título vazio, só com espaços, longo demais ou com caracteres de controle', () => {
      expect(reviewTitleSchema.safeParse('').success).toBe(false);
      expect(reviewTitleSchema.safeParse('   ').success).toBe(false);
      expect(reviewTitleSchema.safeParse('a'.repeat(REVIEW_TITLE_MAX + 1)).success).toBe(false);
      expect(reviewTitleSchema.safeParse('título\u0000com controle').success).toBe(false);
      expect(reviewTitleSchema.safeParse('a'.repeat(REVIEW_TITLE_MAX)).success).toBe(true);
    });
  });

  describe('corpo', () => {
    it('normaliza quebras \\r\\n e \\r para \\n e preserva as quebras internas (RN-F10-04)', () => {
      expect(normalizeReviewBody('  linha 1\r\nlinha 2\rlinha 3  ')).toBe(
        'linha 1\nlinha 2\nlinha 3',
      );
    });

    it('aceita quebras de linha internas e recusa demais caracteres de controle', () => {
      const parsed = reviewBodySchema.safeParse('parágrafo um\n\nparágrafo dois');

      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data).toBe('parágrafo um\n\nparágrafo dois');
      expect(reviewBodySchema.safeParse('texto\u0007com campainha').success).toBe(false);
      expect(reviewBodySchema.safeParse('   ').success).toBe(false);
    });

    it('respeita o limite de 10.000 caracteres', () => {
      expect(reviewBodySchema.safeParse('a'.repeat(REVIEW_BODY_MAX)).success).toBe(true);
      expect(reviewBodySchema.safeParse('a'.repeat(REVIEW_BODY_MAX + 1)).success).toBe(false);
    });
  });

  describe('trecho (excerptReviewBody)', () => {
    it('devolve o corpo inteiro quando ele cabe no limite', () => {
      const short = 'Uma resenha curta.';

      expect(excerptReviewBody(short)).toBe(short);
      expect(excerptReviewBody('a'.repeat(REVIEW_EXCERPT_MAX))).toBe(
        'a'.repeat(REVIEW_EXCERPT_MAX),
      );
    });

    it('corta em limite de palavra e acrescenta reticências', () => {
      const body = `${'palavra '.repeat(60)}fim`;
      const excerpt = excerptReviewBody(body);

      expect(excerpt.endsWith('…')).toBe(true);
      expect(excerpt.length).toBeLessThanOrEqual(REVIEW_EXCERPT_MAX + 1);
      // O corte não parte uma palavra ao meio.
      expect(body.startsWith(excerpt.slice(0, -1))).toBe(true);
      expect(excerpt.slice(0, -1).endsWith(' ')).toBe(false);
    });

    it('corta no limite exato quando não há espaço anterior disponível', () => {
      const body = 'a'.repeat(REVIEW_EXCERPT_MAX + 50);
      const excerpt = excerptReviewBody(body);

      expect(excerpt).toBe(`${'a'.repeat(REVIEW_EXCERPT_MAX)}…`);
    });

    it('considera quebras de linha como ponto de corte', () => {
      const body = `${'a'.repeat(REVIEW_EXCERPT_MAX - 5)}\nrestante do texto`;
      const excerpt = excerptReviewBody(body);

      expect(excerpt).toBe(`${'a'.repeat(REVIEW_EXCERPT_MAX - 5)}…`);
    });
  });

  describe('entrada e edição', () => {
    it('aceita o corpo completo e rejeita campos desconhecidos', () => {
      expect(reviewInputSchema.safeParse({ title: 'Título', body: 'Corpo' }).success).toBe(true);
      expect(reviewInputSchema.safeParse({ title: 'Título' }).success).toBe(false);
      expect(
        reviewInputSchema.safeParse({ title: 'Título', body: 'Corpo', extra: 1 }).success,
      ).toBe(false);
    });

    it('PATCH aceita qualquer subconjunto não vazio e recusa corpo vazio e valores nulos', () => {
      expect(reviewUpdateSchema.safeParse({ title: 'Novo' }).success).toBe(true);
      expect(reviewUpdateSchema.safeParse({ body: 'Novo corpo' }).success).toBe(true);
      expect(reviewUpdateSchema.safeParse({}).success).toBe(false);
      expect(reviewUpdateSchema.safeParse({ title: null }).success).toBe(false);
    });

    it('PATCH revalida os limites do título e do corpo', () => {
      expect(reviewUpdateSchema.safeParse({ title: '   ' }).success).toBe(false);
      expect(reviewUpdateSchema.safeParse({ body: '   ' }).success).toBe(false);
      expect(errorPath(reviewUpdateSchema.safeParse({ title: '' }))).toBe('title');
    });
  });

  describe('ordenação', () => {
    it('a direção padrão é desc, exceto game_title', () => {
      expect(defaultReviewOrder('recently_created')).toBe('desc');
      expect(defaultReviewOrder('recently_updated')).toBe('desc');
      expect(defaultReviewOrder('game_title')).toBe('asc');
    });

    it('a query recusa sort/order inválidos e pagina dentro dos limites', () => {
      expect(reviewQuerySchema.safeParse({ sort: 'recently_created', order: 'asc' }).success).toBe(
        true,
      );
      expect(reviewQuerySchema.safeParse({ sort: 'rating' }).success).toBe(false);
      expect(reviewQuerySchema.safeParse({ order: 'up' }).success).toBe(false);
      expect(reviewQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
      expect(reviewQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    });
  });
});
