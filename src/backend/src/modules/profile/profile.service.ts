import {
  ERROR_CODES,
  type EmailChangeInput,
  type OwnProfile,
  type PasswordChangeInput,
  type ProfileUpdateInput,
  type PublicProfile,
} from '@gamelog/shared';

import type { User } from '../../generated/prisma/client.js';
import { apiErrors } from '../../lib/api-error.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
import { issueSession } from '../auth/auth.service.js';

/** Campos que compõem o perfil; o hash de senha nunca é selecionado (RN-F2-01). */
const PROFILE_SELECT = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  role: true,
  createdAt: true,
} as const;

type ProfileRecord = Pick<User, keyof typeof PROFILE_SELECT>;

function toPublicProfile(user: ProfileRecord): PublicProfile {
  return {
    username: user.username,
    // RN-F2-02: `displayName` nulo é exibido como o `username` (padrão).
    displayName: user.displayName ?? user.username,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

function toOwnProfile(user: ProfileRecord): OwnProfile {
  return { id: user.id, email: user.email, role: user.role, ...toPublicProfile(user) };
}

async function findUserOrFail(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw apiErrors.unauthenticated('Token de acesso inválido ou expirado');
  }

  return user;
}

/** Confere a senha atual das operações sensíveis (RN-F2-05 a RN-F2-07). */
async function assertCurrentPassword(user: User, password: string): Promise<void> {
  const matches = await verifyPassword(user.passwordHash, password);

  if (!matches) {
    throw apiErrors.invalidCurrentPassword();
  }
}

/**
 * Perfil público (RN-F2-01): a busca normaliza a entrada (`trim` + minúsculas), o que a
 * torna insensível a maiúsculas/minúsculas sobre o `username` persistido (CA-F2-02).
 */
export async function getPublicProfileByUsername(rawUsername: string): Promise<PublicProfile> {
  const username = rawUsername.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { username }, select: PROFILE_SELECT });

  if (!user) {
    throw apiErrors.notFound('Perfil não encontrado');
  }

  return toPublicProfile(user);
}

/** Perfil próprio (seção 2 da SPEC F2): inclui `email` e `role`. */
export async function getOwnProfile(userId: string): Promise<OwnProfile> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });

  if (!user) {
    throw apiErrors.unauthenticated('Token de acesso inválido ou expirado');
  }

  return toOwnProfile(user);
}

/**
 * Edição parcial (RN-F2-04): campo omitido não muda; `null` limpa `bio`/`avatarUrl` e
 * `displayName: null` volta a exibir o `username`.
 */
export async function updateOwnProfile(
  userId: string,
  input: ProfileUpdateInput,
): Promise<OwnProfile> {
  const data: { displayName?: string | null; bio?: string | null; avatarUrl?: string | null } = {};

  if (input.displayName !== undefined) {
    data.displayName = input.displayName;
  }

  if (input.bio !== undefined) {
    data.bio = input.bio;
  }

  if (input.avatarUrl !== undefined) {
    data.avatarUrl = input.avatarUrl;
  }

  const user = await prisma.user.update({ where: { id: userId }, data, select: PROFILE_SELECT });

  return toOwnProfile(user);
}

/** Troca de e-mail (RN-F2-05): exige a senha atual e mantém a unicidade do e-mail. */
export async function changeEmail(userId: string, input: EmailChangeInput): Promise<OwnProfile> {
  const user = await findUserOrFail(userId);
  await assertCurrentPassword(user, input.currentPassword);

  if (input.email === user.email) {
    throw apiErrors.validation('O novo e-mail deve ser diferente do atual', [
      { field: 'email', message: 'Informe um e-mail diferente do atual' },
    ]);
  }

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { email: input.email },
      select: PROFILE_SELECT,
    });

    return toOwnProfile(updated);
  } catch (error) {
    // Corrida entre duas requisições simultâneas: a unicidade do banco decide o código.
    if (isUniqueViolation(error, 'email')) {
      throw apiErrors.conflict(ERROR_CODES.emailTaken, 'Este e-mail já está cadastrado');
    }

    throw error;
  }
}

export type PasswordChangeSession = { accessToken: string; refreshToken: string };

/**
 * Troca de senha (RN-F2-06): exige a senha atual, recusa a nova igual à atual, revoga
 * **todos** os refresh tokens do usuário e emite um novo par para a sessão atual.
 */
export async function changePassword(
  userId: string,
  input: PasswordChangeInput,
): Promise<PasswordChangeSession> {
  const user = await findUserOrFail(userId);
  await assertCurrentPassword(user, input.currentPassword);

  if (await verifyPassword(user.passwordHash, input.newPassword)) {
    throw apiErrors.validation('A nova senha deve ser diferente da atual', [
      { field: 'newPassword', message: 'A nova senha deve ser diferente da atual' },
    ]);
  }

  const passwordHash = await hashPassword(input.newPassword);
  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  const session = await issueSession(updated);

  return { accessToken: session.accessToken, refreshToken: session.refreshToken };
}

/**
 * Exclusão de conta (RN-F2-07), irreversível: exige a senha, impede o último `ADMIN`
 * ativo de se excluir e remove os dados do usuário (os refresh tokens caem por cascade
 * da chave estrangeira; os dados das SPECs posteriores também usarão cascade).
 */
export async function deleteAccount(userId: string, password: string): Promise<void> {
  const user = await findUserOrFail(userId);
  await assertCurrentPassword(user, password);

  if (user.role === 'ADMIN') {
    const activeAdmins = await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });

    if (activeAdmins <= 1) {
      throw apiErrors.lastAdmin();
    }
  }

  await prisma.user.delete({ where: { id: userId } });
}
