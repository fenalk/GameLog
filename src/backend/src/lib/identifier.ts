/** Formato de UUID (qualquer versão), usado para distinguir `id` de `slug`. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Identifier = { kind: 'id'; value: string } | { kind: 'slug'; value: string };

/**
 * Resolve identificadores que aceitam `id` (UUID) ou `slug` (seção 2 da SPEC F3 e
 * RN-F5-09): o slug nunca tem formato de UUID, então qualquer outro valor é tratado como
 * slug e responde `404` se não existir.
 */
export function parseIdentifier(raw: string): Identifier {
  const value = raw.trim();

  if (UUID_PATTERN.test(value)) {
    return { kind: 'id', value: value.toLowerCase() };
  }

  return { kind: 'slug', value };
}
