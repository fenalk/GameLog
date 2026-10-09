import {
  LIST_DESCRIPTION_MAX,
  LIST_TITLE_MAX,
  LIST_VISIBILITIES,
  listInputSchema,
  listUpdateSchema,
  listVisibilityLabel,
  type ListVisibility,
} from '@gamelog/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { ZodError } from 'zod';

import { CatalogError } from '@/components/catalog-feedback';
import { FormField } from '@/components/form-field';
import { FormSelect } from '@/components/form-select';
import { FormTextArea } from '@/components/form-textarea';
import { NotFound } from '@/components/not-found';
import { ApiError } from '@/lib/api';
import { useDocumentTitle } from '@/lib/document-title';
import {
  fieldErrorsFromDetails,
  fieldErrorsFromZod,
  focusFirstField,
  formMessageFor,
} from '@/lib/forms';
import { createMyList, fetchListDetail, listPagePath, updateMyList } from '@/lib/lists';

/**
 * Editor de lista (`/listas/nova` e `/listas/:id/editar`, seção 4 da SPEC F11): formulário
 * com título, descrição e visibilidade, validação no cliente com os schemas compartilhados
 * e erros por campo vindos da API.
 */
export function ListaEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = Boolean(id);

  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null);
  const [visibilityDraft, setVisibilityDraft] = useState<ListVisibility | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const listQuery = useQuery({
    queryKey: ['lists', 'detail', id, {}],
    queryFn: () => fetchListDetail(id ?? ''),
    enabled: isEditing,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });

  const existing = listQuery.data ?? null;

  const title = titleDraft ?? existing?.title ?? '';
  const description = descriptionDraft ?? existing?.description ?? '';
  const visibility = visibilityDraft ?? existing?.visibility ?? 'PUBLIC';

  useDocumentTitle(isEditing ? 'Editar lista · GameLog' : 'Nova lista · GameLog');

  if (isEditing && listQuery.isError) {
    if (listQuery.error instanceof ApiError && listQuery.error.status === 404) {
      return <NotFound message="Lista não encontrada" />;
    }

    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <CatalogError
          message={formMessageFor(listQuery.error)}
          onRetry={() => void listQuery.refetch()}
          retrying={listQuery.isFetching}
        />
      </main>
    );
  }

  if (isEditing && listQuery.isPending) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <p className="text-muted-foreground">Carregando lista…</p>
      </main>
    );
  }

  function handleSaved(saved: { id: string }) {
    void queryClient.invalidateQueries({ queryKey: ['lists'] });
    navigate(listPagePath(saved.id));
  }

  function handleRequestError(error: unknown) {
    if (error instanceof ApiError) {
      setErrors(fieldErrorsFromDetails(error.details));
    }

    setActionError(formMessageFor(error));
  }

  function showFieldErrors(issues: ZodError) {
    const fieldErrors = fieldErrorsFromZod(issues);
    setErrors(fieldErrors);
    focusFirstField(fieldErrors);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setActionError(null);

    const payload = {
      title,
      description: description.trim().length > 0 ? description : null,
      visibility,
    };

    if (isEditing && id) {
      const parsed = listUpdateSchema.safeParse(payload);

      if (!parsed.success) {
        showFieldErrors(parsed.error);
        return;
      }

      setErrors({});
      setSubmitting(true);
      updateMyList(id, parsed.data)
        .then(handleSaved)
        .catch(handleRequestError)
        .finally(() => setSubmitting(false));
      return;
    }

    const parsed = listInputSchema.safeParse(payload);

    if (!parsed.success) {
      showFieldErrors(parsed.error);
      return;
    }

    setErrors({});
    setSubmitting(true);
    createMyList(parsed.data)
      .then(handleSaved)
      .catch(handleRequestError)
      .finally(() => setSubmitting(false));
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        {isEditing ? 'Editar lista' : 'Nova lista'}
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border bg-card p-6">
        <FormField
          label="Título"
          name="title"
          maxLength={LIST_TITLE_MAX}
          value={title}
          error={errors.title}
          onChange={(event) => setTitleDraft(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {title.length}/{LIST_TITLE_MAX} caracteres
        </p>

        <FormTextArea
          label="Descrição"
          name="description"
          maxLength={LIST_DESCRIPTION_MAX}
          value={description}
          error={errors.description}
          placeholder="Descreva o critério desta lista (opcional)"
          onChange={(event) => setDescriptionDraft(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {description.length}/{LIST_DESCRIPTION_MAX} caracteres
        </p>

        <FormSelect
          label="Visibilidade"
          name="visibility"
          value={visibility}
          error={errors.visibility}
          onChange={(event) => setVisibilityDraft(event.target.value as ListVisibility)}
        >
          {LIST_VISIBILITIES.map((option) => (
            <option key={option} value={option}>
              {listVisibilityLabel(option)}
            </option>
          ))}
        </FormSelect>

        {actionError ? (
          <p role="alert" data-testid="erro-lista-form" className="text-sm text-destructive">
            {actionError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={submitting}
            className="rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            data-testid="salvar-lista"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
          >
            {submitting ? 'Salvando…' : isEditing ? 'Salvar' : 'Criar lista'}
          </button>
        </div>
      </form>
    </main>
  );
}
