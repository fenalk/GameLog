import { normalizeTaxonomyName } from '@gamelog/shared';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { env } from '../../config/env.js';

/**
 * Seed de exemplo do catálogo (seção 1 da SPEC F3): jogos fictícios com gêneros,
 * plataformas e desenvolvedoras para o ambiente de desenvolvimento. É idempotente
 * (reexecutar não duplica nem sobrescreve edições) e nunca roda em produção (CA-F3-23).
 * Os gêneros (SPEC F5, RN-F5-11), as plataformas (SPEC F6, RN-F6-11) e as
 * desenvolvedoras (SPEC F7, RN-F7-11) gravam `name_normalized`.
 */

type SeedTaxonomy = { name: string; slug: string };

const GENRES: SeedTaxonomy[] = [
  { name: 'Ação', slug: 'acao' },
  { name: 'Aventura', slug: 'aventura' },
  { name: 'RPG', slug: 'rpg' },
  { name: 'Estratégia', slug: 'estrategia' },
  { name: 'Corrida', slug: 'corrida' },
  { name: 'Esporte', slug: 'esporte' },
  { name: 'Plataforma', slug: 'plataforma' },
  { name: 'Puzzle', slug: 'puzzle' },
  { name: 'Terror', slug: 'terror' },
  { name: 'Simulação', slug: 'simulacao' },
];

const PLATFORMS: SeedTaxonomy[] = [
  { name: 'PC', slug: 'pc' },
  { name: 'PlayStation 5', slug: 'playstation-5' },
  { name: 'Xbox Series X/S', slug: 'xbox-series-x-s' },
  { name: 'Nintendo Switch', slug: 'nintendo-switch' },
  { name: 'PlayStation 4', slug: 'playstation-4' },
  { name: 'Xbox One', slug: 'xbox-one' },
];

const DEVELOPERS: SeedTaxonomy[] = [
  { name: 'Nebulosa Interativa', slug: 'nebulosa-interativa' },
  { name: 'Velocidade Zero', slug: 'velocidade-zero' },
  { name: 'Órbita Norte', slug: 'orbita-norte' },
  { name: 'Casa Sombria', slug: 'casa-sombria' },
  { name: 'Estúdio Vitral', slug: 'estudio-vitral' },
  { name: 'Formigueiro Games', slug: 'formigueiro-games' },
  { name: 'Pixel Voador', slug: 'pixel-voador' },
  { name: 'Feira Nova', slug: 'feira-nova' },
  { name: 'Forja Sombria', slug: 'forja-sombria' },
  { name: 'Maré Alta Studios', slug: 'mare-alta-studios' },
];

type SeedGame = {
  slug: string;
  title: string;
  description: string;
  releaseDate: string | null;
  coverUrl: string | null;
  genres: string[];
  platforms: string[];
  developers: string[];
};

function cover(slug: string): string {
  return `https://placehold.co/600x900/png?text=${encodeURIComponent(slug)}`;
}

