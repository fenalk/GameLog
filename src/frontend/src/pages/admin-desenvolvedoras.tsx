import {
  DEVELOPER_NAME_MAX_LENGTH,
  DEVELOPER_SLUG_MAX_LENGTH,
  developerCreateSchema,
  developerUpdateSchema,
} from '@gamelog/shared';

import { TaxonomyAdmin, type TaxonomyAdminConfig } from '@/components/taxonomy-admin';
import {
  createDeveloper,
  deleteDeveloper,
  fetchDevelopers,
  renameDeveloper,
} from '@/lib/developers';

/** Configuração da tela de desenvolvedoras (SPEC F7, seção 4). */
const config: TaxonomyAdminConfig = {
  testIdPrefix: 'desenvolvedora',
  listTestIdPrefix: 'desenvolvedoras',
  heading: 'Desenvolvedoras',
  description:
    'Cadastre, renomeie e exclua as desenvolvedoras do catálogo. O slug é usado nos filtros e não pode ser alterado depois da criação.',
  createTitle: 'Nova desenvolvedora',
  createButtonLabel: 'Criar desenvolvedora',
  createSuccessMessage: 'Desenvolvedora criada com sucesso.',
  renameSuccessMessage: 'Desenvolvedora renomeada com sucesso.',
  emptyMessage: 'Nenhuma desenvolvedora cadastrada',
  loadingMessage: 'Carregando desenvolvedoras…',
  nameMaxLength: DEVELOPER_NAME_MAX_LENGTH,
  slugMaxLength: DEVELOPER_SLUG_MAX_LENGTH,
  createSchema: developerCreateSchema,
  updateSchema: developerUpdateSchema,
  queryKey: ['admin', 'desenvolvedoras'],
  fetchAll: fetchDevelopers,
  create: createDeveloper,
  rename: renameDeveloper,
  remove: deleteDeveloper,
};

/** Tela de gerenciamento de desenvolvedoras (seção 4 da SPEC F7), exclusiva de `ADMIN`. */
export function AdminDesenvolvedorasPage() {
  return <TaxonomyAdmin config={config} />;
}
