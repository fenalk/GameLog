/** Formato de UUID (qualquer versão), usado para distinguir `id` de `slug` (RN-F4-03). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GameIdentifier = { kind: 'id'; value: string } | { kind: 'slug'; value: string };

/**
 * Resolve o parâmetro `:game` das rotas de catálogo (seção 2 da SPEC F3): aceita o `id`
 * (UUID) ou o `slug`. O slug nunca tem formato de UUID (RN-F4-03); qualquer outro valor
 * é tratado como slug e responde `404` se não existir.
 */
export function parseGameIdentifier(raw: string): GameIdentifier {
  const value = raw.trim();

  if (UUID_PATTERN.test(value)) {
    return { kind: 'id', value: value.toLowerCase() };
  }

  return { kind: 'slug', value };
}
