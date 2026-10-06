import {
  publicProfilePath,
  reviewPath,
  reviewStatusLabel,
  type ReviewStatus,
  type ReviewSummary,
} from '@gamelog/shared';
import { Link } from 'react-router';

import { GameCover } from '@/components/game-card';
import { ProfileAvatar } from '@/components/profile-avatar';
import { gamePagePath } from '@/lib/catalog';
import { formatReviewDate } from '@/lib/reviews';

/** Selo do status da resenha; resenhas publicadas não exibem selo (RN-F10-07). */
export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  if (status === 'PUBLISHED') {
    return null;
  }

  return (
    <span
      data-testid="resenha-status"
      className="rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-700 dark:text-amber-400"
    >
      {reviewStatusLabel(status)}
    </span>
  );
}

/** Autor da resenha com link para o perfil público (RN-F10-10). */
export function ReviewAuthorLink({ author }: { author: ReviewSummary['author'] }) {
  return (
    <Link
      to={publicProfilePath(author.username)}
      data-testid="resenha-autor"
      className="inline-flex items-center gap-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <ProfileAvatar
        displayName={author.displayName}
        avatarUrl={author.avatarUrl}
        className="size-8 text-xs"
      />
      <span>{author.displayName}</span>
    </Link>
  );
}

/**
 * Item das listagens de resenhas (seção 4 da SPEC F10): título (permalink), autor, data,
 * trecho e, quando é o caso, o jogo vinculado e as ações do dono.
 */
export function ReviewItem({
  review,
  showGame = false,
  isOwner = false,
  onEdit,
  onRemove,
}: {
  review: ReviewSummary;
  showGame?: boolean;
  isOwner?: boolean;
  onEdit?: (review: ReviewSummary) => void;
  onRemove?: (review: ReviewSummary) => void;
}) {
  return (
    <li
      data-testid="resenha-item"
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-start"
    >
      {showGame ? (
        <Link
          to={gamePagePath(review.game.slug)}
          className="w-16 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label={review.game.title}
        >
          <GameCover title={review.game.title} coverUrl={review.game.coverUrl} />
        </Link>
      ) : null}

      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={reviewPath(review.id)}
            data-testid="resenha-titulo"
            className="font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {review.title}
          </Link>
          <ReviewStatusBadge status={review.status} />
          {showGame ? (
            <span className="text-sm text-muted-foreground">
              sobre{' '}
              <Link
                to={gamePagePath(review.game.slug)}
                className="underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {review.game.title}
              </Link>
            </span>
          ) : null}
        </div>

        <p
          data-testid="resenha-trecho"
          className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground"
        >
          {review.excerpt}
        </p>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <ReviewAuthorLink author={review.author} />
          <span data-testid="resenha-data">{formatReviewDate(review.createdAt)}</span>
        </div>
      </div>

      {isOwner && onEdit && onRemove ? (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            data-testid="resenha-editar"
            onClick={() => onEdit(review)}
            className="rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Editar
          </button>
          <button
            type="button"
            data-testid="resenha-remover"
            onClick={() => onRemove(review)}
            className="rounded-md border px-3 py-1.5 text-sm text-destructive transition-colors outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Remover
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** Esqueletos exibidos enquanto a listagem de resenhas carrega (seção 4 da SPEC F10). */
export function ReviewSkeletons({ count = 3 }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          data-testid="resenha-esqueleto"
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

/** Estado vazio das resenhas (CA-F10-23 / CA-F10-21). */
export function ReviewEmpty({ message, hint }: { message: string; hint?: string }) {
  return (
    <div
      data-testid="resenhas-vazio"
      className="flex flex-col items-center gap-1 rounded-xl border border-dashed px-6 py-12 text-center"
    >
      <p className="font-medium">{message}</p>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Estado de erro das resenhas, com "Tentar novamente". */
export function ReviewError({
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
      data-testid="resenhas-erro"
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
