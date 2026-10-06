import { deriveSlug } from '@gamelog/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState, type FormEvent } from 'react';
import type { ZodError, ZodType } from 'zod';

import { FormField } from '@/components/form-field';
import { ApiError } from '@/lib/api';
import { useDocumentTitle } from '@/lib/document-title';
import {
  fieldErrorsFromDetails,
  fieldErrorsFromZod,
  focusFirstField,
  formMessageFor,
} from '@/lib/forms';

const SUBMIT_BUTTON_CLASS =
  'h-10 self-start rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60';

const OUTLINE_BUTTON_CLASS =
  'rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60';

const DANGER_BUTTON_CLASS =
  'rounded-md bg-destructive px-3 py-1.5 text-sm text-white transition-colors outline-none hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60';

const SUCCESS_CLASS =
  'rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground';

const ERROR_CLASS =
  'rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive';

/** Item de taxonomia exibido na administração (F5/F6/F7). */
export type TaxonomyRef = { id: string; name: string; slug: string; gameCount: number };

type CreateInput = { name: string; slug?: string };
type UpdateInput = { name: string };

type ParseResult<T> = { success: true; data: T } | { success: false; error: ZodError };

/**
 * Configuração de uma tela de administração de taxonomia (gêneros na F5, plataformas na
 * F6 e desenvolvedoras na F7). Reúne textos, esquemas compartilhados e as operações da
 * API, mantendo o comportamento e os `data-testid` por entidade.
 */
export type TaxonomyAdminConfig = {
  /** Prefixo dos `data-testid` das linhas ("genero", "plataforma"). */
  testIdPrefix: string;
  /** Prefixo dos `data-testid` dos estados da listagem ("generos", "plataformas"). */
  listTestIdPrefix: string;
  heading: string;
  description: string;
  createTitle: string;
  createButtonLabel: string;
  createSuccessMessage: string;
  renameSuccessMessage: string;
  emptyMessage: string;
  loadingMessage: string;
  nameMaxLength: number;
  slugMaxLength: number;
  /** Corpo de criação (`strict`): `{ name, slug? }`. */
  createSchema: ZodType;
  /** Corpo de renomeação (`strict`): `{ name }`. */
  updateSchema: ZodType;
  queryKey: readonly string[];
  fetchAll: () => Promise<TaxonomyRef[]>;
  create: (input: CreateInput) => Promise<TaxonomyRef>;
  rename: (identifier: string, input: UpdateInput) => Promise<TaxonomyRef>;
  remove: (identifier: string) => Promise<void>;
};

