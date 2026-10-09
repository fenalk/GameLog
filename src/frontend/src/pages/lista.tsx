import { publicProfilePath, type ListItem } from '@gamelog/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { CatalogError } from '@/components/catalog-feedback';
import { ListVisibilityBadge } from '@/components/list-card';
import { ListItemRow } from '@/components/list-item';
import { ListNoteDialog } from '@/components/list-note-dialog';
import { ConfirmDialog } from '@/components/modal';
import { NotFound } from '@/components/not-found';
import { Pagination } from '@/components/pagination';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { useDocumentTitle } from '@/lib/document-title';
import { formMessageFor } from '@/lib/forms';
import {
  LIST_ITEM_SORT_OPTIONS,
  deleteMyList,
  fetchAllListItems,
  fetchListDetail,
  formatItemsCount,
  listEditorPath,
  listItemsRequestFromState,
  listItemsStateFromSearch,
  reorderList,
  removeListItem,
} from '@/lib/lists';

/**
 * Página da lista (`/listas/:id`, seção 4 da SPEC F11): permalink com título, descrição,
 * dono, selo de visibilidade e os itens na ordem manual. O dono vê as ações de reordenar,
 * editar a nota e remover itens, além de editar/excluir a lista. 404 para lista inexistente
 * ou privada de terceiros.
 */
