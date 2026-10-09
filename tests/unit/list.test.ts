import {
  LIST_DEFAULT_SORT,
  LIST_DESCRIPTION_MAX,
  LIST_ITEM_DEFAULT_SORT,
  LIST_ITEMS_MAX,
  LIST_MAX_PER_USER,
  LIST_TITLE_MAX,
  LIST_VISIBILITY_LABELS,
  defaultListOrder,
  defaultListItemOrder,
  listDescriptionSchema,
  listInputSchema,
  listItemInputSchema,
  listItemNoteSchema,
  listItemSortSchema,
  listItemUpdateSchema,
  listItemsQuerySchema,
  listOrderInputSchema,
  listQuerySchema,
  listSortSchema,
  listTitleSchema,
  listUpdateSchema,
  listVisibilityLabel,
  listVisibilitySchema,
  normalizeListDescription,
} from '@gamelog/shared';
import { describe, expect, it } from 'vitest';

/** Primeiro campo com erro em um resultado de `safeParse` (helpers da F11). */
function errorPath(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues[0]?.path.join('.');
}

describe('helpers e schemas das listas (CA-F11-28)', () => {
  describe('título', () => {
    it('normaliza trim e colapsa espaços internos (RN-F11-02)', () => {
      const parsed = listTitleSchema.safeParse('  Meus   RPGs  ');

      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data).toBe('Meus RPGs');
    });

    it('recusa título vazio, só com espaços, longo demais ou com caracteres de controle', () => {
      expect(listTitleSchema.safeParse('').success).toBe(false);
      expect(listTitleSchema.safeParse('   ').success).toBe(false);
      expect(listTitleSchema.safeParse('a'.repeat(LIST_TITLE_MAX + 1)).success).toBe(false);
      expect(listTitleSchema.safeParse('título\u0000com controle').success).toBe(false);
      expect(listTitleSchema.safeParse('a'.repeat(LIST_TITLE_MAX)).success).toBe(true);
    });
  });

  describe('descrição', () => {
    it('normaliza quebras \\r\\n e \\r para \\n e preserva as quebras internas (RN-F11-02)', () => {
      expect(normalizeListDescription('  linha 1\r\nlinha 2\rlinha 3  ')).toBe(
        'linha 1\nlinha 2\nlinha 3',
      );
    });

    it('aceita quebras de linha internas e recusa demais caracteres de controle', () => {
      const parsed = listDescriptionSchema.safeParse('parágrafo um\n\nparágrafo dois');

      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data).toBe('parágrafo um\n\nparágrafo dois');
      expect(listDescriptionSchema.safeParse('texto\u0007com campainha').success).toBe(false);
    });

    it('respeita o limite de 500 caracteres', () => {
      expect(listDescriptionSchema.safeParse('a'.repeat(LIST_DESCRIPTION_MAX)).success).toBe(true);
      expect(listDescriptionSchema.safeParse('a'.repeat(LIST_DESCRIPTION_MAX + 1)).success).toBe(
        false,
      );
    });
  });

  describe('nota do item', () => {
    it('aplica trim e recusa excesso e caracteres de controle (RN-F11-07)', () => {
      const parsed = listItemNoteSchema.safeParse('  Melhor do gênero  ');

      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data).toBe('Melhor do gênero');
      expect(listItemNoteSchema.safeParse('a'.repeat(281)).success).toBe(false);
      expect(listItemNoteSchema.safeParse('nota\u0000com controle').success).toBe(false);
    });
  });

  describe('visibilidade', () => {
    it('tem rótulos pt-BR e recusa valores inválidos', () => {
      expect(listVisibilityLabel('PUBLIC')).toBe('Pública');
      expect(listVisibilityLabel('PRIVATE')).toBe('Privada');
      expect(LIST_VISIBILITY_LABELS.PRIVATE).toBe('Privada');
      expect(listVisibilitySchema.safeParse('public').success).toBe(false);
      expect(listVisibilitySchema.safeParse('HIDDEN').success).toBe(false);
    });
  });

  describe('entrada e edição da lista', () => {
    it('aceita o corpo de criação e rejeita campos desconhecidos', () => {
      expect(listInputSchema.safeParse({ title: 'Lista' }).success).toBe(true);
      expect(
        listInputSchema.safeParse({ title: 'Lista', description: null, visibility: 'PRIVATE' })
          .success,
      ).toBe(true);
      expect(listInputSchema.safeParse({ description: 'Sem título' }).success).toBe(false);
      expect(listInputSchema.safeParse({ title: 'Lista', extra: 1 }).success).toBe(false);
      expect(listInputSchema.safeParse({ title: 'Lista', visibility: 'SECRET' }).success).toBe(
        false,
      );
    });

    it('PATCH aceita subconjunto não vazio, permite null na descrição e recusa corpo vazio', () => {
      expect(listUpdateSchema.safeParse({ title: 'Novo' }).success).toBe(true);
      expect(listUpdateSchema.safeParse({ description: null }).success).toBe(true);
      expect(listUpdateSchema.safeParse({ visibility: 'PRIVATE' }).success).toBe(true);
      expect(listUpdateSchema.safeParse({}).success).toBe(false);
      expect(listUpdateSchema.safeParse({ title: null }).success).toBe(false);
      expect(errorPath(listUpdateSchema.safeParse({ title: '   ' }))).toBe('title');
    });
  });

  describe('item e reordenação', () => {
    it('aceita a nota na entrada e exige ao menos um campo no PATCH', () => {
      expect(listItemInputSchema.safeParse({}).success).toBe(true);
      expect(listItemInputSchema.safeParse({ note: 'Bom' }).success).toBe(true);
      expect(listItemInputSchema.safeParse({ note: null }).success).toBe(true);
      expect(listItemInputSchema.safeParse({ note: 'Bom', extra: true }).success).toBe(false);

      expect(listItemUpdateSchema.safeParse({ note: null }).success).toBe(true);
      expect(listItemUpdateSchema.safeParse({}).success).toBe(false);
    });

    it('o corpo da reordenação exige um array de identificadores', () => {
      expect(listOrderInputSchema.safeParse({ games: [] }).success).toBe(true);
      expect(listOrderInputSchema.safeParse({ games: ['cronicas', 'zeloria'] }).success).toBe(true);
      expect(listOrderInputSchema.safeParse({ games: 'cronicas' }).success).toBe(false);
      expect(listOrderInputSchema.safeParse({}).success).toBe(false);
      expect(listOrderInputSchema.safeParse({ games: [''] }).success).toBe(false);
    });
  });

  describe('ordenação e paginação', () => {
    it('as direções padrão são desc, exceto title (RN-F11-09/10)', () => {
      expect(defaultListOrder('recently_updated')).toBe('desc');
      expect(defaultListOrder('recently_created')).toBe('desc');
      expect(defaultListOrder('title')).toBe('asc');
      expect(defaultListItemOrder('position')).toBe('asc');
      expect(defaultListItemOrder('recently_added')).toBe('desc');
      expect(defaultListItemOrder('title')).toBe('asc');
      expect(LIST_DEFAULT_SORT).toBe('recently_updated');
      expect(LIST_ITEM_DEFAULT_SORT).toBe('position');
    });

    it('as queries recusam sort/order inválidos e paginam dentro dos limites', () => {
      expect(listSortSchema.safeParse('title').success).toBe(true);
      expect(listSortSchema.safeParse('rating').success).toBe(false);
      expect(listItemSortSchema.safeParse('position').success).toBe(true);
      expect(listItemSortSchema.safeParse('recently_created').success).toBe(false);

      expect(listQuerySchema.safeParse({ page: 1, pageSize: 100 }).success).toBe(true);
      expect(listQuerySchema.safeParse({ page: 0 }).success).toBe(false);
      expect(listQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
      expect(listQuerySchema.safeParse({ order: 'up' }).success).toBe(false);
      expect(listItemsQuerySchema.safeParse({ sort: 'recently_added' }).success).toBe(true);
    });

    it('o filtro de visibilidade é repetível e aceita minúsculas (RN-F11-17)', () => {
      expect(listQuerySchema.safeParse({ visibility: 'public' }).success).toBe(true);
      expect(listQuerySchema.safeParse({ visibility: ['public', 'PRIVATE'] }).success).toBe(true);
      expect(listQuerySchema.safeParse({ visibility: 'secret' }).success).toBe(false);
    });
  });

  it('os limites configuráveis são 100 listas e 500 itens (RN-F11-15)', () => {
    expect(LIST_MAX_PER_USER).toBe(100);
    expect(LIST_ITEMS_MAX).toBe(500);
  });
});
