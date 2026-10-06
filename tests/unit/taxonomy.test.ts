import { describe, expect, it } from 'vitest';

import {
  DEVELOPER_NAME_MAX_LENGTH,
  DEVELOPER_SLUG_MAX_LENGTH,
  GENRE_NAME_MAX_LENGTH,
  GENRE_SLUG_MAX_LENGTH,
  PLATFORM_NAME_MAX_LENGTH,
  PLATFORM_SLUG_MAX_LENGTH,
  deriveSlug,
  developerNameSchema,
  developerSlugSchema,
  genreNameSchema,
  genreSlugSchema,
  normalizeDisplayName,
  normalizeTaxonomyName,
  platformNameSchema,
  platformSlugSchema,
} from '@gamelog/shared';

describe('convenções de taxonomia (CA-F5-06)', () => {
  it('normaliza o nome de exibição com trim e espaços internos colapsados', () => {
    expect(normalizeDisplayName('  Mundo   Aberto  ')).toBe('Mundo Aberto');
    expect(normalizeDisplayName('RPG')).toBe('RPG');
  });

  it('normaliza para comparação ignorando caixa e acentos', () => {
    expect(normalizeTaxonomyName('Ação')).toBe('acao');
    expect(normalizeTaxonomyName('AÇÃO')).toBe('acao');
    expect(normalizeTaxonomyName('Acao')).toBe('acao');
    expect(normalizeTaxonomyName('  Ficção   Científica ')).toBe('ficcao cientifica');
  });

  it('deriva o slug a partir do nome', () => {
    expect(deriveSlug('Ação', GENRE_SLUG_MAX_LENGTH)).toBe('acao');
    expect(deriveSlug('Mundo Aberto', GENRE_SLUG_MAX_LENGTH)).toBe('mundo-aberto');
    expect(deriveSlug('Ficção Científica', GENRE_SLUG_MAX_LENGTH)).toBe('ficcao-cientifica');
    expect(deriveSlug('  Jogo & Cia!! ', GENRE_SLUG_MAX_LENGTH)).toBe('jogo-cia');
  });

  it('colapsa hífens, apara as extremidades e nunca termina com hífen', () => {
    expect(deriveSlug('A -- B', GENRE_SLUG_MAX_LENGTH)).toBe('a-b');
    expect(deriveSlug('-Início-', GENRE_SLUG_MAX_LENGTH)).toBe('inicio');

    const truncated = deriveSlug('abcde fghij', 7);

    expect(truncated).toBe('abcde-f');
    expect(truncated.endsWith('-')).toBe(false);
    expect(deriveSlug('abcdefg hijkl', 7)).toBe('abcdefg');
  });

  it('trunca no limite informado (o mesmo helper atende F6/F7)', () => {
    expect(deriveSlug('Xbox Series X/S', 70)).toBe('xbox-series-x-s');
    expect(deriveSlug('a'.repeat(80), 60)).toHaveLength(60);
  });

  it('retorna vazio quando o nome não tem letras ou números', () => {
    expect(deriveSlug('!!!', GENRE_SLUG_MAX_LENGTH)).toBe('');
  });

  it('aplica as regras de nome e slug nos schemas compartilhados (RN-F5-02/03)', () => {
    expect(genreNameSchema.parse('  Ficção   Científica ')).toBe('Ficção Científica');
    expect(genreSlugSchema.parse('  Ficcao-Cientifica ')).toBe('ficcao-cientifica');

    expect(genreNameSchema.safeParse('   ').success).toBe(false);
    expect(genreNameSchema.safeParse('a'.repeat(GENRE_NAME_MAX_LENGTH + 1)).success).toBe(false);
    expect(genreNameSchema.safeParse('Nome\u0007Inválido').success).toBe(false);

    expect(genreSlugSchema.safeParse('-acao').success).toBe(false);
    expect(genreSlugSchema.safeParse('acao-').success).toBe(false);
    expect(genreSlugSchema.safeParse('acao--rpg').success).toBe(false);
    expect(genreSlugSchema.safeParse('acao rpg').success).toBe(false);
    expect(genreSlugSchema.safeParse('a'.repeat(GENRE_SLUG_MAX_LENGTH + 1)).success).toBe(false);
  });
});

