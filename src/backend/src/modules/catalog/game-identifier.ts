import { parseIdentifier, type Identifier } from '../../lib/identifier.js';

export type GameIdentifier = Identifier;

/**
 * Resolve o parâmetro `:game` das rotas de catálogo (seção 2 da SPEC F3): aceita o `id`
 * (UUID) ou o `slug`. O slug nunca tem formato de UUID (RN-F4-03); qualquer outro valor
 * é tratado como slug e responde `404` se não existir. Reutiliza o helper genérico de
 * identificação, também usado pelos gêneros (RN-F5-09).
 */
export function parseGameIdentifier(raw: string): GameIdentifier {
  return parseIdentifier(raw);
}
