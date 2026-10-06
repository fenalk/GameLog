import { PrismaPg } from '@prisma/adapter-pg';
import { expect, request, test, type Page } from '@playwright/test';

import { PrismaClient } from '../../src/backend/src/generated/prisma/client.js';
import { createGame } from '../helpers/catalog.js';
import { createReview } from '../helpers/reviews.js';
import { resolveTestDatabaseUrl } from '../setup/test-database.js';

// O arquivo roda em série: as fixtures do catálogo e das resenhas são preparadas uma vez e
// compartilhadas pelas verificações (a F4, que criaria jogos pela API, ainda não existe).
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'senhaForte1';
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

/** Sufixo único por execução para não colidir com dados de execuções anteriores. */
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;

const GAME_WRITE = `resenha-write-${RUN}`;
const GAME_VISITOR = `resenha-visitor-${RUN}`;
const GAME_MINE_A = `resenha-mine-a-${RUN}`;
const GAME_MINE_B = `resenha-mine-b-${RUN}`;
const GAME_MINE_HIDDEN = `resenha-mine-hidden-${RUN}`;
const GAME_EDITOR = `resenha-editor-${RUN}`;
const GAME_PERMALINK = `resenha-permalink-${RUN}`;
const GAME_HIDDEN = `resenha-hidden-${RUN}`;

const XSS_BODY = '<script>alert("xss")</script>\n<img src=x onerror=alert(1)>';

let prisma: PrismaClient;
let permalinkReviewId = '';
let hiddenReviewId = '';

/** Conta dona das fixtures de resenhas do perfil (duas publicadas e uma oculta). */
const profileOwner = {
  username: `resenha_dono_${RUN}`.slice(0, 30),
  email: `resenha_dono_${RUN}@example.com`,
  password: PASSWORD,
};

