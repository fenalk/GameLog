import { PrismaPg } from '@prisma/adapter-pg';
import { expect, request, test, type Page } from '@playwright/test';

import { PrismaClient } from '../../src/backend/src/generated/prisma/client.js';
import { createGame } from '../helpers/catalog.js';
import { createList, createListItem } from '../helpers/lists.js';
import { resolveTestDatabaseUrl } from '../setup/test-database.js';

// O arquivo roda em série: as fixtures do catálogo e das listas são preparadas uma vez e
// compartilhadas pelas verificações (a F4, que criaria jogos pela API, ainda não existe).
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'senhaForte1';
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

/** Sufixo único por execução para não colidir com dados de execuções anteriores. */
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;

const GAME_A = `lista-a-${RUN}`;
const GAME_B = `lista-b-${RUN}`;
const GAME_PUBLIC = `lista-pub-${RUN}`;
const GAME_PRIVATE = `lista-priv-${RUN}`;

const TITLE_A = `Jogo A ${RUN}`;
const TITLE_B = `Jogo B ${RUN}`;

let prisma: PrismaClient;
let publicListId = '';
let privateListId = '';

/** Conta dona das listas públicas/privadas usadas pelo visitante. */
const visitorOwner = {
  username: `lista_visit_${RUN}`.slice(0, 30),
  email: `lista_visit_${RUN}@example.com`,
  password: PASSWORD,
};

function uniqueUser(prefix: string) {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
  const username = `${prefix}_${suffix}`.slice(0, 30);

  return { username, email: `${username}@example.com`, password: PASSWORD };
}

/** Cria a conta por um contexto de API isolado (o cookie de refresh não vaza para o teste). */
async function createUserThroughApi(user: { username: string; email: string; password: string }) {
  const api = await request.newContext({ baseURL: BASE_URL });

  try {
    const response = await api.post('/api/v1/auth/register', { data: user });
    expect(response.status()).toBe(201);
  } finally {
    await api.dispose();
  }
}

async function loginViaUi(page: Page, user: { username: string; password: string }) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail ou nome de usuário').fill(user.username);
  await page.getByLabel('Senha', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByTestId('usuario-atual')).toHaveText(user.username);
}

async function createUserWithSession(page: Page, prefix: string) {
  const user = uniqueUser(prefix);
  await createUserThroughApi(user);
  await loginViaUi(page, user);
  return user;
}

async function userId(username: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { username },
    select: { id: true },
  });

  return user.id;
}

async function gameId(slug: string): Promise<string> {
  const game = await prisma.game.findUniqueOrThrow({ where: { slug }, select: { id: true } });

  return game.id;
}

