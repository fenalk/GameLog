import { z } from 'zod';

import {
  PASSWORD_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  emailSchema,
  passwordSchema,
  roleSchema,
} from './auth.js';

export const DISPLAY_NAME_MAX_LENGTH = 50;
export const BIO_MAX_LENGTH = 300;
export const AVATAR_URL_MAX_LENGTH = 500;

/** Caracteres de controle Unicode (categoria Cc), proibidos no nome de exibição (RN-F2-02). */
const CONTROL_CHARACTERS_PATTERN = /[\p{Cc}]/u;

const DISPLAY_NAME_LENGTH_MESSAGE = `Nome de exibição deve ter entre 1 e ${DISPLAY_NAME_MAX_LENGTH} caracteres`;
const CURRENT_PASSWORD_MESSAGE = 'Informe a senha atual';

/**
 * `displayName` (RN-F2-02): 1–50 caracteres após `trim`, sem caracteres de controle.
 * `null` restaura o `username` na edição parcial (RN-F2-04).
 */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, DISPLAY_NAME_LENGTH_MESSAGE)
  .max(DISPLAY_NAME_MAX_LENGTH, DISPLAY_NAME_LENGTH_MESSAGE)
  .refine(
    (value) => !CONTROL_CHARACTERS_PATTERN.test(value),
    'Nome de exibição não pode conter caracteres de controle',
  );

/** `bio` (RN-F2-02): até 300 caracteres, nulável. */
export const bioSchema = z
  .string()
  .max(BIO_MAX_LENGTH, `Bio deve ter no máximo ${BIO_MAX_LENGTH} caracteres`);

/** `avatarUrl` (RN-F2-02): URL `https` de até 500 caracteres, nulável. */
export const avatarUrlSchema = z
  .string()
  .max(
    AVATAR_URL_MAX_LENGTH,
    `URL do avatar deve ter no máximo ${AVATAR_URL_MAX_LENGTH} caracteres`,
  )
  .pipe(z.url({ protocol: /^https$/, error: 'URL do avatar deve ser uma URL https válida' }));

/** Corpo de `PATCH /me/profile`: edição parcial — campo omitido não muda (RN-F2-04). */
export const profileUpdateSchema = z.strictObject(
  {
    displayName: displayNameSchema.nullable().optional(),
    bio: bioSchema.nullable().optional(),
    avatarUrl: avatarUrlSchema.nullable().optional(),
  },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/**
 * Senha atual exigida pelas operações sensíveis (RN-F2-05 a RN-F2-07): não passa pela
 * política de senha nova, apenas garante entrada não vazia e limitada.
 */
const currentPasswordSchema = z
  .string()
  .min(1, CURRENT_PASSWORD_MESSAGE)
  .max(PASSWORD_MAX_LENGTH, `Senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres`);

/** Corpo de `PATCH /me/email` (RN-F2-05). */
export const emailChangeSchema = z.strictObject(
  {
    email: emailSchema,
    currentPassword: currentPasswordSchema,
  },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type EmailChangeInput = z.infer<typeof emailChangeSchema>;

/** Corpo de `PATCH /me/password` (RN-F2-06): `newPassword` segue a política da F1. */
export const passwordChangeSchema = z.strictObject(
  {
    currentPassword: currentPasswordSchema,
    newPassword: passwordSchema,
  },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

/** Corpo de `DELETE /me` (RN-F2-07). */
export const accountDeleteSchema = z.strictObject(
  { password: currentPasswordSchema },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type AccountDeleteInput = z.infer<typeof accountDeleteSchema>;

/**
 * Perfil público (RN-F2-01): e-mail, papel e hash de senha nunca aparecem. Contrato
 * extensível — SPECs posteriores acrescentam campos de forma aditiva (RN-F2-09). A F12
 * (RN-F12-06) acrescenta `followersCount`, `followingCount` e `isFollowedByMe`; o último é
 * `false` para visitante, para o próprio perfil e quando não há vínculo.
 */
export const publicProfileSchema = z.object({
  username: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  followersCount: z.number().int(),
  followingCount: z.number().int(),
  isFollowedByMe: z.boolean(),
});

export type PublicProfile = z.infer<typeof publicProfileSchema>;

/** Perfil próprio (seção 2 da SPEC F2): o perfil público mais `id`, `email` e `role`. */
export const ownProfileSchema = publicProfileSchema.extend({
  id: z.uuid(),
  email: z.string(),
  role: roleSchema,
});

export type OwnProfile = z.infer<typeof ownProfileSchema>;

/** Resposta de `PATCH /me/password`: novo access token; o refresh vai apenas no cookie (RN-F2-06). */
export const passwordChangeResponseSchema = z.object({ accessToken: z.string() });

export type PasswordChangeResponse = z.infer<typeof passwordChangeResponseSchema>;

/**
 * Parâmetro `:username` das rotas de perfil. O formato não é validado aqui de propósito:
 * um username inexistente (mesmo fora do padrão de cadastro) deve responder 404 — a
 * normalização e a busca sem diferenciar maiúsculas ficam no serviço (CA-F2-02).
 */
export const profileUsernameParamsSchema = z.object({
  username: z.string().min(1).max(USERNAME_MAX_LENGTH),
});

export const PROFILE_ROUTES = {
  /** Padrão da rota do perfil público (backend). */
  publicProfile: '/users/:username',
  myProfile: '/me/profile',
  myEmail: '/me/email',
  myPassword: '/me/password',
  myAccount: '/me',
} as const;

/** Caminho do perfil público de um `username` (frontend e testes). */
export function publicProfilePath(username: string): string {
  return `/users/${encodeURIComponent(username)}`;
}
