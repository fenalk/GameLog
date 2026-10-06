import { describe, expect, it } from 'vitest';

import { parseGameIdentifier } from '../../src/backend/src/modules/catalog/game-identifier.js';

describe('resolução do parâmetro :game (CA-F3-16)', () => {
  it('trata um UUID como id (normalizado para minúsculas)', () => {
    const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

    expect(parseGameIdentifier(id)).toEqual({ kind: 'id', value: id });
    expect(parseGameIdentifier(id.toUpperCase())).toEqual({ kind: 'id', value: id });
    expect(parseGameIdentifier(`  ${id}  `)).toEqual({ kind: 'id', value: id });
  });

  it('trata slugs como slug, incluindo os que lembram um UUID', () => {
    expect(parseGameIdentifier('the-legend-of-zelda')).toEqual({
      kind: 'slug',
      value: 'the-legend-of-zelda',
    });

    // RN-F4-03: um slug nunca tem formato de UUID; quando colidir, recebe o prefixo `game-`.
    expect(parseGameIdentifier('game-3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toEqual({
      kind: 'slug',
      value: 'game-3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    });
  });

  it('nunca trata um slug como UUID', () => {
    const uuidLikeValues = [
      '3f2504e04f8941d39a0c0305e82c3301',
      '3f2504e0-4f89-41d3-9a0c-0305e82c330',
      '3f2504e0-4f89-41d3-9a0c-0305e82c33012',
      'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',
      '3f2504e0_4f89_41d3_9a0c_0305e82c3301',
    ];

    for (const value of uuidLikeValues) {
      expect(parseGameIdentifier(value)).toEqual({ kind: 'slug', value });
    }
  });
});