const GAMES: SeedGame[] = [
  {
    slug: 'cronicas-de-aetheria',
    title: 'Crônicas de Aetheria',
    description:
      'Um RPG de mundo aberto em que reinos flutuantes disputam o controle de cristais de éter. Escolhas moldam facções, cidades e o final da jornada.',
    releaseDate: '2019-03-15',
    coverUrl: cover('cronicas-de-aetheria'),
    genres: ['rpg', 'aventura'],
    platforms: ['pc', 'playstation-5', 'xbox-series-x-s'],
    developers: ['nebulosa-interativa'],
  },
  {
    slug: 'corrida-fantasma',
    title: 'Corrida Fantasma',
    description:
      'Corridas noturnas em circuitos urbanos onde fantasmas de pilotos antigos aparecem nas replays para desafiar os recordes.',
    releaseDate: '2021-08-20',
    coverUrl: cover('corrida-fantasma'),
    genres: ['corrida', 'esporte'],
    platforms: ['pc', 'playstation-5'],
    developers: ['velocidade-zero'],
  },
  {
    slug: 'estacao-orbital-7',
    title: 'Estação Orbital 7',
    description:
      'Simulador de gestão de uma estação espacial decadente: recursos escassos, tripulação insatisfeita e meteoros à vista.',
    releaseDate: '2020-11-05',
    coverUrl: cover('estacao-orbital-7'),
    genres: ['simulacao', 'estrategia'],
    platforms: ['pc', 'nintendo-switch'],
    developers: ['orbita-norte'],
  },
  {
    slug: 'o-ultimo-farol',
    title: 'O Último Farol',
    description:
      'Terror psicológico em uma ilha isolada: mantenha o farol aceso enquanto investiga o desaparecimento dos moradores.',
    releaseDate: '2022-10-13',
    coverUrl: cover('o-ultimo-farol'),
    genres: ['terror', 'aventura'],
    platforms: ['pc', 'playstation-4', 'xbox-one'],
    developers: ['casa-sombria'],
  },
  {
    slug: 'jardins-de-vidro',
    title: 'Jardins de Vidro',
    description:
      'Puzzle contemplativo sobre estufas impossíveis, onde cada reflexo muda a posição das peças.',
    releaseDate: '2018-06-01',
    coverUrl: cover('jardins-de-vidro'),
    genres: ['puzzle'],
    platforms: ['pc', 'nintendo-switch'],
    developers: ['estudio-vitral'],
  },
  {
    slug: 'guerra-dos-cogumelos',
    title: 'Guerra dos Cogumelos',
    description:
      'Estratégia leve por turnos: colonize o sub-bosque, negocie com insetos e sobreviva ao inverno.',
    releaseDate: '2017-04-22',
    coverUrl: cover('guerra-dos-cogumelos'),
    genres: ['estrategia'],
    platforms: ['pc', 'nintendo-switch'],
    developers: ['formigueiro-games'],
  },
  {
    slug: 'salto-estelar',
    title: 'Salto Estelar',
    description:
      'Plataforma de precisão em gravidade variável, com fases criadas pela própria comunidade.',
    releaseDate: '2023-02-09',
    coverUrl: cover('salto-estelar'),
    genres: ['plataforma'],
    platforms: ['pc', 'playstation-5', 'nintendo-switch'],
    developers: ['pixel-voador'],
  },
  {
    slug: 'mercado-medieval',
    title: 'Mercado Medieval',
    description:
      'Simulação de comércio em uma vila murada: defina preços, contrate artesãos e evite a ira dos guildas.',
    releaseDate: '2016-09-30',
    coverUrl: cover('mercado-medieval'),
    genres: ['simulacao', 'estrategia'],
    platforms: ['pc'],
    developers: ['feira-nova'],
  },
  {
    slug: 'sombras-de-valdrik',
    title: 'Sombras de Valdrik',
    description:
      'RPG de ação nas terras congeladas de Valdrik, com combate baseado em postura e um mundo que envelhece a cada inverno.',
    releaseDate: '2024-05-17',
    coverUrl: cover('sombras-de-valdrik'),
    genres: ['rpg', 'acao'],
    platforms: ['pc', 'playstation-5', 'xbox-series-x-s'],
    developers: ['forja-sombria', 'nebulosa-interativa'],
  },
  {
    slug: 'lendas-do-asfalto',
    title: 'Lendas do Asfalto',
    description:
      'Corrida arcade estelar com derrapagens exageradas, atalhos secretos e uma trilha sonora inspirada nos anos 80.',
    releaseDate: '2015-07-10',
    coverUrl: cover('lendas-do-asfalto'),
    genres: ['corrida', 'esporte'],
    platforms: ['pc', 'playstation-4', 'xbox-one'],
    developers: ['velocidade-zero'],
  },
  {
    slug: 'ilha-dos-naufragios',
    title: 'Ilha dos Naufrágios',
    description:
      'Aventura cooperativa de exploração marinha: recupere relíquias, monte mapas e desvende a névoa do arquipélago.',
    releaseDate: '2014-03-21',
    coverUrl: cover('ilha-dos-naufragios'),
    genres: ['aventura', 'puzzle'],
    platforms: ['pc', 'nintendo-switch'],
    developers: ['mare-alta-studios'],
  },
  {
    slug: 'academia-de-herois',
    title: 'Academia de Heróis',
    description:
      'RPG de formação: administre uma escola de heróis, treine turmas e envie alunos para missões que podem dar errado.',
    releaseDate: '2025-01-23',
    coverUrl: cover('academia-de-herois'),
    genres: ['rpg', 'plataforma'],
    platforms: ['pc', 'playstation-5', 'nintendo-switch'],
    developers: ['pixel-voador'],
  },
  {
    slug: 'vazio-profundo',
    title: 'Vazio Profundo',
    description: 'Terror submarino em um abismo sem luz, onde o sonar revela mais do que deveria.',
    releaseDate: '2021-12-03',
    coverUrl: cover('vazio-profundo'),
    genres: ['terror'],
    platforms: ['pc', 'playstation-4'],
    developers: ['casa-sombria'],
  },
  {
    slug: 'imperio-das-mares',
    title: 'Império das Marés',
    description:
      'Estratégia naval em um arquipélago volátil: portos, rotas comerciais e tempestades sazonais.',
    releaseDate: '2013-10-18',
    coverUrl: cover('imperio-das-mares'),
    genres: ['estrategia', 'simulacao'],
    platforms: ['pc'],
    developers: ['mare-alta-studios'],
  },
  {
    slug: 'fabrica-de-robos',
    title: 'Fábrica de Robôs',
    description:
      'Puzzle de automação: monte linhas de produção com engrenagens, esteiras e robôs teimosos.',
    releaseDate: '2012-05-25',
    coverUrl: cover('fabrica-de-robos'),
    genres: ['puzzle', 'simulacao'],
    platforms: ['pc', 'playstation-4'],
    developers: ['formigueiro-games'],
  },
  {
    slug: 'trilha-selvagem',
    title: 'Trilha Selvagem',
    description:
      'Esporte de aventura em trilhas de montanha, com escalada, rapel e rios caudalosos.',
    releaseDate: '2022-07-08',
    coverUrl: cover('trilha-selvagem'),
    genres: ['esporte', 'aventura'],
    platforms: ['pc', 'xbox-series-x-s', 'nintendo-switch'],
    developers: ['orbita-norte'],
  },
  {
    slug: 'cidade-submersa',
    title: 'Cidade Submersa',
    description:
      'Aventura investigativa em uma metrópole alagada, onde cada mergulho revela um novo bairro perdido.',
    releaseDate: '2020-02-14',
    coverUrl: cover('cidade-submersa'),
    genres: ['aventura', 'rpg'],
    platforms: ['pc', 'playstation-4', 'xbox-one'],
    developers: ['nebulosa-interativa'],
  },
  {
    slug: 'neblina-vermelha',
    title: 'Neblina Vermelha',
    description:
      'Terror de ação em uma estação de pesquisa onde a neblina transforma qualquer som em perigo.',
    releaseDate: '2019-10-31',
    coverUrl: null,
    genres: ['terror', 'acao'],
    platforms: ['pc', 'xbox-one'],
    developers: ['casa-sombria', 'forja-sombria'],
  },
  {
    slug: 'torneio-de-ferro',
    title: 'Torneio de Ferro',
    description:
      'Esporte de combate futurista com ligas, patrocinadores e um sistema de lesões que muda a carreira.',
    releaseDate: '2011-08-19',
    coverUrl: cover('torneio-de-ferro'),
    genres: ['esporte', 'acao'],
    platforms: ['pc', 'playstation-4', 'xbox-one'],
    developers: ['forja-sombria'],
  },
  {
    slug: 'planetas-de-papel',
    title: 'Planetas de Papel',
    description:
      'Puzzle de dobradura espacial: dobre sistemas planetários para alinhar órbitas e liberar passagens.',
    releaseDate: '2024-09-06',
    coverUrl: cover('planetas-de-papel'),
    genres: ['puzzle', 'aventura'],
    platforms: ['pc', 'nintendo-switch', 'playstation-5'],
    developers: ['estudio-vitral'],
  },
  {
    slug: 'fronteira-distante',
    title: 'Fronteira Distante',
    description:
      'Simulação de colonização em um continente recém-descoberto, com clima dinâmico e povos nativos.',
    releaseDate: '2010-11-12',
    coverUrl: cover('fronteira-distante'),
    genres: ['aventura', 'simulacao'],
    platforms: ['pc'],
    developers: ['feira-nova'],
  },
  {
    slug: 'guardioes-do-bosque',
    title: 'Guardiões do Bosque',
    description:
      'Plataforma cooperativa entre uma raposa e um cervo mágico que trocam de poderes ao se encontrarem.',
    releaseDate: '2009-04-03',
    coverUrl: cover('guardioes-do-bosque'),
    genres: ['plataforma', 'aventura'],
    platforms: ['nintendo-switch', 'playstation-4'],
    developers: ['estudio-vitral'],
  },
  {
    slug: 'eco-do-abismo',
    title: 'Eco do Abismo',
    description:
      'Terror e puzzle em cavernas que respondem a cada passo: barulho atrai, silêncio esconde.',
    releaseDate: '2026-04-10',
    coverUrl: null,
    genres: ['terror', 'puzzle'],
    platforms: ['pc', 'playstation-5', 'xbox-series-x-s'],
    developers: ['casa-sombria'],
  },
  {
    slug: 'velocidade-maxima',
    title: 'Velocidade Máxima',
    description:
      'Corrida de fórmula fictícia com dano de carroceria e campeonatos de longa duração.',
    releaseDate: '2008-06-27',
    coverUrl: cover('velocidade-maxima'),
    genres: ['corrida', 'esporte'],
    platforms: ['pc', 'playstation-4', 'xbox-one'],
    developers: ['velocidade-zero'],
  },
  {
    slug: 'enigma-do-observatorio',
    title: 'Enigma do Observatório',
    description:
      'Puzzle de astronomia antiga: alinhe constelações em um observatório esquecido. Data de lançamento ainda não anunciada.',
    releaseDate: null,
    coverUrl: null,
    genres: ['puzzle', 'aventura'],
    platforms: ['pc'],
    developers: ['orbita-norte'],
  },
];