/** Conta dona das fixtures do permalink e da resenha oculta de terceiros. */
const permalinkOwner = {
  username: `resenha_link_${RUN}`.slice(0, 30),
  email: `resenha_link_${RUN}@example.com`,
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

/** Registra um handler de diálogos para provar que o conteúdo não executa scripts. */
function trackDialogs(page: Page): { count: () => number } {
  let dialogs = 0;

  page.on('dialog', (dialog) => {
    dialogs += 1;
    void dialog.dismiss();
  });

  return { count: () => dialogs };
}

async function fillReviewForm(page: Page, values: { title?: string; body?: string }) {
  if (values.title !== undefined) {
    await page.getByLabel('Título').fill(values.title);
  }

  if (values.body !== undefined) {
    await page.getByLabel('Corpo').fill(values.body);
  }
}

test.beforeAll(async () => {
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: resolveTestDatabaseUrl() }),
  });

  for (const [slug, title] of [
    [GAME_WRITE, `Jogo Escrita ${RUN}`],
    [GAME_VISITOR, `Jogo Visitante ${RUN}`],
    [GAME_MINE_A, `Jogo Meu A ${RUN}`],
    [GAME_MINE_B, `Jogo Meu B ${RUN}`],
    [GAME_MINE_HIDDEN, `Jogo Meu Oculto ${RUN}`],
    [GAME_EDITOR, `Jogo Editor ${RUN}`],
    [GAME_PERMALINK, `Jogo Link ${RUN}`],
    [GAME_HIDDEN, `Jogo Oculto ${RUN}`],
  ] as const) {
    await createGame(prisma, { slug, title });
  }

  // Resenha publicada visível ao visitante.
  const visitorAuthor = uniqueUser('resenha_visitante');
  await createUserThroughApi(visitorAuthor);
  await createReview(prisma, {
    userId: await userId(visitorAuthor.username),
    gameId: await gameId(GAME_VISITOR),
    title: 'Resenha pública do visitante',
    body: 'Texto visível sem autenticação.',
  });

  // Fixtures do perfil: duas publicadas e uma oculta do mesmo autor.
  await createUserThroughApi(profileOwner);
  const ownerId = await userId(profileOwner.username);
  await createReview(prisma, {
    userId: ownerId,
    gameId: await gameId(GAME_MINE_A),
    title: 'Minha resenha publicada A',
    body: 'Primeiro texto.',
  });
  await createReview(prisma, {
    userId: ownerId,
    gameId: await gameId(GAME_MINE_B),
    title: 'Minha resenha publicada B',
    body: 'Segundo texto.',
  });
  await createReview(prisma, {
    userId: ownerId,
    gameId: await gameId(GAME_MINE_HIDDEN),
    title: 'Minha resenha oculta',
    body: 'Texto oculto pela moderação.',
    status: 'HIDDEN',
  });

  // Fixture do permalink (publicada) e da resenha oculta de terceiros.
  await createUserThroughApi(permalinkOwner);
  const permalinkOwnerId = await userId(permalinkOwner.username);
  permalinkReviewId = (
    await createReview(prisma, {
      userId: permalinkOwnerId,
      gameId: await gameId(GAME_PERMALINK),
      title: 'Permalink público',
      body: 'Primeira linha.\nSegunda linha.',
    })
  ).id;
  hiddenReviewId = (
    await createReview(prisma, {
      userId: permalinkOwnerId,
      gameId: await gameId(GAME_HIDDEN),
      title: 'Permalink oculto',
      body: 'Não deve aparecer para terceiros.',
      status: 'HIDDEN',
    })
  ).id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('SPEC F10 — resenhas (interface)', () => {
  test('CA-F10-21: o jogador escreve, edita e remove a resenha pela página do jogo', async ({
    page,
  }) => {
    await createUserWithSession(page, 'resenha_crud');

    await page.goto(`/jogos/${GAME_WRITE}`);

    await expect(page.getByTestId('resenhas-secao')).toBeVisible();
    await expect(page.getByTestId('resenhas-total')).toHaveText('0');
    await expect(page.getByTestId('resenhas-vazio')).toHaveText(
      'Ainda não há resenhas para este jogo',
    );

    await page.getByTestId('resenha-escrever').click();
    await expect(page).toHaveURL(`/jogos/${GAME_WRITE}/resenha`);
    await expect(page.getByTestId('editor-titulo')).toHaveText('Escrever resenha');

    await fillReviewForm(page, {
      title: 'Meu título',
      body: 'Primeira linha.\nSegunda linha.',
    });
    await expect(page.getByTestId('resenha-preview-corpo')).toContainText('Primeira linha.');

    await page.getByTestId('resenha-salvar').click();

    const card = page.getByTestId('cartao-resenha');
    await expect(page).toHaveURL(`/jogos/${GAME_WRITE}`);
    await expect(card).toBeVisible();
    await expect(card.getByTestId('cartao-resenha-titulo')).toHaveText('Meu título');
    await expect(card.getByTestId('cartao-resenha-corpo')).toContainText('Segunda linha.');
    await expect(page.getByTestId('resenhas-total')).toHaveText('1');
    await expect(page.getByTestId('resenha-item')).toHaveCount(1);
    await expect(page.getByTestId('resenha-titulo')).toHaveText('Meu título');

    // Editar pelo cartão: o editor abre preenchido e salva as alterações.
    await page.getByTestId('cartao-resenha-editar').click();
    await expect(page.getByTestId('editor-titulo')).toHaveText('Editar resenha');
    await fillReviewForm(page, { title: 'Título editado' });
    await page.getByTestId('resenha-salvar').click();

    await expect(page.getByTestId('cartao-resenha-titulo')).toHaveText('Título editado');
    await expect(page.getByTestId('resenha-titulo')).toHaveText('Título editado');

    // Remover exige confirmação.
    await page.getByTestId('cartao-resenha-remover').click();
    await expect(page.getByRole('dialog', { name: 'Remover resenha' })).toBeVisible();
    await page.getByTestId('confirmar-remocao').click();

    await expect(page.getByTestId('cartao-resenha')).toHaveCount(0);
    await expect(page.getByTestId('resenha-escrever')).toBeVisible();
    await expect(page.getByTestId('resenhas-vazio')).toBeVisible();
    await expect(page.getByTestId('resenhas-total')).toHaveText('0');
  });

  test('CA-F10-22: o visitante lê as resenhas publicadas e é levado ao login com returnTo', async ({
    page,
  }) => {
    await page.goto(`/jogos/${GAME_VISITOR}`);

    await expect(page.getByTestId('resenha-item')).toHaveCount(1);
    await expect(page.getByTestId('resenha-titulo')).toHaveText('Resenha pública do visitante');
    await expect(page.getByTestId('resenha-trecho')).toContainText('Texto visível');

    await page.getByTestId('resenha-escrever').click();

    await expect(page).toHaveURL(`/entrar?returnTo=%2Fjogos%2F${GAME_VISITOR}`);
  });

  test('CA-F10-23: o dono vê as próprias resenhas (inclusive ocultas) com ações no perfil', async ({
    page,
  }) => {
    await loginViaUi(page, profileOwner);
    await page.goto(`/jogadores/${profileOwner.username}`);

    await page.getByTestId('aba-resenhas').click();

    const items = page.getByTestId('resenha-item');
    await expect(items).toHaveCount(3);
    await expect(page.getByTestId('resenha-status')).toHaveText('Oculta');
    await expect(page.getByTestId('resenha-editar')).toHaveCount(3);
    await expect(page.getByTestId('resenha-remover')).toHaveCount(3);
    await expect(page.getByTestId('resenhas-lista')).toContainText('Minha resenha publicada A');
  });

  test('CA-F10-23: o visitante vê apenas as resenhas publicadas, sem ações', async ({ page }) => {
    await page.goto(`/jogadores/${profileOwner.username}`);

    await page.getByTestId('aba-resenhas').click();

    await expect(page.getByTestId('resenha-item')).toHaveCount(2);
    await expect(page.getByTestId('resenha-status')).toHaveCount(0);
    await expect(page.getByTestId('resenha-editar')).toHaveCount(0);
    await expect(page.getByTestId('resenha-remover')).toHaveCount(0);
  });

  test('CA-F10-24: o editor valida título/corpo e exibe o texto literalmente (sem XSS)', async ({
    page,
  }) => {
    const dialogs = trackDialogs(page);

    await createUserWithSession(page, 'resenha_editor');
    await page.goto(`/jogos/${GAME_EDITOR}/resenha`);

    // Campos vazios: erros por campo.
    await page.getByTestId('resenha-salvar').click();
    await expect(page.getByTestId('erro-title')).toBeVisible();
    await expect(page.getByTestId('erro-body')).toBeVisible();

    await fillReviewForm(page, { title: 'Sobre scripts', body: XSS_BODY });

    // A pré-visualização trata o conteúdo como texto puro (sem interpretar HTML).
    const preview = page.getByTestId('resenha-preview-corpo');
    await expect(preview).toContainText('<script>alert("xss")</script>');
    await expect(preview).toContainText('<img src=x onerror=alert(1)>');

    await page.getByTestId('resenha-salvar').click();
    await expect(page).toHaveURL(`/jogos/${GAME_EDITOR}`);

    const body = page.getByTestId('cartao-resenha-corpo');
    await expect(body).toContainText('<script>alert("xss")</script>');
    const text = await body.textContent();
    expect(text).toContain('\n');
    expect(dialogs.count()).toBe(0);
  });

  test('CA-F10-25: o permalink exibe o detalhe completo e 404 para inexistente/oculta', async ({
    page,
  }) => {
    await page.goto(`/resenhas/${permalinkReviewId}`);

    await expect(page.getByTestId('resenha-permalink-titulo')).toHaveText('Permalink público');
    await expect(page.getByTestId('resenha-permalink-corpo')).toContainText('Primeira linha.');
    await expect(page.getByTestId('resenha-permalink-autor')).toContainText(
      permalinkOwner.username,
    );
    await expect(page.getByTestId('resenha-permalink-jogo')).toHaveText(`Jogo Link ${RUN}`);

    const bodyText = await page.getByTestId('resenha-permalink-corpo').textContent();
    expect(bodyText).toContain('\n');

    // Resenha inexistente.
    await page.goto('/resenhas/3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    await expect(page.getByTestId('pagina-404')).toBeVisible();
    await expect(page.getByTestId('pagina-404')).toContainText('Resenha não encontrada');

    // Resenha oculta de terceiros.
    await page.goto(`/resenhas/${hiddenReviewId}`);
    await expect(page.getByTestId('pagina-404')).toBeVisible();
    await expect(page.getByTestId('pagina-404')).toContainText('Resenha não encontrada');
  });
});
