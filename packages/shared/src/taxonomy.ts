/**
 * Convenções de taxonomia do catálogo (seção 1 da SPEC F5), compartilhadas pelo backend
 * e pelo frontend e reutilizadas por F6 (plataformas) e F7 (desenvolvedoras):
 * nome de exibição, forma de comparação de unicidade e derivação de slug.
 */

/** Caracteres de controle Unicode (categoria Cc), proibidos nos nomes (RN-F5-02). */
export const CONTROL_CHARACTERS_PATTERN = /[\p{Cc}]/u;

/** Nome de exibição persistido: `trim` + espaços internos colapsados (RN-F5-02). */
export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Forma de comparação de unicidade (RN-F5-02): exibição em minúsculas e sem acentos,
 * de modo que `"Ação"`, `"AÇÃO"` e `"Acao"` sejam equivalentes.
 */
export function normalizeTaxonomyName(value: string): string {
  return normalizeDisplayName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Deriva o slug a partir do nome (RN-F5-03): minúsculas, sem acentos, sequências fora de
 * `[a-z0-9]` viram hífen, hífens colapsados/aparados e truncamento em `maxLength` sem
 * hífen final. Pode retornar vazio (ex.: nome `"!!!"`), caso em que a validação rejeita.
 */
export function deriveSlug(value: string, maxLength: number): string {
  return normalizeTaxonomyName(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}