export type CatalogSeedResult =
  | { status: 'skipped' }
  | { status: 'seeded'; games: number; genres: number; platforms: number; developers: number };

async function ensureTaxonomy(
  findBySlug: (slug: string) => Promise<{ id: string } | null>,
  create: (item: SeedTaxonomy) => Promise<unknown>,
  data: SeedTaxonomy[],
): Promise<number> {
  let created = 0;

  for (const item of data) {
    const existing = await findBySlug(item.slug);

    if (existing) {
      continue;
    }

    await create(item);
    created += 1;
  }

  return created;
}

async function createTaxonomies(prisma: PrismaClient): Promise<{
  genres: number;
  platforms: number;
  developers: number;
}> {
  const genres = await ensureTaxonomy(
    (slug) => prisma.genre.findUnique({ where: { slug }, select: { id: true } }),
    (item) =>
      prisma.genre.create({
        data: { ...item, nameNormalized: normalizeTaxonomyName(item.name) },
      }),
    GENRES,
  );

  const platforms = await ensureTaxonomy(
    (slug) => prisma.platform.findUnique({ where: { slug }, select: { id: true } }),
    (item) =>
      prisma.platform.create({
        data: { ...item, nameNormalized: normalizeTaxonomyName(item.name) },
      }),
    PLATFORMS,
  );

  const developers = await ensureTaxonomy(
    (slug) => prisma.developer.findUnique({ where: { slug }, select: { id: true } }),
    (item) =>
      prisma.developer.create({
        data: { ...item, nameNormalized: normalizeTaxonomyName(item.name) },
      }),
    DEVELOPERS,
  );

  return { genres, platforms, developers };
}

