import { roleSatisfies, type Role } from '@gamelog/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { apiErrors } from '../lib/api-error.js';
import type { AuthUser } from '../lib/auth-user.js';
import { prisma } from '../lib/prisma.js';
import { InvalidTokenError, verifyAccessToken } from '../lib/tokens.js';

export type { AuthUser };

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchido por `authenticate`/`optionalAuthenticate`; `null` = anônimo. */
    user: AuthUser | null;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      ...roles: Role[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function bearerTokenFrom(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;

  if (!header) {
    return undefined;
  }

  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return undefined;
  }

  return token;
}

/**
 * Valida o access token e recarrega o usuário do banco a cada requisição (RN-F1-12):
 * o papel e o status nunca são confiados ao token, então suspensão e mudança de papel
 * têm efeito imediato.
 */
async function resolveUserFromToken(token: string): Promise<AuthUser> {
  let userId: string;

  try {
    userId = verifyAccessToken(token).sub;
  } catch (error) {
    if (error instanceof InvalidTokenError) {
      throw apiErrors.unauthenticated('Token de acesso inválido ou expirado');
    }

    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, role: true, status: true },
  });

  if (!user) {
    throw apiErrors.unauthenticated('Token de acesso inválido ou expirado');
  }

  if (user.status === 'SUSPENDED') {
    throw apiErrors.accountSuspended();
  }

  return { id: user.id, username: user.username, role: user.role, status: user.status };
}

/** Exige um access token válido; popula `request.user` — seção 4 da SPEC F1. */
export const authenticate = async (request: FastifyRequest): Promise<void> => {
  const token = bearerTokenFrom(request);

  if (!token) {
    throw apiErrors.unauthenticated('Token de acesso ausente');
  }

  request.user = await resolveUserFromToken(token);
};

/** Sem token → anônimo; com token válido → popula `request.user`; token inválido → 401. */
export const optionalAuthenticate = async (request: FastifyRequest): Promise<void> => {
  const token = bearerTokenFrom(request);

  if (!token) {
    request.user = null;
    return;
  }

  request.user = await resolveUserFromToken(token);
};

/**
 * Autorização por papel com hierarquia `ADMIN > PLAYER` (seção 4 da SPEC F1): um
 * `ADMIN` satisfaz `requireRole('PLAYER')`.
 */
export function requireRole(
  ...roles: Role[]
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest): Promise<void> => {
    const user: AuthUser | null = request.user;

    if (!user) {
      throw apiErrors.unauthenticated('Token de acesso ausente');
    }

    if (!roles.some((required) => roleSatisfies(user.role, required))) {
      throw apiErrors.forbidden();
    }
  };
}

/**
 * Plugin reutilizável de autenticação/autorização (T1.08): registrado na raiz da
 * aplicação, expõe os hooks e o helper para os módulos das demais etapas.
 */
export const authPlugin = fp(
  async (app: FastifyInstance) => {
    app.decorateRequest('user', null);
    app.decorate('authenticate', authenticate);
    app.decorate('optionalAuthenticate', optionalAuthenticate);
    app.decorate('requireRole', requireRole);
  },
  { name: 'auth' },
);
