import {
  PLATFORM_NAME_MAX_LENGTH,
  PLATFORM_SLUG_MAX_LENGTH,
  platformCreateSchema,
  platformUpdateSchema,
} from '@gamelog/shared';

import { TaxonomyAdmin, type TaxonomyAdminConfig } from '@/components/taxonomy-admin';
import { createPlatform, deletePlatform, fetchPlatforms, renamePlatform } from '@/lib/platforms';

/** Configuração da tela de plataformas (SPEC F6, seção 4). */
const config: TaxonomyAdminConfig = {
  testIdPrefix: 'plataforma',
  listTestIdPrefix: 'plataformas',
  heading: 'Plataformas',
  description:
    'Cadastre, renomeie e exclua as plataformas do catálogo. O slug é usado nos filtros e não pode ser alterado depois da criação.',
  createTitle: 'Nova plataforma',
  createButtonLabel: 'Criar plataforma',
  createSuccessMessage: 'Plataforma criada com sucesso.',
  renameSuccessMessage: 'Plataforma renomeada com sucesso.',
  emptyMessage: 'Nenhuma plataforma cadastrada',
  loadingMessage: 'Carregando plataformas…',
  nameMaxLength: PLATFORM_NAME_MAX_LENGTH,
  slugMaxLength: PLATFORM_SLUG_MAX_LENGTH,
  createSchema: platformCreateSchema,
  updateSchema: platformUpdateSchema,
  queryKey: ['admin', 'plataformas'],
  fetchAll: fetchPlatforms,
  create: createPlatform,
  rename: renamePlatform,
  remove: deletePlatform,
};

/** Tela de gerenciamento de plataformas (seção 4 da SPEC F6), exclusiva de `ADMIN`. */
export function AdminPlataformasPage() {
  return <TaxonomyAdmin config={config} />;
}
