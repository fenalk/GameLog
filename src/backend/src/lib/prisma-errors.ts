type UniqueViolationMeta = {
  target?: unknown;
  driverAdapterError?: { cause?: { constraint?: { index?: unknown } } };
};

/**
 * Erro de unicidade do Prisma (P2002) sobre um campo específico.
 *
 * No Prisma 7 com driver adapter o índice violado chega em
 * `meta.driverAdapterError.cause.constraint.index` (ex.: `users_email_key`); o formato
 * antigo (`meta.target` com os nomes dos campos) continua aceito por compatibilidade.
 */
export function isUniqueViolation(error: unknown, field: string): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const { code, meta } = error as { code?: unknown; meta?: UniqueViolationMeta };

  if (code !== 'P2002') {
    return false;
  }

  if (Array.isArray(meta?.target) && meta.target.includes(field)) {
    return true;
  }

  const index = meta?.driverAdapterError?.cause?.constraint?.index;

  return typeof index === 'string' && index.endsWith(`_${field}_key`);
}
