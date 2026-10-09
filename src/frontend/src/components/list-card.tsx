import { listVisibilityLabel, type ListSummary } from '@gamelog/shared';
import { Link } from 'react-router';

import { formatItemsCount, formatListDate, listPagePath } from '@/lib/lists';

/** Selo da visibilidade; listas públicas (padrão) não exibem selo (seção 4 da SPEC F11). */
export function ListVisibilityBadge({ visibility }: { visibility: ListSummary['visibility'] }) {
  if (visibility === 'PUBLIC') {
    return null;
  }

  return (
    <span
      data-testid="lista-visibilidade"
      className="rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-700 dark:text-amber-400"
    >
      {listVisibilityLabel(visibility)}
    </span>
  );
}

/**
 * Cartão de uma lista na aba Listas do perfil (seção 4 da SPEC F11): título (permalink),
 * descrição, contagem de jogos, data e as ações do dono.
 */
export function ListCard({
  list,
  isOwner = false,
  onEdit,
  onRemove,
}: {
  list: ListSummary;
  isOwner?: boolean;
  onEdit?: (list: ListSummary) => void;
  onRemove?: (list: ListSummary) => void;
}) {
  return (
    <li data-testid="lista-cartao" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={listPagePath(list.id)}
          data-testid="lista-titulo"
          className="font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {list.title}
        </Link>
        <ListVisibilityBadge visibility={list.visibility} />
      </div>

      {list.description ? (
        <p
          data-testid="lista-descricao"
          className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground"
        >
          {list.description}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span data-testid="lista-total">{formatItemsCount(list.itemsCount)}</span>
        <span data-testid="lista-data">{formatListDate(list.updatedAt)}</span>
      </div>

      {isOwner && onEdit && onRemove ? (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            data-testid="lista-editar"
            onClick={() => onEdit(list)}
            className="rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Editar
          </button>
          <button
            type="button"
            data-testid="lista-remover"
            onClick={() => onRemove(list)}
            className="rounded-md border px-3 py-1.5 text-sm text-destructive transition-colors outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Excluir
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** Esqueletos exibidos enquanto a listagem de listas carrega (seção 4 da SPEC F11). */
export function ListSkeletons({ count = 3 }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          data-testid="lista-esqueleto"
          className="flex animate-pulse flex-col gap-2 rounded-xl border bg-card p-4"
        >
          <span className="h-4 w-1/3 rounded bg-muted" />
          <span className="h-3 w-2/3 rounded bg-muted" />
          <span className="h-3 w-1/4 rounded bg-muted" />
        </li>
      ))}
    </ul>
  );
}

/** Estado vazio das listas (CA-F11-29/CA-F11-32). */
export function ListEmpty({ message, hint }: { message: string; hint?: string }) {
  return (
    <div
      data-testid="listas-vazio"
      className="flex flex-col items-center gap-1 rounded-xl border border-dashed px-6 py-12 text-center"
    >
      <p className="font-medium">{message}</p>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Estado de erro das listas, com "Tentar novamente". */
export function ListError({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      data-testid="listas-erro"
      className="flex flex-col items-center gap-3 rounded-xl border border-destructive/40 px-6 py-12 text-center"
    >
      <p className="text-sm text-destructive">{message}</p>
      <button
        type="button"
        data-testid="tentar-novamente"
        onClick={onRetry}
        disabled={retrying}
        className="rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
      >
        Tentar novamente
      </button>
    </div>
  );
}
