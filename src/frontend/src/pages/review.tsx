import { reviewStatusLabel } from '@gamelog/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';

import { CatalogError } from '@/components/catalog-feedback';
import { ProfileAvatar } from '@/components/profile-avatar';
import { NotFound } from '@/components/not-found';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { gamePagePath } from '@/lib/catalog';
import { useDocumentTitle } from '@/lib/document-title';
import { formMessageFor } from '@/lib/forms';
import { fetchReview, formatReviewDate } from '@/lib/reviews';

/**
 * Permalink da resenha (`/resenhas/:id`, seção 4 da SPEC F10): página pública com o corpo
 * completo, autoria, jogo e data. Resenha inexistente (ou não publicada de terceiros)
 * exibe a página 404. O corpo é texto puro, preservado e escapado pelo React.
 */
export function ReviewPage() {
  const { id } = useParams();
  const { status: authStatus } = useAuth();

  const query = useQuery({
    queryKey: ['reviews', 'detail', id, authStatus],
    queryFn: () => fetchReview(id ?? ''),
    enabled: Boolean(id) && authStatus !== 'loading',
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });

  useDocumentTitle(query.data ? `${query.data.title} · GameLog` : 'Resenha · GameLog');

  if (!id) {
    return <NotFound message="Resenha não encontrada" />;
  }

  if (query.isPending) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <p className="text-muted-foreground">Carregando resenha…</p>
      </main>
    );
  }

  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <NotFound message="Resenha não encontrada" />;
    }

    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <CatalogError
          message={formMessageFor(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </main>
    );
  }

  const review = query.data;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <article className="flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              data-testid="resenha-permalink-titulo"
              className="text-2xl font-semibold tracking-tight"
            >
              {review.title}
            </h1>
            {review.status !== 'PUBLISHED' ? (
              <span
                data-testid="resenha-permalink-status"
                className="rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
              >
                {reviewStatusLabel(review.status)}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Link
              to={`/jogadores/${encodeURIComponent(review.author.username)}`}
              data-testid="resenha-permalink-autor"
              className="inline-flex items-center gap-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <ProfileAvatar
                displayName={review.author.displayName}
                avatarUrl={review.author.avatarUrl}
                className="size-8 text-xs"
              />
              <span>{review.author.displayName}</span>
            </Link>
            <span>·</span>
            <span>
              sobre{' '}
              <Link
                to={gamePagePath(review.game.slug)}
                data-testid="resenha-permalink-jogo"
                className="underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {review.game.title}
              </Link>
            </span>
            <span>·</span>
            <span data-testid="resenha-permalink-data">{formatReviewDate(review.createdAt)}</span>
          </div>
        </header>

        <p
          data-testid="resenha-permalink-corpo"
          className="text-sm leading-relaxed whitespace-pre-line"
        >
          {review.body}
        </p>
      </article>
    </main>
  );
}
