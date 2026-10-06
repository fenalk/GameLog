import { Gamepad2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import type { GameListItem } from '@gamelog/shared';

import { formatRating, gamePagePath, releaseYear } from '@/lib/catalog';
import { cn } from '@/lib/utils';

/** Capa do jogo com placeholder quando a URL é nula ou a imagem falha (seção 5 da SPEC F3). */
export function GameCover({
  title,
  coverUrl,
  className,
}: {
  title: string;
  coverUrl: string | null;
  className?: string;
}) {
  // Guarda a URL que falhou para tentar de novo quando ela muda.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageUrl = coverUrl && coverUrl !== failedUrl ? coverUrl : null;

  return (
    <span
      className={cn(
        'relative flex aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-lg border bg-muted',
        className,
      )}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(imageUrl)}
          data-testid="jogo-capa"
          className="size-full object-cover"
        />
      ) : (
        <span data-testid="jogo-capa-placeholder" className="text-muted-foreground">
          <Gamepad2 aria-hidden className="size-10" />
          <span className="sr-only">{`Sem capa para ${title}`}</span>
        </span>
      )}
    </span>
  );
}

/** Cartão do catálogo: capa, título, ano e nota (seção 5 da SPEC F3). */
export function GameCard({ game }: { game: GameListItem }) {
  const year = releaseYear(game.releaseDate);

  return (
    <Link
      to={gamePagePath(game.slug)}
      data-testid="jogo-cartao"
      className="group flex flex-col gap-2 rounded-xl border bg-card p-3 text-card-foreground transition-colors outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <GameCover title={game.title} coverUrl={game.coverUrl} />

      <span className="flex flex-1 flex-col justify-between gap-1">
        <span className="text-sm leading-tight font-medium group-hover:underline">
          {game.title}
        </span>
        <span className="flex items-center justify-between text-xs text-muted-foreground">
          <span data-testid="jogo-cartao-ano">{year ?? 'Sem data'}</span>
          <span data-testid="jogo-cartao-nota">
            {game.ratingAverage === null
              ? 'Sem nota'
              : `★ ${formatRating(game.ratingAverage)} (${game.ratingCount})`}
          </span>
        </span>
      </span>
    </Link>
  );
}

/** Esqueleto exibido enquanto uma lista de cartões carrega. */
export function GameCardSkeleton() {
  return (
    <div
      aria-hidden
      data-testid="jogo-cartao-esqueleto"
      className="flex animate-pulse flex-col gap-2 rounded-xl border bg-card p-3"
    >
      <span className="aspect-[2/3] w-full rounded-lg bg-muted" />
      <span className="h-4 w-3/4 rounded bg-muted" />
      <span className="h-3 w-1/2 rounded bg-muted" />
    </div>
  );
}

export function GameCardGrid({ children }: { children: React.ReactNode }) {
  return <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</ul>;
}
