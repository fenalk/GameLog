import type { ApiErrorDetail } from '@gamelog/shared';
import type { ZodError } from 'zod';

import { ApiError } from '@/lib/api';

/** Converte as issues do Zod em erros por campo (primeira mensagem de cada campo). */
export function fieldErrorsFromZod(error: ZodError): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'body');
    errors[field] ??= issue.message;
  }

  return errors;
}

/** Converte `details` da API em erros por campo. */
export function fieldErrorsFromDetails(details: ApiErrorDetail[]): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const detail of details) {
    errors[detail.field] ??= detail.message;
  }

  return errors;
}

export function focusFirstField(errors: Record<string, string>): void {
  const [firstField] = Object.keys(errors);

  if (!firstField) {
    return;
  }

  document.querySelector<HTMLInputElement>(`[name="${firstField}"]`)?.focus();
}

/** Mensagem exibida quando o erro não é específico de um campo. */
export function formMessageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'RATE_LIMITED') {
      return 'Muitas tentativas. Aguarde alguns instantes e tente novamente.';
    }

    return error.message;
  }

  return 'Não foi possível falar com a API. Verifique sua conexão e tente novamente.';
}
