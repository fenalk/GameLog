/**
 * Caracteres rejeitados em `returnTo`: barras invertidas (o navegador as trata como `/`
 * ao resolver URLs — `/\evil.com` vira `http://evil.com/`) e caracteres de controle.
 */
function hasUnsafeCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (character === '\\' || codePoint < 0x20 || codePoint === 0x7f) {
      return true;
    }
  }

  return false;
}

/**
 * Só aceita caminhos internos em `returnTo` (seção 6 da SPEC F1), evitando que o
 * parâmetro de redirecionamento leve o usuário para outro site.
 */
export function safeReturnTo(returnTo: string | null): string {
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return '/';
  }

  if (hasUnsafeCharacters(returnTo)) {
    return '/';
  }

  return returnTo;
}
