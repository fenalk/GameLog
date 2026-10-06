import { GameCardSkeleton, GameCardGrid } from '@/components/game-card';

/** Esqueletos da grade de jogos enquanto a página carrega. */
export function GameCardSkeletons({ count = 4 }: { count?: number }) {
  return (
    <GameCardGrid>
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          <GameCardSkeleton />
        </li>
      ))}
    </GameCardGrid>
  );
}

/** Estado vazio da busca/listagem (CA-F3-20). */
export function CatalogEmpty({
  message = 'Nenhum jogo encontrado',
  hint,
}: {
  message?: string;
  hint?: string;
}) {
  return (
    <div
      data-testid="catalogo-vazio"
      className="flex flex-col items-center gap-1 rounded-xl border border-dashed px-6 py-12 text-center"
    >
      <p className="font-medium">{message}</p>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Estado de erro com "Tentar novamente" (CA-F3-20). */
export function CatalogError({
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
      data-testid="catalogo-erro"
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
