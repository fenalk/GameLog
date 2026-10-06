import { describe, expect, it } from 'vitest';

import { parseIdentifier } from '../../src/backend/src/lib/identifier.js';
import { parseGameIdentifier } from '../../src/backend/src/modules/catalog/game-identifier.js';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('helper de identificação slug/id (CA-F5-04)', () => {
  it('trata um UUID como id (normalizado para minúsculas e sem espaços)', () => {
    expect(parseIdentifier(UUID)).toEqual({ kind: 'id', value: UUID });
    expect(parseIdentifier(UUID.toUpperCase())).toEqual({ kind: 'id', value: UUID });
    expect(parseIdentifier(`  ${UUID}  `)).toEqual({ kind: 'id', value: UUID });
  });

  it('trata slugs como slug e nunca como UUID', () => {
    expect(parseIdentifier('acao')).toEqual({ kind: 'slug', value: 'acao' });

    const uuidLikeValues = [
      '3f2504e04f8941d39a0c0305e82c3301',
      '3f2504e0-4f89-41d3-9a0c-0305e82c330',
      '3f2504e0-4f89-41d3-9a0c-0305e82c33012',
      'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',
      'game-3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    ];

    for (const value of uuidLikeValues) {
      expect(parseIdentifier(value)).toEqual({ kind: 'slug', value });
    }
  });

  it('é o mesmo helper reutilizado pelo parâmetro :game (F3)', () => {
    expect(parseGameIdentifier(UUID)).toEqual(parseIdentifier(UUID));
    expect(parseGameIdentifier('the-legend-of-zelda')).toEqual({
      kind: 'slug',
      value: 'the-legend-of-zelda',
    });
  });

  it('CA-F6-04: também resolve o parâmetro :platform, sem tratar slug como UUID', () => {
    expect(parseIdentifier('nintendo-switch')).toEqual({ kind: 'slug', value: 'nintendo-switch' });
    expect(parseIdentifier('pc')).toEqual({ kind: 'slug', value: 'pc' });
    expect(parseIdentifier(UUID)).toEqual({ kind: 'id', value: UUID });
    expect(parseIdentifier(` ${UUID.toUpperCase()} `)).toEqual({ kind: 'id', value: UUID });
  });

  it('também resolve o parâmetro :developer (F7)', () => {
    expect(parseIdentifier('orbita-norte')).toEqual({ kind: 'slug', value: 'orbita-norte' });
    expect(parseIdentifier(UUID)).toEqual({ kind: 'id', value: UUID });
  });
});
