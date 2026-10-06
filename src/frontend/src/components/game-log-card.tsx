import type { GameLogEntry } from '@gamelog/shared';

import { GameLogDetails, GameLogStatusBadge } from '@/components/game-log-list';

const OUTLINE_BUTTON_CLASS =
  'rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40';

/**
 * Cartão "No seu diário" da página do jogo (seção 4 da SPEC F8): mostra o registro atual
 * com as ações de editar e remover (a remoção pede confirmação na página).
 */
export function GameLogCard({
  entry,
  onEdit,
  onRemove,
}: {
  entry: GameLogEntry;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div data-testid="cartao-diario" className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-medium">No seu diário</h2>
        <GameLogStatusBadge status={entry.status} />
      </div>

      <GameLogDetails entry={entry} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="cartao-editar"
          onClick={onEdit}
          className={OUTLINE_BUTTON_CLASS}
        >
          Editar
        </button>
        <button
          type="button"
          data-testid="cartao-remover"
          onClick={onRemove}
          className="rounded-md border px-3 py-1.5 text-sm text-destructive transition-colors outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          Remover
        </button>
      </div>
    </div>
  );
}
