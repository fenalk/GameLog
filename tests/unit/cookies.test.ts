import { REFRESH_COOKIE_PATH } from '@gamelog/shared';
import { describe, expect, it } from 'vitest';

import { buildRefreshCookieOptions } from '../../src/backend/src/lib/cookies.js';

describe('CA-F1-10: opções do cookie de refresh', () => {
  it('marca Secure apenas quando o ambiente é produção', () => {
    expect(buildRefreshCookieOptions(true).secure).toBe(true);
    expect(buildRefreshCookieOptions(false).secure).toBe(false);
  });

  it('usa HttpOnly, SameSite=Strict e restringe o caminho à autenticação', () => {
    const options = buildRefreshCookieOptions(false);

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('strict');
    expect(options.path).toBe(REFRESH_COOKIE_PATH);
    expect(REFRESH_COOKIE_PATH).toBe('/api/v1/auth');
  });
});
