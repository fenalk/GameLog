import {
  ERROR_CODES,
  INVALID_CREDENTIALS_MESSAGE,
  type LoginInput,
  type RegisterInput,
} from '@gamelog/shared';
import type { User } from '../../generated/prisma/client.js';
import { apiErrors } from '../../lib/api-error.js';
import { fakePasswordHash, hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
import {
  hashRefreshTokenJti,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/tokens.js';

export type PublicUser = {
  id: string;
  username: string;
  email: string;
  role: User['role'];
};

export type IssuedSession = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

function toPublicUser(user: User): PublicUser {
  return { id: user.id, username: user.username, email: user.email, role: user.role };
}

/** Emite o par de tokens e persiste o hash do `jti` do refresh (RN-F1-09). */
export async function issueSession(user: User): Promise<IssuedSession> {
  const accessToken = signAccessToken(user.id);
  const refresh = signRefreshToken(user.id);

  await prisma.refreshToken.create({
    data: {
      jtiHash: hashRefreshTokenJti(refresh.jti),
      userId: user.id,
      expiresAt: refresh.expiresAt,
    },
  });

  return { user: toPublicUser(user), accessToken, refreshToken: refresh.token };
}

/**
 * Cadastro (RN-F1-01 a RN-F1-05): cria sempre `PLAYER`/`ACTIVE` com senha em argon2id.
 * Username e e-mail já chegam normalizados pelo `registerSchema`.
 */
export async function registerUser(input: RegisterInput): Promise<IssuedSession> {
  const { username, email, password } = input;

  const [existingUsername, existingEmail] = await Promise.all([
    prisma.user.findUnique({ where: { username }, select: { id: true } }),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);

  if (existingUsername) {
    throw apiErrors.conflict(ERROR_CODES.usernameTaken, 'Este nome de usuário já está em uso');
  }

  if (existingEmail) {
    throw apiErrors.conflict(ERROR_CODES.emailTaken, 'Este e-mail já está cadastrado');
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: { username, email, passwordHash, role: 'PLAYER', status: 'ACTIVE' },
    });

    return await issueSession(user);
  } catch (error) {
    // Corrida entre duas requisições simultâneas: a unicidade do banco decide o código.
    if (isUniqueViolation(error, 'username')) {
      throw apiErrors.conflict(ERROR_CODES.usernameTaken, 'Este nome de usuário já está em uso');
    }

    if (isUniqueViolation(error, 'email')) {
      throw apiErrors.conflict(ERROR_CODES.emailTaken, 'Este e-mail já está cadastrado');
    }

    throw error;
  }
}

export type LoginResult =
  | { outcome: 'success'; session: IssuedSession }
  | { outcome: 'invalid-credentials' }
  | { outcome: 'suspended' };

/**
 * Login por e-mail ou username (RN-F1-06/RN-F1-07): usuário inexistente e senha errada
 * produzem o mesmo resultado e o mesmo custo de verificação (hash fictício).
 */
export async function loginUser(input: LoginInput): Promise<LoginResult> {
  const { identifier, password } = input;

  const user = await prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }] },
  });

  if (!user) {
    await verifyPassword(await fakePasswordHash(), password);
    return { outcome: 'invalid-credentials' };
  }

  const passwordMatches = await verifyPassword(user.passwordHash, password);

  if (!passwordMatches) {
    return { outcome: 'invalid-credentials' };
  }

  if (user.status === 'SUSPENDED') {
    return { outcome: 'suspended' };
  }

  return { outcome: 'success', session: await issueSession(user) };
}

/**
 * Rotação do refresh (RN-F1-10): revoga o token usado e emite um novo par. O reuso de um
 * token já revogado revoga **todos** os refresh tokens do usuário.
 */
export async function rotateRefreshToken(rawToken: string | undefined): Promise<IssuedSession> {
  if (!rawToken) {
    throw apiErrors.unauthenticated('Sessão não encontrada');
  }

  let jti: string;

  try {
    jti = verifyRefreshToken(rawToken).jti;
  } catch {
    throw apiErrors.unauthenticated('Sessão inválida ou expirada');
  }

  const record = await prisma.refreshToken.findUnique({
    where: { jtiHash: hashRefreshTokenJti(jti) },
    include: { user: true },
  });

  if (!record) {
    throw apiErrors.unauthenticated('Sessão inválida ou expirada');
  }

  if (record.revokedAt) {
    // Reuso detectado: invalida todas as sessões ativas do usuário.
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw apiErrors.unauthenticated('Sessão inválida ou expirada');
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    throw apiErrors.unauthenticated('Sessão inválida ou expirada');
  }

  if (record.user.status === 'SUSPENDED') {
    throw apiErrors.accountSuspended();
  }

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });

  return issueSession(record.user);
}

/**
 * Logout idempotente (RN-F1-11): revoga o refresh atual quando ele existe e é válido;
 * qualquer outro caso é tratado como sessão já encerrada.
 */
export async function revokeRefreshToken(rawToken: string | undefined): Promise<void> {
  if (!rawToken) {
    return;
  }

  let jti: string;

  try {
    jti = verifyRefreshToken(rawToken).jti;
  } catch {
    return;
  }

  await prisma.refreshToken.updateMany({
    where: { jtiHash: hashRefreshTokenJti(jti), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export { INVALID_CREDENTIALS_MESSAGE };
