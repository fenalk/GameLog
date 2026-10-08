import type { ListItem } from '@gamelog/shared';
import { Link } from 'react-router';

import { GameCover } from '@/components/game-card';
import { gamePagePath } from '@/lib/catalog';
import { formatListDate } from '@/lib/lists';

/**
 * Item da página da lista (seção 4 da SPEC F11): capa, título do jogo (link), nota curta e
 * data de adição. O dono vê as ações de reordenar, editar a nota e remover.
 */
export function ListItemRow({
  item,
  isOwner = false,
  canMoveUp = false,
  canMoveDown = false,
  busy = false,
  onMoveUp,
  onMoveDown,
  onEditNote,
  onRemove,
}: {
  item: ListItem;
  isOwner?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  busy?: boolean;
  onMoveUp?: (item: ListItem) => void;
  onMoveDown?: (item: ListItem) => void;
  onEditNote?: (item: ListItem) => void;
  onRemove?: (item: ListItem) => void;
}) {
  return (
    <li
      data-testid="lista-item"
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-start"
    >
      <Link
        to={gamePagePath(item.game.slug)}
        className="w-16 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label={item.game.title}
      >
        <GameCover title={item.game.title} coverUrl={item.game.coverUrl} />
      </Link>

      <div className="flex flex-1 flex-col gap-2">
        <Link
          to={gamePagePath(item.game.slug)}
          data-testid="lista-item-jogo"
          className="font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {item.game.title}
        </Link>

        {item.note ? (
          <p
            data-testid="lista-item-nota"
            className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground"
          >
            {item.note}
          </p>
        ) : null}

        <span data-testid="lista-item-data" className="text-sm text-muted-foreground">
          Adicionado em {formatListDate(item.addedAt)}
        </span>
      </div>

      {isOwner && onMoveUp && onMoveDown && onEditNote && onRemove ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            data-testid="lista-item-subir"
            onClick={() => onMoveUp(item)}
            disabled={!canMoveUp || busy}
            aria-label={`Mover ${item.game.title} para cima`}
            className="rounded-md border px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40"
          >
            ↑
          </button>
          <button
            type="button"
            data-testid="lista-item-descer"
            onClick={() => onMoveDown(item)}
            disabled={!canMoveDown || busy}
            aria-label={`Mover ${item.game.title} para baixo`}
            className="rounded-md border px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40"
          >
            ↓
          </button>
          <button
            type="button"
            data-testid="lista-item-editar-nota"
            onClick={() => onEditNote(item)}
            className="rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Nota
          </button>
          <button
            type="button"
            data-testid="lista-item-remover"
            onClick={() => onRemove(item)}
            className="rounded-md border px-3 py-1.5 text-sm text-destructive transition-colors outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Remover
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** Esqueletos exibidos enquanto os itens de uma lista carregam. */
export function ListItemSkeletons({ count = 3 }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          data-testid="lista-item-esqueleto"
          className="flex animate-pulse gap-3 rounded-xl border bg-card p-4"
        >
          <span className="h-24 w-16 shrink-0 rounded-lg bg-muted" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-4 w-1/3 rounded bg-muted" />
            <span className="h-3 w-2/3 rounded bg-muted" />
          </span>
        </li>
      ))}
    </ul>
  );
}
