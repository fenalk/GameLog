import {
  formatGameLogDateOrNull,
  formatPlaytime,
  gameLogStatusLabel,
  type GameLogEntry,
  type GameLogStatus,
} from '@gamelog/shared';
import { Link } from 'react-router';

import { GameCover } from '@/components/game-card';
import { gamePagePath } from '@/lib/catalog';

/** Selo do status do registro, com o rótulo pt-BR (seção 1 da SPEC F8). */
export function GameLogStatusBadge({ status }: { status: GameLogStatus }) {
  return (
    <span
      data-testid="diario-status"
      className="rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    >
      {gameLogStatusLabel(status)}
    </span>
  );
}

/** Plataforma, datas e tempo jogado exibidos no cartão e na listagem (seção 4). */
export function GameLogDetails({ entry }: { entry: GameLogEntry }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Plataforma</dt>
      <dd data-testid="diario-plataforma">{entry.platform?.name ?? 'não informada'}</dd>

      <dt className="text-muted-foreground">Início</dt>
      <dd data-testid="diario-inicio">{formatGameLogDateOrNull(entry.startedAt)}</dd>

      <dt className="text-muted-foreground">Conclusão</dt>
      <dd data-testid="diario-fim">{formatGameLogDateOrNull(entry.finishedAt)}</dd>

      <dt className="text-muted-foreground">Tempo jogado</dt>
      <dd data-testid="diario-tempo">
        {entry.playtimeMinutes === null ? 'não informado' : formatPlaytime(entry.playtimeMinutes)}
      </dd>
    </dl>
  );
}

/** Item da listagem do diário (aba Diário do perfil): capa, título, status e detalhes. */
export function DiaryItem({
  entry,
  isOwner,
  onEdit,
  onRemove,
}: {
  entry: GameLogEntry;
  isOwner: boolean;
  onEdit: (entry: GameLogEntry) => void;
  onRemove: (entry: GameLogEntry) => void;
}) {
  return (
    <li
      data-testid="diario-item"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-start"
    >
      <Link
        to={gamePagePath(entry.game.slug)}
        className="w-20 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label={entry.game.title}
      >
        <GameCover title={entry.game.title} coverUrl={entry.game.coverUrl} />
      </Link>

      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={gamePagePath(entry.game.slug)}
            data-testid="diario-titulo"
            className="font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {entry.game.title}
          </Link>
          <GameLogStatusBadge status={entry.status} />
        </div>

        <GameLogDetails entry={entry} />
      </div>

      {isOwner ? (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            data-testid="diario-editar"
            onClick={() => onEdit(entry)}
            className="rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Editar
          </button>
          <button
            type="button"
            data-testid="diario-remover"
            onClick={() => onRemove(entry)}
            className="rounded-md border px-3 py-1.5 text-sm text-destructive transition-colors outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Remover
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** Esqueletos exibidos enquanto o diário carrega (seção 4 da SPEC F8). */
export function DiarySkeletons({ count = 3 }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          data-testid="diario-esqueleto"
          className="flex animate-pulse gap-4 rounded-xl border bg-card p-4"
        >
          <span className="h-28 w-20 shrink-0 rounded-lg bg-muted" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-4 w-1/2 rounded bg-muted" />
            <span className="h-3 w-1/3 rounded bg-muted" />
            <span className="h-3 w-2/3 rounded bg-muted" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Estado vazio do diário (CA-F8-20). */
export function DiaryEmpty({ isOwner }: { isOwner: boolean }) {
  return (
    <div
      data-testid="diario-vazio"
      className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center"
    >
      <p className="font-medium">Este jogador ainda não registrou jogos</p>
      {isOwner ? (
        <p className="text-sm text-muted-foreground">
          Adicione um jogo ao diário pela página do{' '}
          <Link to="/jogos" className="underline underline-offset-4 hover:text-foreground">
            catálogo
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

/** Estado de erro do diário, com "Tentar novamente" (CA-F8-20). */
export function DiaryError({
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
      data-testid="diario-erro"
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
