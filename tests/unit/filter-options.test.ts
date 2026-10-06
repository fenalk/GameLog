import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchGenresMock, fetchPlatformsMock, fetchDevelopersMock } = vi.hoisted(() => ({
  fetchGenresMock: vi.fn(),
  fetchPlatformsMock: vi.fn(),
  fetchDevelopersMock: vi.fn(),
}));

vi.mock('@/lib/genres', () => ({ fetchGenres: fetchGenresMock }));
vi.mock('@/lib/platforms', () => ({ fetchPlatforms: fetchPlatformsMock }));
vi.mock('@/lib/developers', () => ({ fetchDevelopers: fetchDevelopersMock }));

import { fetchFilterOptions } from '../../src/frontend/src/lib/catalog.js';

const GENRE_ACAO = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Ação',
  slug: 'acao',
  gameCount: 2,
};
const GENRE_RPG = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'RPG',
  slug: 'rpg',
  gameCount: 1,
};
const PLATFORM_PC = {
  id: '00000000-0000-4000-8000-000000000011',
  name: 'PC',
  slug: 'pc',
  gameCount: 3,
};
const PLATFORM_XBOX = {
  id: '00000000-0000-4000-8000-000000000012',
  name: 'Xbox Series X/S',
  slug: 'xbox-series-x-s',
  gameCount: 0,
};
const DEVELOPER_VITRAL = {
  id: '00000000-0000-4000-8000-000000000021',
  name: 'Estúdio Vitral',
  slug: 'estudio-vitral',
  gameCount: 1,
};
const DEVELOPER_NEBULOSA = {
  id: '00000000-0000-4000-8000-000000000022',
  name: 'Nebulosa Interativa',
  slug: 'nebulosa-interativa',
  gameCount: 2,
};

describe('opções do filtro do catálogo (CA-F5-25, CA-F6-25 e RN-F7-13)', () => {
  beforeEach(() => {
    fetchGenresMock.mockReset();
    fetchPlatformsMock.mockReset();
    fetchDevelopersMock.mockReset();

    // Ordem invertida de propósito: a função deve ordenar por nome.
    fetchGenresMock.mockResolvedValue([GENRE_RPG, GENRE_ACAO]);
    fetchPlatformsMock.mockResolvedValue([PLATFORM_XBOX, PLATFORM_PC]);
    fetchDevelopersMock.mockResolvedValue([DEVELOPER_NEBULOSA, DEVELOPER_VITRAL]);
  });

  it('usa GET /genres, GET /platforms e GET /developers e ordena as opções por nome', async () => {
    const options = await fetchFilterOptions();

    // Cada taxonomia vem da sua leitura pública (nenhuma derivação local da listagem).
    expect(fetchGenresMock).toHaveBeenCalledTimes(1);
    expect(fetchPlatformsMock).toHaveBeenCalledTimes(1);
    expect(fetchDevelopersMock).toHaveBeenCalledTimes(1);

    expect(options.genres).toEqual([
      { id: GENRE_ACAO.id, name: 'Ação', slug: 'acao' },
      { id: GENRE_RPG.id, name: 'RPG', slug: 'rpg' },
    ]);
    expect(options.platforms).toEqual([
      { id: PLATFORM_PC.id, name: 'PC', slug: 'pc' },
      { id: PLATFORM_XBOX.id, name: 'Xbox Series X/S', slug: 'xbox-series-x-s' },
    ]);
    expect(options.developers).toEqual([
      { id: DEVELOPER_VITRAL.id, name: 'Estúdio Vitral', slug: 'estudio-vitral' },
      { id: DEVELOPER_NEBULOSA.id, name: 'Nebulosa Interativa', slug: 'nebulosa-interativa' },
    ]);
  });
});
