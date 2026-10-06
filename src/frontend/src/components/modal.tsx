import { useEffect, useId, type ReactNode } from 'react';

const OUTLINE_BUTTON_CLASS =
  'rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60';

const DANGER_BUTTON_CLASS =
  'rounded-md bg-destructive px-3 py-1.5 text-sm text-white transition-colors outline-none hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Diálogo modal mínimo (seção 4 da SPEC F8): fecha com Esc e com o clique no fundo,
 * marca `role="dialog"`/`aria-modal` e associa o título por `aria-labelledby`.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl border bg-card p-5 text-card-foreground shadow-lg"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-medium">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md px-2 text-xl leading-none text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

/** Confirmação de remoção (seção 4 da SPEC F8: "Remover" exige confirmação). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{message}</p>

        {error ? (
          <p role="alert" data-testid="erro-confirmacao" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className={OUTLINE_BUTTON_CLASS}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            data-testid="confirmar-remocao"
            className={DANGER_BUTTON_CLASS}
          >
            {busy ? 'Removendo…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
