import { describe, expect, it } from 'vitest';

import { safeReturnTo } from '../../src/frontend/src/lib/navigation.js';

describe('rotas protegidas: parâmetro returnTo', () => {
  it('preserva caminhos internos', () => {
    expect(safeReturnTo('/conta')).toBe('/conta');
    expect(safeReturnTo('/conta?aba=perfil')).toBe('/conta?aba=perfil');
  });

  it('cai para a raiz em valor ausente ou externo', () => {
    expect(safeReturnTo(null)).toBe('/');
    expect(safeReturnTo('')).toBe('/');
    expect(safeReturnTo('https://exemplo.com/pagina')).toBe('/');
    expect(safeReturnTo('//exemplo.com')).toBe('/');
  });

  it('rejeita barras invertidas, que o navegador interpreta como "/"', () => {
    expect(safeReturnTo('/\\evil.com')).toBe('/');
    expect(safeReturnTo('/conta\\evil.com')).toBe('/');
    expect(safeReturnTo('/entrar?returnTo=/\\evil.com')).toBe('/');
  });

  it('rejeita caracteres de controle', () => {
    expect(safeReturnTo('/conta\nHost: evil.com')).toBe('/');
    expect(safeReturnTo('/conta\r\n')).toBe('/');
    expect(safeReturnTo('/conta\u0000')).toBe('/');
  });
});
