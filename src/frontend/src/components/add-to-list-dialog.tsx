import { LIST_TITLE_MAX, listTitleSchema, type ListSummary } from '@gamelog/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { FormField } from '@/components/form-field';
import { Modal } from '@/components/modal';
import { ApiError } from '@/lib/api';
import { fieldErrorsFromDetails, formMessageFor } from '@/lib/forms';
import {
  addGameToList,
  createMyList,
  fetchMyLists,
  removeListItem,
  type MyListsRequest,
} from '@/lib/lists';

/**
 * Diálogo "Adicionar a lista" da página do jogo (seção 4 da SPEC F11): lista as listas do
 * usuário (marcadas as que já contêm o jogo) e permite marcar/desmarcar e criar uma nova
 * lista sem sair da página. Usa `GET /me/lists` e `GET /me/lists?game=:game` (RN-F11-17).
 */
export function AddToListDialog({
  game,
  onClose,
}: {
  game: { slug: string; title: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState('');
  const [titleError, setTitleError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyListId, setBusyListId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Estado otimista da associação: o checkbox reflete a intenção imediatamente, sem
  // esperar o retorno da API (que confirma ou reverte em caso de erro).
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const allRequest: MyListsRequest = { pageSize: 100 };
  const containingRequest: MyListsRequest = { game: game.slug, pageSize: 100 };

  const allQuery = useQuery({
    queryKey: ['lists', 'mine', 'all', game.slug],
    queryFn: () => fetchMyLists(allRequest),
    retry: 1,
  });

  const containingQuery = useQuery({
    queryKey: ['lists', 'mine', 'containing', game.slug],
    queryFn: () => fetchMyLists(containingRequest),
    retry: 1,
  });

  const containingIds = new Set((containingQuery.data?.data ?? []).map((list) => list.id));

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['lists'] });
  }

  function isContaining(listId: string): boolean {
    return overrides[listId] ?? containingIds.has(listId);
  }

  function toggle(list: ListSummary) {
    const next = !isContaining(list.id);

    setActionError(null);
    setBusyListId(list.id);
    setOverrides((current) => ({ ...current, [list.id]: next }));

    const action = next ? addGameToList(list.id, game.slug) : removeListItem(list.id, game.slug);

    action
      .then(() => invalidate())
      .catch((error: unknown) => {
        setOverrides((current) => ({ ...current, [list.id]: !next }));
        setActionError(formMessageFor(error));
      })
      .finally(() => setBusyListId(null));
  }

  const createMutation = useMutation({
    mutationFn: async (title: string) => {
      const created = await createMyList({ title });

      await addGameToList(created.id, game.slug);

      return created;
    },
    onSuccess: (created) => {
      setNewTitle('');
      setOverrides((current) => ({ ...current, [created.id]: true }));
      invalidate();
    },
  });

  function handleCreate() {
    setTitleError(undefined);
    setActionError(null);

    const parsed = listTitleSchema.safeParse(newTitle);

    if (!parsed.success) {
      setTitleError(parsed.error.issues[0]?.message ?? 'Título inválido');
      return;
    }

    setCreating(true);

    createMutation
      .mutateAsync(parsed.data)
      .catch((error: unknown) => {
        if (error instanceof ApiError) {
          setTitleError(fieldErrorsFromDetails(error.details).title);
        }

        setActionError(formMessageFor(error));
      })
      .finally(() => setCreating(false));
  }

  const lists = allQuery.data?.data ?? [];
  const pending = allQuery.isPending || containingQuery.isPending;

  return (
    <Modal title="Adicionar a lista" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Escolha em quais listas <span className="font-medium">{game.title}</span> deve aparecer.
        </p>

        {actionError ? (
          <p role="alert" data-testid="erro-listas" className="text-sm text-destructive">
            {actionError}
          </p>
        ) : null}

        {pending ? <p className="text-sm text-muted-foreground">Carregando suas listas…</p> : null}

        {allQuery.isError || containingQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar suas listas.
          </p>
        ) : null}

        {!pending && !allQuery.isError && lists.length === 0 ? (
          <p data-testid="lista-selecao-vazia" className="text-sm text-muted-foreground">
            Você ainda não criou listas. Crie a primeira abaixo.
          </p>
        ) : null}

        {lists.length > 0 ? (
          <ul data-testid="lista-selecao" className="flex flex-col gap-2">
            {lists.map((list) => (
              <li key={list.id} className="flex items-center gap-3">
                <input
                  id={`lista-opcao-${list.id}`}
                  type="checkbox"
                  checked={isContaining(list.id)}
                  disabled={busyListId === list.id || containingQuery.isPending}
                  onChange={() => toggle(list)}
                  className="size-4"
                />
                <label htmlFor={`lista-opcao-${list.id}`} className="flex-1 text-sm">
                  {list.title}
                </label>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-col gap-3 border-t pt-4">
          <h3 className="text-sm font-medium">Nova lista</h3>
          <FormField
            label="Título"
            name="newListTitle"
            maxLength={LIST_TITLE_MAX}
            value={newTitle}
            error={titleError}
            placeholder="Ex.: Quero jogar"
            onChange={(event) => setNewTitle(event.target.value)}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              data-testid="nova-lista-criar"
              className="rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
            >
              {creating ? 'Criando…' : 'Criar e adicionar'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