describe('convenções de taxonomia — plataformas (CA-F6-06)', () => {
  it('deriva slugs de plataformas com o mesmo helper da F5', () => {
    expect(deriveSlug('Xbox Series X/S', PLATFORM_SLUG_MAX_LENGTH)).toBe('xbox-series-x-s');
    expect(deriveSlug('Série X', PLATFORM_SLUG_MAX_LENGTH)).toBe('serie-x');
    expect(deriveSlug('PlayStation 5', PLATFORM_SLUG_MAX_LENGTH)).toBe('playstation-5');
  });

  it('trunca no limite de 70 sem hífen final e reutiliza a normalização', () => {
    const truncated = deriveSlug(`${'a'.repeat(70)} b`, PLATFORM_SLUG_MAX_LENGTH);

    expect(truncated).toHaveLength(PLATFORM_SLUG_MAX_LENGTH);
    expect(truncated.endsWith('-')).toBe(false);
    expect(normalizeTaxonomyName('Série X')).toBe('serie x');
  });

  it('aplica as regras de nome e slug das plataformas (RN-F6-02/03)', () => {
    expect(platformNameSchema.parse('  Xbox   Series X/S ')).toBe('Xbox Series X/S');
    expect(platformSlugSchema.parse('  Xbox-Series-X-S ')).toBe('xbox-series-x-s');

    expect(platformNameSchema.safeParse('   ').success).toBe(false);
    expect(platformNameSchema.safeParse('a'.repeat(PLATFORM_NAME_MAX_LENGTH + 1)).success).toBe(
      false,
    );
    expect(platformSlugSchema.safeParse('-ps5').success).toBe(false);
    expect(platformSlugSchema.safeParse('ps5--xbox').success).toBe(false);
    expect(platformSlugSchema.safeParse('a'.repeat(PLATFORM_SLUG_MAX_LENGTH + 1)).success).toBe(
      false,
    );
  });
});

describe('convenções de taxonomia — desenvolvedoras (CA-F7-06)', () => {
  it('normaliza nome e deriva o slug cobrindo acentos, maiúsculas e símbolos', () => {
    expect(deriveSlug('Órbita Norte', DEVELOPER_SLUG_MAX_LENGTH)).toBe('orbita-norte');
    expect(deriveSlug('Estúdio Vitral', DEVELOPER_SLUG_MAX_LENGTH)).toBe('estudio-vitral');
    expect(deriveSlug('Pixel & Cia', DEVELOPER_SLUG_MAX_LENGTH)).toBe('pixel-cia');
  });

  it('colapsa espaços/hífens, apara as extremidades e trunca em 110 sem hífen final', () => {
    expect(normalizeTaxonomyName('  Órbita   Norte ')).toBe('orbita norte');
    expect(deriveSlug('A -- B', DEVELOPER_SLUG_MAX_LENGTH)).toBe('a-b');
    expect(deriveSlug('-Início-', DEVELOPER_SLUG_MAX_LENGTH)).toBe('inicio');

    // O truncamento corta em 110 e remove o hífen que sobraria na ponta ("…aaa-").
    const truncated = deriveSlug(`${'a'.repeat(109)} b`, DEVELOPER_SLUG_MAX_LENGTH);

    expect(truncated).toBe('a'.repeat(109));
    expect(truncated.endsWith('-')).toBe(false);
    expect(deriveSlug('a'.repeat(120), DEVELOPER_SLUG_MAX_LENGTH)).toHaveLength(
      DEVELOPER_SLUG_MAX_LENGTH,
    );
    expect(deriveSlug('!!!', DEVELOPER_SLUG_MAX_LENGTH)).toBe('');
  });

  it('aplica as regras de nome e slug das desenvolvedoras (RN-F7-02/03)', () => {
    expect(developerNameSchema.parse('  Estúdio   Vitral ')).toBe('Estúdio Vitral');
    expect(developerSlugSchema.parse('  Estudio-Vitral ')).toBe('estudio-vitral');

    expect(developerNameSchema.safeParse('   ').success).toBe(false);
    expect(developerNameSchema.safeParse('a'.repeat(DEVELOPER_NAME_MAX_LENGTH + 1)).success).toBe(
      false,
    );
    expect(developerNameSchema.safeParse('Nome\u0007Inválido').success).toBe(false);

    expect(developerSlugSchema.safeParse('-orbita').success).toBe(false);
    expect(developerSlugSchema.safeParse('orbita-').success).toBe(false);
    expect(developerSlugSchema.safeParse('orbita--norte').success).toBe(false);
    expect(developerSlugSchema.safeParse('orbita norte').success).toBe(false);
    expect(developerSlugSchema.safeParse('a'.repeat(DEVELOPER_SLUG_MAX_LENGTH + 1)).success).toBe(
      false,
    );
  });
});
