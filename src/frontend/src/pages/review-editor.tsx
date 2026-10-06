import {
  REVIEW_BODY_MAX,
  REVIEW_TITLE_MAX,
  reviewInputSchema,
  type ReviewDetail,
} from '@gamelog/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { CatalogError } from '@/components/catalog-feedback';
import { FormField } from '@/components/form-field';
import { FormTextArea } from '@/components/form-textarea';
import { NotFound } from '@/components/not-found';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { fetchGameDetail, gamePagePath } from '@/lib/catalog';
import { useDocumentTitle } from '@/lib/document-title';
import {
  fieldErrorsFromDetails,
  fieldErrorsFromZod,
  focusFirstField,
  formMessageFor,
} from '@/lib/forms';
import { fetchMyReview, saveMyReview, updateMyReview } from '@/lib/reviews';

const OUTLINE_BUTTON_CLASS =
  'rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Editor da resenha do jogador (`/jogos/:slug/resenha`, seção 4 da SPEC F10): cria ou
 * edita a própria resenha do jogo, com contadores, pré-visualização em texto puro e
 * validação pelos schemas compartilhados. O conteúdo nunca é renderizado como HTML.
 */
export function ReviewEditorPage() {
  const { slug } = useParams();
  const { status: authStatus } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [bodyDraft, setBodyDraft] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const gameQuery = useQuery({
    queryKey: ['catalog', 'game', slug],
    queryFn: () => fetchGameDetail(slug ?? ''),
    enabled: Boolean(slug),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });

  const reviewKey = ['reviews', 'mine', slug];

  const reviewQuery = useQuery({
    queryKey: reviewKey,
    queryFn: () => fetchMyReview(slug ?? ''),
    enabled: authStatus === 'authenticated' && Boolean(slug),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });

  const existing: ReviewDetail | null = reviewQuery.data ?? null;
  const reviewFailed =
    reviewQuery.isError &&
    !(reviewQuery.error instanceof ApiError && reviewQuery.error.status === 404);

  // O rascunho começa nulo e deriva da resenha carregada; a partir da primeira digitação o
  // campo passa a ser controlado pelo rascunho (sem `setState` dentro de efeito).
  const title = titleDraft ?? existing?.title ?? '';
  const body = bodyDraft ?? existing?.body ?? '';

  useDocumentTitle(
    existing ? `${existing.title} · Editar resenha · GameLog` : 'Escrever resenha · GameLog',
  );

  if (!slug) {
    return <NotFound message="Jogo não encontrado" />;
  }

  if (gameQuery.isError) {
    if (gameQuery.error instanceof ApiError && gameQuery.error.status === 404) {
      return <NotFound message="Jogo não encontrado" />;
    }

    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <CatalogError
          message={formMessageFor(gameQuery.error)}
          onRetry={() => void gameQuery.refetch()}
          retrying={gameQuery.isFetching}
        />
      </main>
    );
  }

  if (gameQuery.isPending || (reviewQuery.isPending && !reviewFailed)) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <p className="text-muted-foreground">Carregando…</p>
      </main>
    );
  }

  // A partir daqui o jogo existe: o slug é fixado em uma constante para ficar disponível
  // (e tipado como `string`) dentro do handler de envio.
  const gameSlug = slug;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setActionError(null);

    const parsed = reviewInputSchema.safeParse({ title, body });

    if (!parsed.success) {
      const fieldErrors = fieldErrorsFromZod(parsed.error);
      setErrors(fieldErrors);
      focusFirstField(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    const request = existing
      ? updateMyReview(gameSlug, { title: parsed.data.title, body: parsed.data.body })
      : saveMyReview(gameSlug, parsed.data);

    request
      .then((saved) => {
        queryClient.setQueryData(reviewKey, saved);
        void queryClient.invalidateQueries({ queryKey: ['reviews'] });
        void queryClient.invalidateQueries({ queryKey: ['catalog', 'game', slug] });
        navigate(gamePagePath(saved.game.slug));
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError) {
          setErrors(fieldErrorsFromDetails(error.details));
        }

        setActionError(formMessageFor(error));
      })
      .finally(() => setSubmitting(false));
  }

  if (gameQuery.isPending || (reviewQuery.isPending && !reviewFailed)) {
    // Se a própria resenha falhou por outro motivo (não 404), o formulário ainda serve
    // para escrever; o aviso aparece junto do campo de envio.
    if (gameQuery.isPending) {
      return (
        <main className="mx-auto w-full max-w-3xl px-6 py-10">
          <p className="text-muted-foreground">Carregando jogo…</p>
        </main>
      );
    }
  }

  const game = gameQuery.data;
  const heading = existing ? 'Editar resenha' : 'Escrever resenha';

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <nav aria-label="Voltar" className="text-sm">
        {game ? (
          <Link
            to={gamePagePath(game.slug)}
            className="text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            ← {game.title}
          </Link>
        ) : null}
      </nav>

      <header className="flex flex-col gap-1">
        <h1 data-testid="editor-titulo" className="text-2xl font-semibold tracking-tight">
          {heading}
        </h1>
        <p className="text-sm text-muted-foreground">
          A resenha é pública e independente da nota: é o seu texto sobre o jogo.
        </p>
      </header>

      {reviewFailed ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar a sua resenha atual. Você pode escrever mesmo assim.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          label="Título"
          name="title"
          value={title}
          onChange={(event) => setTitleDraft(event.target.value)}
          maxLength={REVIEW_TITLE_MAX}
          error={errors.title}
          data-testid="resenha-titulo-input"
        />
        <p className="text-xs text-muted-foreground">
          {title.length}/{REVIEW_TITLE_MAX} caracteres
        </p>

        <FormTextArea
          label="Corpo"
          name="body"
          value={body}
          onChange={(event) => setBodyDraft(event.target.value)}
          maxLength={REVIEW_BODY_MAX}
          rows={12}
          error={errors.body}
          data-testid="resenha-corpo-input"
        />
        <p className="text-xs text-muted-foreground">
          {body.length}/{REVIEW_BODY_MAX} caracteres
        </p>

        <section
          data-testid="resenha-preview"
          className="flex flex-col gap-2 rounded-xl border border-dashed p-4"
        >
          <h2 className="text-sm font-medium text-muted-foreground">Pré-visualização</h2>
          <p data-testid="resenha-preview-titulo" className="font-medium">
            {title.trim() || 'Sem título'}
          </p>
          <p
            data-testid="resenha-preview-corpo"
            className="text-sm leading-relaxed whitespace-pre-line"
          >
            {body.trim() || 'O corpo da resenha aparece aqui.'}
          </p>
        </section>

        {actionError ? (
          <p role="alert" data-testid="resenha-erro-envio" className="text-sm text-destructive">
            {actionError}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            data-testid="resenha-salvar"
            disabled={submitting}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Salvando…' : 'Salvar resenha'}
          </button>
          <button
            type="button"
            data-testid="resenha-cancelar"
            onClick={() => navigate(game ? gamePagePath(game.slug) : '/jogos')}
            disabled={submitting}
            className={OUTLINE_BUTTON_CLASS}
          >
            Cancelar
          </button>
        </div>
      </form>
    </main>
  );
}
