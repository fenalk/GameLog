import { z } from 'zod';

import { USERNAME_MAX_LENGTH } from './auth.js';
import {
  GAMES_PAGE_DEFAULT,
  GAMES_PAGE_SIZE_DEFAULT,
  GAMES_PAGE_SIZE_MAX,
  gameSummarySchema,
} from './catalog.js';
import { CONTROL_CHARACTERS_PATTERN, normalizeDisplayName } from './taxonomy.js';

/**
 * Contratos das listas (SPEC F11, seção 3): criação e gerenciamento das próprias listas,
 * leitura pública por perfil e por permalink, itens com ordem manual, nota curta e
 * visibilidade própria. Reutiliza as convenções de paginação, de identificação (`:game`)
 * e o resumo de jogo da F3.
 *
 * A lista é independente do diário (F8), da nota (F9) e das resenhas (F10): listar um
 * jogo não exige registro, nota nem resenha (RN-F11-19).
 */

export const LIST_TITLE_MAX = 80;
export const LIST_DESCRIPTION_MAX = 500;
export const LIST_ITEM_NOTE_MAX = 280;

/** Limites configuráveis (RN-F11-15): no máximo 100 listas por usuário e 500 itens por lista. */
export const LIST_MAX_PER_USER = 100;
export const LIST_ITEMS_MAX = 500;

export const LIST_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;
export type ListVisibility = (typeof LIST_VISIBILITIES)[number];

/** Rótulos pt-BR exibidos na interface (seção 4 da SPEC F11). */
export const LIST_VISIBILITY_LABELS: Record<ListVisibility, string> = {
  PUBLIC: 'Pública',
  PRIVATE: 'Privada',
};

export function listVisibilityLabel(visibility: ListVisibility): string {
  return LIST_VISIBILITY_LABELS[visibility];
}

/** `visibility` (RN-F11-03): `PUBLIC` ou `PRIVATE`; ausente na criação equivale a `PUBLIC`. */
export const listVisibilitySchema = z.enum(LIST_VISIBILITIES, {
  error: `Visibilidade deve ser uma das seguintes: ${LIST_VISIBILITIES.join(', ')}`,
});

const TITLE_LENGTH_MESSAGE = `Título deve ter entre 1 e ${LIST_TITLE_MAX} caracteres`;
const TITLE_CONTROL_MESSAGE = 'Título não pode conter caracteres de controle';

/**
 * `title` (RN-F11-02): 1–80 caracteres após normalização (`trim` + espaços internos
 * colapsados) e sem caracteres de controle.
 */
export const listTitleSchema = z
  .string()
  .transform((value) => normalizeDisplayName(value))
  .pipe(
    z
      .string()
      .min(1, TITLE_LENGTH_MESSAGE)
      .max(LIST_TITLE_MAX, TITLE_LENGTH_MESSAGE)
      .refine((value) => !CONTROL_CHARACTERS_PATTERN.test(value), TITLE_CONTROL_MESSAGE),
  );

/**
 * Normaliza a descrição (RN-F11-02): `trim` nas pontas e quebras `\r\n`/`\r` convertidas em
 * `\n`, preservando as quebras de linha internas. O texto permanece puro — a API não
 * interpreta HTML nem Markdown (o frontend escapa ao renderizar).
 */
export function normalizeListDescription(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

/** Caracteres de controle proibidos na descrição, exceto a quebra de linha (`\n`). */
function hasForbiddenControlCharacter(value: string): boolean {
  return CONTROL_CHARACTERS_PATTERN.test(value.replace(/\n/g, ''));
}

const DESCRIPTION_LENGTH_MESSAGE = `Descrição deve ter no máximo ${LIST_DESCRIPTION_MAX} caracteres`;
const DESCRIPTION_CONTROL_MESSAGE = 'Descrição não pode conter caracteres de controle';

/** `description` (RN-F11-02): até 500 caracteres, nulável (`null` limpa o campo). */
export const listDescriptionSchema = z
  .string()
  .transform((value) => normalizeListDescription(value))
  .pipe(
    z
      .string()
      .max(LIST_DESCRIPTION_MAX, DESCRIPTION_LENGTH_MESSAGE)
      .refine((value) => !hasForbiddenControlCharacter(value), DESCRIPTION_CONTROL_MESSAGE),
  );

const NOTE_LENGTH_MESSAGE = `Nota deve ter no máximo ${LIST_ITEM_NOTE_MAX} caracteres`;
const NOTE_CONTROL_MESSAGE = 'Nota não pode conter caracteres de controle';

/** `note` (RN-F11-07): até 280 caracteres após `trim`, nulável (`null` limpa o campo). */
export const listItemNoteSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .max(LIST_ITEM_NOTE_MAX, NOTE_LENGTH_MESSAGE)
      .refine((value) => !CONTROL_CHARACTERS_PATTERN.test(value), NOTE_CONTROL_MESSAGE),
  );

