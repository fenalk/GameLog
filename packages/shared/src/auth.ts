import { z } from 'zod';

import { API_PREFIX } from './health.js';

/** Papéis de acesso do GameLog (seção 1 da SPEC F1). Visitante é a ausência de token. */
export const ROLES = ['PLAYER', 'ADMIN'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

/** Hierarquia de papéis: `ADMIN` satisfaz qualquer exigência de `PLAYER` (seção 4 da SPEC F1). */
export const ROLE_RANK: Record<Role, number> = { PLAYER: 1, ADMIN: 2 };

export function roleSatisfies(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;
export const RESERVED_USERNAMES = [
  'admin',
  'administrator',
  'administrador',
  'gamelog',
  'root',
  'suporte',
  'support',
  'me',
  'api',
] as const;

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const USERNAME_LENGTH_MESSAGE = `Nome de usuário deve ter entre ${USERNAME_MIN_LENGTH} e ${USERNAME_MAX_LENGTH} caracteres`;
const PASSWORD_LENGTH_MESSAGE = `Senha deve ter entre ${PASSWORD_MIN_LENGTH} e ${PASSWORD_MAX_LENGTH} caracteres`;

/**
 * `username` normalizado (`trim` + minúsculas) e validado (RN-F1-02). A normalização
 * acontece antes da validação para que `"  Maria_01 "` seja aceito como `maria_01`.
 */
export const usernameFormatSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(USERNAME_MIN_LENGTH, USERNAME_LENGTH_MESSAGE)
      .max(USERNAME_MAX_LENGTH, USERNAME_LENGTH_MESSAGE)
      .regex(
        USERNAME_PATTERN,
        'Nome de usuário pode conter apenas letras minúsculas, números e sublinhado (_)',
      ),
  );

/** `username` de cadastro: além do formato, recusa os nomes reservados (RN-F1-02). */
export const usernameSchema = usernameFormatSchema.refine(
  (value) => !(RESERVED_USERNAMES as readonly string[]).includes(value),
  'Nome de usuário reservado',
);

/** `email` normalizado (`trim` + minúsculas) e validado (RN-F1-03). */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email('E-mail inválido')
      .max(EMAIL_MAX_LENGTH, `E-mail deve ter no máximo ${EMAIL_MAX_LENGTH} caracteres`),
  );

/** `password` em claro validado antes do hash (RN-F1-04). Nunca é armazenada nem registrada. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, PASSWORD_LENGTH_MESSAGE)
  .max(PASSWORD_MAX_LENGTH, PASSWORD_LENGTH_MESSAGE)
  .regex(/[A-Za-z]/, 'Senha deve conter ao menos uma letra')
  .regex(/[0-9]/, 'Senha deve conter ao menos um número');

/** Corpo de `POST /auth/register`; campos desconhecidos (inclusive `role`) → VALIDATION_ERROR (RN-F1-05). */
export const registerSchema = z.strictObject(
  {
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
  },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type RegisterInput = z.infer<typeof registerSchema>;

/** Corpo de `POST /auth/login`: `identifier` é o e-mail **ou** o username (RN-F1-06). */
export const loginSchema = z.strictObject(
  {
    identifier: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(
        z
          .string()
          .min(1, 'Informe o e-mail ou nome de usuário')
          .max(EMAIL_MAX_LENGTH, 'E-mail ou nome de usuário muito longo'),
      ),
    password: z
      .string()
      .min(1, 'Informe a senha')
      .max(PASSWORD_MAX_LENGTH, 'Senha deve ter no máximo 128 caracteres'),
  },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Credenciais do administrador inicial (RN-F1-14). Usa o formato de username sem a lista
 * de reservados: o seed pode criar o `ADMIN` com nomes como `admin`.
 */
export const adminSeedSchema = z.strictObject({
  username: usernameFormatSchema,
  email: emailSchema,
  password: passwordSchema,
});

export type AdminSeedInput = z.infer<typeof adminSeedSchema>;

/** Dados públicos do usuário retornados por cadastro, login e refresh. */
export const authUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  email: z.string(),
  role: roleSchema,
});

export type AuthUser = z.infer<typeof authUserSchema>;

/** Resposta de `GET /auth/me`. */
export const meResponseSchema = authUserSchema.extend({ status: userStatusSchema });

export type MeResponse = z.infer<typeof meResponseSchema>;

/** Resposta de cadastro, login e refresh: access token no corpo, refresh apenas no cookie. */
export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: authUserSchema,
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

export const AUTH_ROUTES = {
  register: '/auth/register',
  login: '/auth/login',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  me: '/auth/me',
} as const;

export const REFRESH_COOKIE_NAME = 'refresh_token';
export const REFRESH_COOKIE_PATH = `${API_PREFIX}/auth`;
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Limite de tentativas de login: 5 falhas em 15 min por (identifier + IP) — RN-F1-08. */
export const LOGIN_RATE_LIMIT = { maxFailures: 5, windowSeconds: 15 * 60 } as const;

/** Mensagem genérica de credenciais inválidas (não revela se o usuário existe) — RN-F1-06. */
export const INVALID_CREDENTIALS_MESSAGE = 'E-mail/usuário ou senha inválidos.';