export function ListaPage() {
  const { id } = useParams();
  const { user, status: authStatus } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const state = listItemsStateFromSearch(searchParams);
  const request = listItemsRequestFromState(state);

  const [noteItem, setNoteItem] = useState<ListItem | null>(null);
  const [removingItem, setRemovingItem] = useState<ListItem | null>(null);
  const [removeItemError, setRemoveItemError] = useState<string | undefined>(undefined);
  const [removingList, setRemovingList] = useState(false);
  const [removeListError, setRemoveListError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['lists', 'detail', id, request],
    queryFn: () => fetchListDetail(id ?? '', request),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });

  useDocumentTitle(query.data ? `${query.data.title} · GameLog` : 'Lista · GameLog');

  const updateParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          mutate(params);
          return params;
        },
        { replace: true, flushSync: true },
      );
    },
    [setSearchParams],
  );

  function selectSort(value: string) {
    updateParams((params) => {
      if (value === 'position') {
        params.delete('sort');
      } else {
        params.set('sort', value);
      }

      params.delete('order');
      params.delete('page');
    });
  }

  function goToPage(page: number) {
    updateParams((params) => {
      if (page > 1) {
        params.set('page', String(page));
      } else {
        params.delete('page');
      }
    });
  }

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['lists'] });
  }

  async function handleMove(item: ListItem, direction: -1 | 1) {
    if (!id) {
      return;
    }

    setMoving(true);
    setActionError(null);

    try {
      const items = await fetchAllListItems(id);
      const index = items.findIndex((entry) => entry.game.id === item.game.id);
      const target = index + direction;

      if (index < 0 || target < 0 || target >= items.length) {
        return;
      }

      const reordered = [...items];
      const current = reordered[index]!;
      reordered[index] = reordered[target]!;
      reordered[target] = current;

      await reorderList(
        id,
        reordered.map((entry) => entry.game.slug),
      );
      invalidate();
    } catch (error) {
      setActionError(formMessageFor(error));
    } finally {
      setMoving(false);
    }
  }

  async function handleRemoveItem() {
    if (!id || !removingItem) {
      return;
    }

    setBusy(true);
    setRemoveItemError(undefined);

    try {
      await removeListItem(id, removingItem.game.slug);
      setRemovingItem(null);
      invalidate();
    } catch (error) {
      setRemoveItemError(formMessageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveList() {
    if (!id) {
      return;
    }

    setBusy(true);
    setRemoveListError(undefined);

    try {
      await deleteMyList(id);
      setRemovingList(false);
      invalidate();
      navigate(`/jogadores/${encodeURIComponent(query.data?.owner.username ?? '')}?secao=listas`);
    } catch (error) {
      setRemoveListError(formMessageFor(error));
    } finally {
      setBusy(false);
    }
  }

  if (!id) {
    return <NotFound message="Lista não encontrada" />;
  }

  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <NotFound message="Lista não encontrada" />;
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

  if (!query.data) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <p className="text-muted-foreground">Carregando lista…</p>
      </main>
    );
  }

  const list = query.data;
  const isOwner = authStatus === 'authenticated' && user?.username === list.owner.username;
  const items = list.items.data;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-4 rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                data-testid="lista-detalhe-titulo"
                className="text-2xl font-semibold tracking-tight"
              >
                {list.title}
              </h1>
              <ListVisibilityBadge visibility={list.visibility} />
            </div>
            <p className="text-sm text-muted-foreground">
              por{' '}
              <Link
                to={publicProfilePath(list.owner.username)}
                data-testid="lista-dono"
                className="underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {list.owner.displayName}
              </Link>{' '}
              · {formatItemsCount(list.itemsCount)}
            </p>
          </div>

          {isOwner ? (
            <div className="flex flex-wrap gap-2">
              <Link
                to={listEditorPath(list.id)}
                data-testid="lista-editar"
                className="rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Editar lista
              </Link>
              <button
                type="button"
                data-testid="lista-excluir"
                onClick={() => {
                  setRemoveListError(undefined);
                  setRemovingList(true);
                }}
                className="rounded-md border px-3 py-1.5 text-sm text-destructive transition-colors outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Excluir lista
              </button>
            </div>
          ) : null}
        </div>

        {list.description ? (
          <p
            data-testid="lista-detalhe-descricao"
            className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground"
          >
            {list.description}
          </p>
        ) : null}
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Jogos</h2>

          <div className="flex items-center gap-2">
            <label htmlFor="ordem-itens" className="text-sm font-medium">
              Ordenar
            </label>
            <select
              id="ordem-itens"
              name="sort"
              value={state.sort || 'position'}
              onChange={(event) => selectSort(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {LIST_ITEM_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {actionError ? (
          <p role="alert" data-testid="lista-erro-acao" className="text-sm text-destructive">
            {actionError}
          </p>
        ) : null}

        {query.isFetching && !query.isPending ? (
          <p className="text-sm text-muted-foreground">Atualizando…</p>
        ) : null}

        {items.length === 0 ? (
          <div
            data-testid="lista-vazia"
            className="flex flex-col items-center gap-1 rounded-xl border border-dashed px-6 py-12 text-center"
          >
            <p className="font-medium">Esta lista ainda não tem jogos</p>
            {isOwner ? (
              <p className="text-sm text-muted-foreground">
                Adicione jogos pela página de um jogo do catálogo.
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <ul data-testid="lista-itens" className="flex flex-col gap-3">
              {items.map((item) => (
                <ListItemRow
                  key={item.game.id}
                  item={item}
                  isOwner={isOwner && state.sort === ''}
                  canMoveUp={item.position > 0}
                  canMoveDown={item.position < list.itemsCount - 1}
                  busy={moving}
                  onMoveUp={(entry) => void handleMove(entry, -1)}
                  onMoveDown={(entry) => void handleMove(entry, 1)}
                  onEditNote={setNoteItem}
                  onRemove={(entry) => {
                    setRemoveItemError(undefined);
                    setRemovingItem(entry);
                  }}
                />
              ))}
            </ul>

            <Pagination
              page={list.items.meta.page}
              totalPages={list.items.meta.totalPages}
              onPageChange={goToPage}
            />
          </>
        )}
      </section>

      {noteItem && isOwner ? (
        <ListNoteDialog
          listId={list.id}
          item={noteItem}
          onClose={() => setNoteItem(null)}
          onSaved={invalidate}
        />
      ) : null}

      {removingItem ? (
        <ConfirmDialog
          title="Remover da lista"
          message={`Remover "${removingItem.game.title}" desta lista?`}
          confirmLabel="Remover"
          busy={busy}
          error={removeItemError}
          onConfirm={() => void handleRemoveItem()}
          onCancel={() => {
            setRemovingItem(null);
            setRemoveItemError(undefined);
          }}
        />
      ) : null}

      {removingList ? (
        <ConfirmDialog
          title="Excluir lista"
          message={`Excluir a lista "${list.title}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          busy={busy}
          error={removeListError}
          onConfirm={() => void handleRemoveList()}
          onCancel={() => {
            setRemovingList(false);
            setRemoveListError(undefined);
          }}
        />
      ) : null}
    </main>
  );
}