/** Formulário de criação: nome obrigatório e slug opcional, com prévia do slug derivado. */
function CreateForm({ config, onCreated }: { config: TaxonomyAdminConfig; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pré-visualização: valor informado normalizado ou o slug derivado do nome (RN-F5-03/RN-F6-03).
  const slugPreview =
    slug.trim().length > 0 ? slug.trim().toLowerCase() : deriveSlug(name, config.slugMaxLength);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    setSuccess(null);

    const parsed = config.createSchema.safeParse({
      name,
      ...(slug.trim().length > 0 ? { slug } : {}),
    }) as ParseResult<CreateInput>;

    if (!parsed.success) {
      const errors = fieldErrorsFromZod(parsed.error);

      setFieldErrors(errors);
      focusFirstField(errors);
      setSubmitting(false);
      return;
    }

    try {
      await config.create(parsed.data);
      setName('');
      setSlug('');
      setSuccess(config.createSuccessMessage);
      onCreated();
    } catch (error) {
      if (error instanceof ApiError) {
        const errors = fieldErrorsFromDetails(error.details);

        setFieldErrors(errors);
        setFormError(Object.keys(errors).length === 0 ? formMessageFor(error) : null);
      } else {
        setFormError(formMessageFor(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className="flex flex-col gap-4 rounded-xl border bg-card p-4"
    >
      <h2 className="text-lg font-medium">{config.createTitle}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Nome"
          name="name"
          value={name}
          maxLength={config.nameMaxLength}
          error={fieldErrors.name}
          onChange={(event) => setName(event.target.value)}
        />
        <FormField
          label="Slug (opcional)"
          name="slug"
          value={slug}
          maxLength={config.slugMaxLength}
          error={fieldErrors.slug}
          onChange={(event) => setSlug(event.target.value)}
        />
      </div>

      <p data-testid="slug-preview" className="text-sm text-muted-foreground">
        Prévia do slug: <code className="font-mono">{slugPreview || '—'}</code>
      </p>

      {formError ? (
        <p data-testid={`${config.testIdPrefix}-erro`} role="alert" className={ERROR_CLASS}>
          {formError}
        </p>
      ) : null}
      {success ? (
        <p data-testid={`${config.testIdPrefix}-sucesso`} className={SUCCESS_CLASS}>
          {success}
        </p>
      ) : null}

      <button
        type="submit"
        data-testid={`criar-${config.testIdPrefix}`}
        disabled={submitting}
        className={SUBMIT_BUTTON_CLASS}
      >
        {submitting ? 'Criando…' : config.createButtonLabel}
      </button>
    </form>
  );
}

/** Linha da tabela com as ações de renomear (somente o nome) e excluir (com confirmação). */
function TaxonomyRow({
  config,
  item,
  onChanged,
}: {
  config: TaxonomyAdminConfig;
  item: TaxonomyRef;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [confirming, setConfirming] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFieldError(undefined);
    setError(null);
    setSuccess(null);

    const parsed = config.updateSchema.safeParse({ name }) as ParseResult<UpdateInput>;

    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Nome inválido');
      setBusy(false);
      return;
    }

    try {
      const updated = await config.rename(item.slug, parsed.data);

      setName(updated.name);
      setEditing(false);
      setSuccess(config.renameSuccessMessage);
      onChanged();
    } catch (renameError) {
      if (renameError instanceof ApiError) {
        setFieldError(renameError.fieldError('name'));
        setError(formMessageFor(renameError));
      } else {
        setError(formMessageFor(renameError));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      await config.remove(item.slug);
      onChanged();
    } catch (deleteError) {
      setError(formMessageFor(deleteError));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const rowClass = 'border-t';

  return (
    <Fragment>
      <tr data-testid={`${config.testIdPrefix}-${item.slug}`} className={rowClass}>
        <td className="px-3 py-2">{item.name}</td>
        <td className="px-3 py-2">
          <code className="font-mono text-sm text-muted-foreground">{item.slug}</code>
        </td>
        <td data-testid={`${config.testIdPrefix}-jogos-${item.slug}`} className="px-3 py-2">
          {item.gameCount}
        </td>
        <td className="px-3 py-2">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={OUTLINE_BUTTON_CLASS}
              disabled={busy}
              onClick={() => {
                setEditing((current) => !current);
                setConfirming(false);
                setError(null);
                setSuccess(null);
              }}
            >
              Renomear
            </button>
            <button
              type="button"
              className={OUTLINE_BUTTON_CLASS}
              disabled={busy}
              onClick={() => {
                setConfirming((current) => !current);
                setEditing(false);
                setError(null);
                setSuccess(null);
              }}
            >
              Excluir
            </button>
          </div>
        </td>
      </tr>

      {editing ? (
        <tr className="border-t bg-accent/40">
          <td colSpan={4} className="px-3 py-3">
            <form
              onSubmit={(event) => void handleRename(event)}
              noValidate
              className="flex flex-wrap items-end gap-3"
            >
              <div className="min-w-56 flex-1">
                <FormField
                  label="Novo nome"
                  name={`novo-nome-${item.slug}`}
                  value={name}
                  maxLength={config.nameMaxLength}
                  error={fieldError}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <p className="pb-2 text-sm text-muted-foreground">
                Slug (não pode ser alterado): <code className="font-mono">{item.slug}</code>
              </p>
              <div className="flex gap-2 pb-2.5">
                <button type="submit" className={SUBMIT_BUTTON_CLASS} disabled={busy}>
                  Salvar
                </button>
                <button
                  type="button"
                  className={OUTLINE_BUTTON_CLASS}
                  disabled={busy}
                  onClick={() => {
                    setName(item.name);
                    setEditing(false);
                    setFieldError(undefined);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </td>
        </tr>
      ) : null}

      {confirming ? (
        <tr className="border-t bg-destructive/5">
          <td colSpan={4} className="px-3 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <p
                className="text-sm"
                data-testid={`${config.testIdPrefix}-confirmacao-${item.slug}`}
              >
                Excluir “{item.name}”? Esta ação não pode ser desfeita (
                {item.gameCount === 1 ? '1 jogo vinculado' : `${item.gameCount} jogos vinculados`}
                ).
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={DANGER_BUTTON_CLASS}
                  disabled={busy}
                  onClick={() => void handleDelete()}
                >
                  Confirmar exclusão
                </button>
                <button
                  type="button"
                  className={OUTLINE_BUTTON_CLASS}
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </td>
        </tr>
      ) : null}

      {error ? (
        <tr className="border-t">
          <td colSpan={4} className="px-3 pb-3">
            <p
              data-testid={`${config.testIdPrefix}-erro-${item.slug}`}
              role="alert"
              className={ERROR_CLASS}
            >
              {error}
            </p>
          </td>
        </tr>
      ) : null}

      {success ? (
        <tr className="border-t">
          <td colSpan={4} className="px-3 pb-3">
            <p
              data-testid={`${config.testIdPrefix}-sucesso-${item.slug}`}
              className={SUCCESS_CLASS}
            >
              {success}
            </p>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

/**
 * Tela genérica de administração de uma taxonomia do catálogo (seção 4 das SPECs F5/F6/F7),
 * exclusiva de `ADMIN`: listagem com contagem de jogos, criação com prévia do slug,
 * renomeação (slug imutável) e exclusão com confirmação.
 */
export function TaxonomyAdmin({ config }: { config: TaxonomyAdminConfig }) {
  useDocumentTitle(`${config.heading} — Administração — GameLog`);

  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: config.queryKey,
    queryFn: config.fetchAll,
    retry: 1,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: config.queryKey });
    // O filtro do catálogo (F3) é populado pelas leituras públicas da taxonomia (F5/F6).
    void queryClient.invalidateQueries({ queryKey: ['catalog', 'filter-options'] });
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{config.heading}</h1>
        <p className="text-sm text-muted-foreground">{config.description}</p>
      </header>

      <CreateForm config={config} onCreated={refresh} />

      {listQuery.isPending ? (
        <p
          data-testid={`${config.listTestIdPrefix}-carregando`}
          className="text-sm text-muted-foreground"
        >
          {config.loadingMessage}
        </p>
      ) : null}

      {listQuery.isError ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p
            data-testid={`${config.listTestIdPrefix}-erro`}
            role="alert"
            className="text-sm text-destructive"
          >
            {formMessageFor(listQuery.error)}
          </p>
          <button
            type="button"
            data-testid={`${config.listTestIdPrefix}-tentar-novamente`}
            className={OUTLINE_BUTTON_CLASS}
            onClick={() => void listQuery.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {listQuery.data && listQuery.data.length === 0 ? (
        <p
          data-testid={`${config.listTestIdPrefix}-vazio`}
          className="rounded-xl border border-dashed px-6 py-10 text-center text-muted-foreground"
        >
          {config.emptyMessage}
        </p>
      ) : null}

      {listQuery.data && listQuery.data.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Registros cadastrados</caption>
            <thead>
              <tr className="text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">
                  Nome
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Slug
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Jogos
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {listQuery.data.map((item) => (
                <TaxonomyRow key={item.id} config={config} item={item} onChanged={refresh} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
