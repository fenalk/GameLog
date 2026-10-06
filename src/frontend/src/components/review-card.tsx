import type { ReviewDetail } from '@gamelog/shared';

import { ReviewStatusBadge } from '@/components/review-list';

const OUTLINE_BUTTON_CLASS =
  'rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40';

/**
 * Cartão "Sua resenha" da página do jogo (seção 4 da SPEC F10): mostra a resenha atual do
 * jogador com as ações de editar e remover (a remoção pede confirmação na página).
 */
export function MyReviewCard({
  review,
  onEdit,
  onRemove,
}: {
  review: ReviewDetail;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div data-testid="cartao-resenha" className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-medium">Sua resenha</h2>
        <ReviewStatusBadge status={review.status} />
      </div>

      <div className="flex flex-col gap-2">
        <p data-testid="cartao-resenha-titulo" className="font-medium">
          {review.title}
        </p>
        <p
          data-testid="cartao-resenha-corpo"
          className="text-sm leading-relaxed whitespace-pre-line"
        >
          {review.body}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="cartao-resenha-editar"
          onClick={onEdit}
          className={OUTLINE_BUTTON_CLASS}
        >
          Editar
        </button>
        <button
          type="button"
          data-testid="cartao-resenha-remover"
          onClick={onRemove}
          className="rounded-md border px-3 py-1.5 text-sm text-destructive transition-colors outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          Remover
        </button>
      </div>
    </div>
  );
}
