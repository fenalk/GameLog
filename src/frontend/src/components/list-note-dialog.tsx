import { LIST_ITEM_NOTE_MAX, listItemNoteSchema, type ListItem } from '@gamelog/shared';
import { useState, type FormEvent } from 'react';

import { FormField } from '@/components/form-field';
import { Modal } from '@/components/modal';
import { ApiError } from '@/lib/api';
import { fieldErrorsFromDetails, formMessageFor } from '@/lib/forms';
import { updateListItem } from '@/lib/lists';

/**
 * Diálogo de edição da nota curta de um item (seção 4 da SPEC F11): valida com o schema
 * compartilhado e envia apenas a nota; nota vazia limpa o campo (`null`).
 */
export function ListNoteDialog({
  listId,
  item,
  onClose,
  onSaved,
}: {
  listId: string;
  item: ListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState(item.note ?? '');
  const [error, setError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setActionError(null);

    const parsed = listItemNoteSchema.safeParse(note);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Nota inválida');
      return;
    }

    setBusy(true);

    updateListItem(listId, item.game.id, { note: parsed.data.length > 0 ? parsed.data : null })
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof ApiError) {
          const fieldErrors = fieldErrorsFromDetails(requestError.details);
          setError(fieldErrors.note);
        }

        setActionError(formMessageFor(requestError));
      })
      .finally(() => setBusy(false));
  }

  return (
    <Modal title="Editar nota" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField
          label="Nota"
          name="note"
          maxLength={LIST_ITEM_NOTE_MAX}
          value={note}
          error={error}
          placeholder="Um comentário curto sobre este jogo na lista (opcional)"
          onChange={(event) => setNote(event.target.value)}
        />

        <p className="text-xs text-muted-foreground">
          {note.length}/{LIST_ITEM_NOTE_MAX} caracteres · deixe em branco para remover a nota.
        </p>

        {actionError ? (
          <p role="alert" data-testid="erro-nota" className="text-sm text-destructive">
            {actionError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            data-testid="salvar-nota"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
          >
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
