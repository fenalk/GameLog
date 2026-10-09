import {
  FOLLOWING_MAX,
  FOLLOW_DEFAULT_SORT,
  FOLLOW_SORTS,
  FOLLOW_SORT_LABELS,
  defaultFollowOrder,
  followButtonLabel,
  followItemSchema,
  followMePath,
  followQuerySchema,
  followSortLabel,
  followSortSchema,
  followStateSchema,
  followersPath,
  followingPath,
} from '@gamelog/shared';
import { describe, expect, it } from 'vitest';

/** Primeiro campo com erro em um resultado de `safeParse` (helpers do seguimento). */
function errorPath(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues[0]?.path.join('.');
}

describe('helpers e schemas do seguimento (CA-F12-19)', () => {
  it('expõe as ordenações, o padrão e o limite configurável da SPEC (RN-F12-05/08)', () => {
    expect(FOLLOW_SORTS).toEqual(['recently_followed', 'username']);
    expect(FOLLOW_DEFAULT_SORT).toBe('recently_followed');
    expect(FOLLOWING_MAX).toBe(5000);
  });

  it('rotula as ordenações em pt-BR', () => {
    expect(followSortLabel('recently_followed')).toBe(FOLLOW_SORT_LABELS.recently_followed);
    expect(followSortLabel('username')).toBe(FOLLOW_SORT_LABELS.username);
    expect(followSortLabel('recently_followed')).toBe('Seguidos recentemente');
    expect(followSortLabel('username')).toBe('Nome de usuário (A–Z)');
  });

  it('define a direção padrão de cada ordenação (RN-F12-08)', () => {
    expect(defaultFollowOrder('recently_followed')).toBe('desc');
    expect(defaultFollowOrder('username')).toBe('asc');
  });

  it('rotula o botão de seguimento (RN-F12-04)', () => {
    expect(followButtonLabel(false)).toBe('Seguir');
    expect(followButtonLabel(true)).toBe('Seguindo');
  });

  it('valida `sort` e `order` e rejeita valores inválidos', () => {
    expect(followSortSchema.safeParse('username').success).toBe(true);
    expect(followSortSchema.safeParse('recently_created').success).toBe(false);
    expect(errorPath(followQuerySchema.safeParse({ order: 'up' }))).toBe('order');
    expect(errorPath(followQuerySchema.safeParse({ sort: 'title' }))).toBe('sort');
  });

  it('aceita apenas a paginação da F3 (RN-F12-07)', () => {
    const parsed = followQuerySchema.safeParse({ page: '2', pageSize: '50' });

    expect(parsed.success && parsed.data.page).toBe(2);
    expect(parsed.success && parsed.data.pageSize).toBe(50);
    expect(errorPath(followQuerySchema.safeParse({ page: '0' }))).toBe('page');
    expect(errorPath(followQuerySchema.safeParse({ pageSize: '101' }))).toBe('pageSize');
    expect(errorPath(followQuerySchema.safeParse({ pageSize: 'abc' }))).toBe('pageSize');
  });

  it('valida os itens e o estado das listagens (RN-F12-09)', () => {
    const item = {
      username: 'bia',
      displayName: 'Bia Nunes',
      avatarUrl: null,
      followedAt: '2026-10-07T18:20:00.000Z',
      isFollowedByMe: false,
    };

    expect(followItemSchema.safeParse(item).success).toBe(true);
    // Campos alheios ao contrato são descartados na validação (RN-F12-09).
    expect(followItemSchema.safeParse({ ...item, email: 'bia@example.com' }).data).toEqual(item);
    expect(followItemSchema.safeParse({ ...item, isFollowedByMe: 'sim' }).success).toBe(false);

    const state = {
      username: 'ana',
      followersCount: 1,
      followingCount: 2,
      isFollowedByMe: true,
    };

    expect(followStateSchema.safeParse(state).success).toBe(true);
    expect(followStateSchema.safeParse({ ...state, username: 42 }).success).toBe(false);
  });

  it('monta os caminhos das rotas com `encodeURIComponent`', () => {
    expect(followMePath('ana')).toBe('/me/following/ana');
    expect(followersPath('ana')).toBe('/users/ana/followers');
    expect(followingPath('ana')).toBe('/users/ana/following');

    expect(followMePath('ana maria')).toBe('/me/following/ana%20maria');
    expect(followersPath('ana/maria')).toBe('/users/ana%2Fmaria/followers');
    expect(followingPath('ana?x=1')).toBe('/users/ana%3Fx%3D1/following');
  });
});