/** Cria uma lista pela interface a partir de `/listas/nova` e devolve o id (URL). */
async function createListThroughUi(
  page: Page,
  values: { title: string; description?: string; visibility?: 'Pública' | 'Privada' },
): Promise<string> {
  await page.goto('/listas/nova');
  await page.getByLabel('Título').fill(values.title);

  if (values.description) {
    await page.getByLabel('Descrição').fill(values.description);
  }

  if (values.visibility) {
    await page.getByLabel('Visibilidade').selectOption({ label: values.visibility });
  }

  await page.getByTestId('salvar-lista').click();
  await expect(page.getByTestId('lista-detalhe-titulo')).toHaveText(values.title);

  const match = /\/listas\/([^/?#]+)/.exec(page.url());
  return match?.[1] ?? '';
}

/** Marca a lista `listTitle` no diálogo "Adicionar a lista" do jogo. */
async function addGameToList(page: Page, gameSlug: string, listTitle: string) {
  await page.goto(`/jogos/${gameSlug}`);
  await page.getByTestId('lista-adicionar').click();

  const checkbox = page.getByLabel(listTitle);
  await expect(checkbox).toBeVisible();
  await checkbox.check();
  await expect(checkbox).toBeChecked();

  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(checkbox).toBeHidden();
}

test.beforeAll(async () => {
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: resolveTestDatabaseUrl() }),
  });

  for (const [slug, title] of [
    [GAME_A, TITLE_A],
    [GAME_B, TITLE_B],
    [GAME_PUBLIC, `Jogo Público ${RUN}`],
    [GAME_PRIVATE, `Jogo Privado ${RUN}`],
  ] as const) {
    await createGame(prisma, { slug, title });
  }

  await createUserThroughApi(visitorOwner);
  const ownerId = await userId(visitorOwner.username);

  publicListId = (
    await createList(prisma, {
      userId: ownerId,
      title: `Lista pública ${RUN}`,
      visibility: 'PUBLIC',
    })
  ).id;
  await createListItem(prisma, {
    listId: publicListId,
    gameId: await gameId(GAME_PUBLIC),
    position: 0,
    note: 'Visível para todos.',
  });

  privateListId = (
    await createList(prisma, {
      userId: ownerId,
      title: `Lista privada ${RUN}`,
      visibility: 'PRIVATE',
    })
  ).id;
  await createListItem(prisma, {
    listId: privateListId,
    gameId: await gameId(GAME_PRIVATE),
    position: 0,
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('SPEC F11 — listas (interface)', () => {
  test('CA-F11-29: o dono cria a lista, vê na aba Listas, edita os metadados e exclui', async ({
    page,
  }) => {
    const owner = await createUserWithSession(page, 'lista_crud');

    const listId = await createListThroughUi(page, {
      title: 'Meus RPGs',
      description: 'Uma seleção pessoal.',
      visibility: 'Privada',
    });
    expect(listId.length).toBeGreaterThan(0);

    // A lista privada aparece para o dono na aba Listas, com selo de visibilidade.
    await page.goto(`/jogadores/${owner.username}?secao=listas`);
    await expect(page.getByTestId('listas-secao')).toBeVisible();
    const card = page.getByTestId('lista-cartao').filter({ hasText: 'Meus RPGs' });
    await expect(card).toBeVisible();
    await expect(card.getByTestId('lista-visibilidade')).toHaveText('Privada');

    // Edita os metadados pelo cartão.
    await card.getByTestId('lista-editar').click();
    await expect(page).toHaveURL(`/listas/${listId}/editar`);
    await page.getByLabel('Título').fill('Meus RPGs favoritos');
    await page.getByTestId('salvar-lista').click();
    await expect(page.getByTestId('lista-detalhe-titulo')).toHaveText('Meus RPGs favoritos');

    // Exclui com confirmação pela aba Listas.
    await page.goto(`/jogadores/${owner.username}?secao=listas`);
    const updatedCard = page.getByTestId('lista-cartao').filter({ hasText: 'Meus RPGs favoritos' });
    await expect(updatedCard).toBeVisible();
    await updatedCard.getByTestId('lista-remover').click();
    await page.getByTestId('confirmar-remocao').click();

    await expect(page.getByTestId('listas-vazio')).toContainText('Você ainda não criou listas');
  });

  test('CA-F11-30: o dono adiciona jogos pelo diálogo, reordena, edita a nota e remove', async ({
    page,
  }) => {
    await createUserWithSession(page, 'lista_itens');

    const listId = await createListThroughUi(page, { title: 'Zerados do ano' });

    await addGameToList(page, GAME_A, 'Zerados do ano');
    await addGameToList(page, GAME_B, 'Zerados do ano');

    await page.goto(`/listas/${listId}`);
    await expect(page.getByTestId('lista-item')).toHaveCount(2);
    await expect(page.getByTestId('lista-item-jogo').nth(0)).toHaveText(TITLE_A);
    await expect(page.getByTestId('lista-item-jogo').nth(1)).toHaveText(TITLE_B);

    // Reordena: sobe o segundo item.
    await page.getByTestId('lista-item').nth(1).getByTestId('lista-item-subir').click();
    await expect(page.getByTestId('lista-item-jogo').nth(0)).toHaveText(TITLE_B);
    await expect(page.getByTestId('lista-item-jogo').nth(1)).toHaveText(TITLE_A);

    // Edita a nota do primeiro item.
    await page.getByTestId('lista-item').nth(0).getByTestId('lista-item-editar-nota').click();
    await page.getByRole('textbox', { name: 'Nota' }).fill('Melhor do ano');
    await page.getByTestId('salvar-nota').click();
    await expect(page.getByTestId('lista-item-nota')).toHaveText('Melhor do ano');

    // Remove o item de "Jogo A".
    const itemA = page.getByTestId('lista-item').filter({ hasText: TITLE_A });
    await itemA.getByTestId('lista-item-remover').click();
    await page.getByTestId('confirmar-remocao').click();

    await expect(page.getByTestId('lista-item')).toHaveCount(1);
    await expect(page.getByTestId('lista-item-jogo')).toHaveText(TITLE_B);
  });

  test('CA-F11-31: o visitante lê a lista pública, uma privada de terceiros dá 404 e o convite de login aparece', async ({
    page,
  }) => {
    await page.goto(`/listas/${publicListId}`);
    await expect(page.getByTestId('lista-detalhe-titulo')).toContainText('Lista pública');
    await expect(page.getByTestId('lista-item')).toHaveCount(1);
    await expect(page.getByTestId('lista-item-nota')).toHaveText('Visível para todos.');
    await expect(page.getByTestId('lista-item-remover')).toHaveCount(0);
    await expect(page.getByTestId('lista-editar')).toHaveCount(0);

    await page.goto(`/listas/${privateListId}`);
    await expect(page.getByTestId('pagina-404')).toBeVisible();

    await page.goto(`/jogos/${GAME_PUBLIC}`);
    await page.getByTestId('lista-adicionar').click();
    await expect(page).toHaveURL(/\/entrar\?returnTo=/);
  });

  test('CA-F11-32: a aba Listas mostra o estado vazio, sincroniza a ordenação na URL e exibe erro com "Tentar novamente"', async ({
    page,
    browser,
  }) => {
    const owner = await createUserWithSession(page, 'lista_estados');
    const ownerId = await userId(owner.username);

    // Estado vazio para o dono sem listas.
    await page.goto(`/jogadores/${owner.username}?secao=listas`);
    await expect(page.getByTestId('listas-vazio')).toContainText('Você ainda não criou listas');

    // Várias listas para exercitar ordenação e paginação.
    await prisma.gameList.createMany({
      data: Array.from({ length: 21 }, (_, index) => ({
        userId: ownerId,
        title: `Lista ${String(index).padStart(2, '0')}`,
      })),
    });

    await page.goto(`/jogadores/${owner.username}?secao=listas`);
    await expect(page.getByTestId('lista-cartao')).toHaveCount(20);

    await page.getByLabel('Ordenar').selectOption({ label: 'Título (A–Z)' });
    await expect(page).toHaveURL(/lsort=title/);
    await expect(page.getByTestId('lista-cartao').nth(0)).toContainText('Lista 00');

    await page.getByRole('button', { name: 'Próxima' }).click();
    await expect(page).toHaveURL(/lpage=2/);
    await expect(page.getByTestId('lista-cartao')).toHaveCount(1);

    // Erro com "Tentar novamente": um visitante sem sessão usa a listagem pública, que é
    // interceptada para responder 500.
    const context = await browser.newContext();
    const visitorPage = await context.newPage();

    try {
      await visitorPage.route('**/api/v1/users/*/lists*', (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
          }),
        }),
      );

      await visitorPage.goto(`/jogadores/${owner.username}?secao=listas`);
      await expect(visitorPage.getByTestId('listas-erro')).toBeVisible();
      await expect(
        visitorPage.getByTestId('listas-erro').getByTestId('tentar-novamente'),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