/** Corpo de `POST /me/lists` (RN-F11-02/03): `description` e `visibility` opcionais. */
export const listInputSchema = z.strictObject(
  {
    title: listTitleSchema,
    description: listDescriptionSchema.nullable().optional(),
    visibility: listVisibilitySchema.optional(),
  },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type ListInput = z.infer<typeof listInputSchema>;

const AT_LEAST_ONE_FIELD_MESSAGE = 'Informe ao menos um campo para atualizar';

/**
 * Corpo de `PATCH /me/lists/:id` (RN-F11-04): edição parcial — campo omitido não muda e
 * `null` limpa a descrição; o corpo precisa ter ao menos um campo.
 */
export const listUpdateSchema = z
  .strictObject(
    {
      title: listTitleSchema.optional(),
      description: listDescriptionSchema.nullable().optional(),
      visibility: listVisibilitySchema.optional(),
    },
    { error: 'Campo não permitido no corpo da requisição' },
  )
  .refine(
    (input) =>
      input.title !== undefined ||
      input.description !== undefined ||
      input.visibility !== undefined,
    { message: AT_LEAST_ONE_FIELD_MESSAGE },
  );

export type ListUpdateInput = z.infer<typeof listUpdateSchema>;

/** Corpo de `PUT /me/lists/:id/games/:game` (RN-F11-06): `note` omitido vira `null`. */
export const listItemInputSchema = z.strictObject(
  {
    note: listItemNoteSchema.nullable().optional(),
  },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type ListItemInput = z.infer<typeof listItemInputSchema>;

/** Corpo de `PATCH /me/lists/:id/games/:game` (RN-F11-07): `null` limpa a nota. */
export const listItemUpdateSchema = z
  .strictObject(
    {
      note: listItemNoteSchema.nullable().optional(),
    },
    { error: 'Campo não permitido no corpo da requisição' },
  )
  .refine((input) => input.note !== undefined, { message: AT_LEAST_ONE_FIELD_MESSAGE });

export type ListItemUpdateInput = z.infer<typeof listItemUpdateSchema>;

/**
 * Corpo de `PUT /me/lists/:id/order` (RN-F11-08): os jogos na ordem desejada. A verificação
 * de que o conjunto corresponde exatamente aos itens atuais é feita no serviço.
 */
export const listOrderInputSchema = z.strictObject(
  {
    games: z.array(z.string().min(1), { error: 'Informe a lista de jogos na ordem desejada' }),
  },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type ListOrderInput = z.infer<typeof listOrderInputSchema>;

/** Dono exibido nas listas (RN-F11-13): dados do perfil público, nunca e-mail/papel/hash. */
export const listOwnerSchema = z.object({
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});

export type ListOwner = z.infer<typeof listOwnerSchema>;

/** Item de uma lista (RN-F11-14): jogo em resumo, nota curta e posição manual. */
export const listItemSchema = z.object({
  game: gameSummarySchema,
  note: z.string().nullable(),
  position: z.number().int(),
  addedAt: z.iso.datetime(),
});

export type ListItem = z.infer<typeof listItemSchema>;

/** Resumo de uma lista (RN-F11-13). */
export const listSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  visibility: listVisibilitySchema,
  owner: listOwnerSchema,
  itemsCount: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ListSummary = z.infer<typeof listSummarySchema>;

/** Página de itens de uma lista (convenções da F3). */
export const listItemPageSchema = z.object({
  data: z.array(listItemSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export type ListItemPage = z.infer<typeof listItemPageSchema>;

/** Detalhe da lista (RN-F11-14): o resumo com a página de itens. */
export const listDetailSchema = listSummarySchema.extend({
  items: listItemPageSchema,
});

export type ListDetail = z.infer<typeof listDetailSchema>;

/** Resposta paginada das listagens de listas (convenções da F3). */
export const listPageSchema = z.object({
  data: z.array(listSummarySchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export type ListPage = z.infer<typeof listPageSchema>;

/** Ordenações das listas (RN-F11-10). */
export const LIST_SORTS = ['recently_updated', 'recently_created', 'title'] as const;
export type ListSort = (typeof LIST_SORTS)[number];

/** Ordenações dos itens (RN-F11-09). */
export const LIST_ITEM_SORTS = ['position', 'title', 'recently_added'] as const;
export type ListItemSort = (typeof LIST_ITEM_SORTS)[number];

export const LIST_SORT_ORDERS = ['asc', 'desc'] as const;
export type ListSortOrder = (typeof LIST_SORT_ORDERS)[number];

export const listSortSchema = z.enum(LIST_SORTS);
export const listItemSortSchema = z.enum(LIST_ITEM_SORTS);
export const listSortOrderSchema = z.enum(LIST_SORT_ORDERS);

/** Ordenação padrão das listagens: atualização recente (RN-F11-10) e posição (RN-F11-09). */
export const LIST_DEFAULT_SORT: ListSort = 'recently_updated';
export const LIST_ITEM_DEFAULT_SORT: ListItemSort = 'position';

/** Direção padrão de cada ordenação: `title` é ascendente, as demais descem. */
export function defaultListOrder(sort: ListSort): ListSortOrder {
  return sort === 'title' ? 'asc' : 'desc';
}

export function defaultListItemOrder(sort: ListItemSort): ListSortOrder {
  return sort === 'recently_added' ? 'desc' : 'asc';
}

const PAGE_MESSAGE = 'Página deve ser um número inteiro maior ou igual a 1';
const PAGE_SIZE_MESSAGE = `Tamanho da página deve ser um número inteiro entre 1 e ${GAMES_PAGE_SIZE_MAX}`;

const pageSchema = z.coerce.number(PAGE_MESSAGE).int(PAGE_MESSAGE).min(1, PAGE_MESSAGE).optional();
const pageSizeSchema = z.coerce
  .number(PAGE_SIZE_MESSAGE)
  .int(PAGE_SIZE_MESSAGE)
  .min(1, PAGE_SIZE_MESSAGE)
  .max(GAMES_PAGE_SIZE_MAX, PAGE_SIZE_MESSAGE)
  .optional();

/** Filtro `visibility` repetível, sem diferenciar maiúsculas/minúsculas (RN-F11-17). */
const visibilityFilterSchema = z.string().trim().toUpperCase().pipe(listVisibilitySchema);

const repeatedVisibilitySchema = z.union([visibilityFilterSchema, z.array(visibilityFilterSchema)]);

/** Query string de `GET /me/lists` (RN-F11-17): filtro de visibilidade repetível e de jogo. */
export const listQuerySchema = z.object({
  visibility: repeatedVisibilitySchema.optional(),
  game: z.string().min(1).optional(),
  sort: listSortSchema.optional(),
  order: listSortOrderSchema.optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/** Query string de `GET /users/:username/lists` (RN-F11-05): apenas ordenação e paginação. */
export const publicListQuerySchema = z.object({
  sort: listSortSchema.optional(),
  order: listSortOrderSchema.optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type PublicListQuery = z.infer<typeof publicListQuerySchema>;

/** Query string de `GET /lists/:id` (RN-F11-09/11): ordenação e paginação dos itens. */
export const listItemsQuerySchema = z.object({
  sort: listItemSortSchema.optional(),
  order: listSortOrderSchema.optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;

/** Parâmetro `:id` da lista. Um valor malformado ou inexistente responde `404`. */
export const listIdParamsSchema = z.object({ id: z.string().min(1) });

/** Parâmetros `:id` e `:game` dos itens (`:game` aceita slug ou id, convenção da F3). */
export const listItemParamsSchema = z.object({ id: z.string().min(1), game: z.string().min(1) });

/** Parâmetro `:username` das listas públicas (mesma convenção do perfil, RN-F11-05). */
export const listUserParamsSchema = z.object({
  username: z.string().min(1).max(USERNAME_MAX_LENGTH),
});

export const LIST_ROUTES = {
  /** Padrão das listas públicas de um perfil (backend). */
  publicLists: '/users/:username/lists',
  /** Padrão do permalink de uma lista (backend). */
  detail: '/lists/:id',
  /** Padrão da listagem das próprias listas (backend). */
  myLists: '/me/lists',
  /** Padrão da própria lista (backend). */
  myList: '/me/lists/:id',
  /** Padrão de um item da própria lista (backend). */
  myListItem: '/me/lists/:id/games/:game',
  /** Padrão da reordenação dos itens (backend). */
  myListOrder: '/me/lists/:id/order',
} as const;

/** Caminho do permalink de uma lista (frontend e testes). */
export function listPath(id: string): string {
  return `/lists/${encodeURIComponent(id)}`;
}

/** Caminho das listas públicas de um `username` (frontend e testes). */
export function listUserPath(username: string): string {
  return `/users/${encodeURIComponent(username)}/lists`;
}

/** Caminho da própria lista (frontend e testes): leitura/edição/exclusão autenticadas. */
export function listMePath(id: string): string {
  return `/me/lists/${encodeURIComponent(id)}`;
}

/** Caminho de um item da própria lista (frontend e testes). */
export function listMeItemPath(id: string, game: string): string {
  return `/me/lists/${encodeURIComponent(id)}/games/${encodeURIComponent(game)}`;
}

/** Caminho da reordenação da própria lista (frontend e testes). */
export function listMeOrderPath(id: string): string {
  return `/me/lists/${encodeURIComponent(id)}/order`;
}

export const LIST_PAGE_DEFAULT = GAMES_PAGE_DEFAULT;
export const LIST_PAGE_SIZE_DEFAULT = GAMES_PAGE_SIZE_DEFAULT;
export const LIST_PAGE_SIZE_MAX = GAMES_PAGE_SIZE_MAX;
