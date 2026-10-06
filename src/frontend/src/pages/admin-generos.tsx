import {
  GENRE_NAME_MAX_LENGTH,
  GENRE_SLUG_MAX_LENGTH,
  genreCreateSchema,
  genreUpdateSchema,
} from '@gamelog/shared';

import { TaxonomyAdmin, type TaxonomyAdminConfig } from '@/components/taxonomy-admin';
import { createGenre, deleteGenre, fetchGenres, renameGenre } from '@/lib/genres';

/** Configuração da tela de gêneros (SPEC F5, seção 4). */
const config: TaxonomyAdminConfig = {
  testIdPrefix: 'genero',
  listTestIdPrefix: 'generos',
  heading: 'Gêneros',
  description:
    'Cadastre, renomeie e exclua os gêneros do catálogo. O slug é usado nos filtros e não pode ser alterado depois da criação.',
  createTitle: 'Novo gênero',
  createButtonLabel: 'Criar gênero',
  createSuccessMessage: 'Gênero criado com sucesso.',
  renameSuccessMessage: 'Gênero renomeado com sucesso.',
  emptyMessage: 'Nenhum gênero cadastrado',
  loadingMessage: 'Carregando gêneros…',
  nameMaxLength: GENRE_NAME_MAX_LENGTH,
  slugMaxLength: GENRE_SLUG_MAX_LENGTH,
  createSchema: genreCreateSchema,
  updateSchema: genreUpdateSchema,
  queryKey: ['admin', 'generos'],
  fetchAll: fetchGenres,
  create: createGenre,
  rename: renameGenre,
  remove: deleteGenre,
};

/** Tela de gerenciamento de gêneros (seção 4 da SPEC F5), exclusiva de `ADMIN`. */
export function AdminGenerosPage() {
  return <TaxonomyAdmin config={config} />;
}
