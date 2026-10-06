/** Primeira letra de uma palavra, respeitando pares substitutos (code points). */
function firstCharacter(word: string): string {
  return Array.from(word)[0]?.toUpperCase() ?? '';
}

/**
 * Iniciais exibidas quando o avatar externo não carrega (RN-F2-10): primeira letra das
 * duas primeiras palavras do `displayName` ("Maria Silva" → "MS"); uma única palavra
 * rende uma letra.
 */
export function initialsFor(displayName: string): string {
  const words = displayName
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const [first, second] = words;

  if (!first) {
    return '?';
  }

  return `${firstCharacter(first)}${second ? firstCharacter(second) : ''}`;
}

/** "Membro desde <data>" do perfil público, no formato longo de pt-BR. */
export function formatMemberSince(createdAt: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(createdAt));
}