/**
 * Popula o catálogo de exemplo. Em produção retorna `skipped` sem tocar no banco
 * (CA-F3-23); nos demais ambientes é idempotente: jogos e taxonomias existentes (pelo
 * `slug`) são preservados e nada é duplicado.
 */
export async function seedCatalog(
  prisma: PrismaClient,
  nodeEnv: string = env.NODE_ENV,
): Promise<CatalogSeedResult> {
  if (nodeEnv === 'production') {
    return { status: 'skipped' };
  }

  const { genres, platforms, developers } = await createTaxonomies(prisma);

  const genreIds = new Map(
    (await prisma.genre.findMany({ select: { id: true, slug: true } })).map((row) => [
      row.slug,
      row.id,
    ]),
  );
  const platformIds = new Map(
    (await prisma.platform.findMany({ select: { id: true, slug: true } })).map((row) => [
      row.slug,
      row.id,
    ]),
  );
  const developerIds = new Map(
    (await prisma.developer.findMany({ select: { id: true, slug: true } })).map((row) => [
      row.slug,
      row.id,
    ]),
  );

  let games = 0;

  for (const game of GAMES) {
    const existing = await prisma.game.findUnique({
      where: { slug: game.slug },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    await prisma.game.create({
      data: {
        slug: game.slug,
        title: game.title,
        description: game.description,
        releaseDate: game.releaseDate ? new Date(`${game.releaseDate}T00:00:00.000Z`) : null,
        coverUrl: game.coverUrl,
        genres: { create: game.genres.map((slug) => ({ genreId: genreIds.get(slug) as string })) },
        platforms: {
          create: game.platforms.map((slug) => ({ platformId: platformIds.get(slug) as string })),
        },
        developers: {
          create: game.developers.map((slug) => ({
            developerId: developerIds.get(slug) as string,
          })),
        },
      },
    });
    games += 1;
  }

  return { status: 'seeded', games, genres, platforms, developers };
}
