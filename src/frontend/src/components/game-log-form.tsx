import {
  GAME_LOG_MIN_DATE,
  GAME_LOG_STATUSES,
  gameLogEntryInputSchema,
  gameLogEntryUpdateSchema,
  gameLogStatusLabel,
  gameLogStatusSchema,
  hoursToMinutes,
  minutesToHoursInput,
  todayIsoDate,
  type GameLogEntry,
  type GameLogEntryInput,
  type GameLogEntryUpdateInput,
  type GameLogStatus,
  type GameTaxonomyRef,
} from '@gamelog/shared';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import { FormField } from '@/components/form-field';
import { FormSelect } from '@/components/form-select';
import { Modal } from '@/components/modal';
import { ApiError } from '@/lib/api';
import { fieldErrorsFromDetails, focusFirstField, formMessageFor } from '@/lib/forms';
import { saveMyGameLog, updateMyGameLog } from '@/lib/game-logs';

const SUBMIT_BUTTON_CLASS =
  'h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60';

const OUTLINE_BUTTON_CLASS =
  'rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60';

const INVALID_PLAYTIME_MESSAGE = 'Informe o tempo em horas (ex.: 12,5)';
const MISSING_STATUS_MESSAGE = 'Selecione um status';

/** O campo de tempo do formulário é em horas; os erros da API chegam em minutos. */
const FIELD_ALIASES: Record<string, string> = { playtimeMinutes: 'playtimeHours' };

function mapFieldErrors(errors: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};

  for (const [field, message] of Object.entries(errors)) {
    mapped[FIELD_ALIASES[field] ?? field] ??= message;
  }

  return mapped;
}

export type GameLogFormDialogProps = {
  game: { slug: string; title: string };
  /** Registro existente: presente = edição (PATCH); ausente = criação (PUT). */
  entry?: GameLogEntry | null;
  /** Somente as plataformas vinculadas ao jogo (RN-F8-06). */
  platforms: GameTaxonomyRef[];
  platformsPending?: boolean;
  onClose: () => void;
  onSaved: (entry: GameLogEntry) => void;
};

/**
 * Formulário do diário (seção 4 da SPEC F8): validação no cliente com os schemas
 * compartilhados, datas em pt-BR (campo nativo), tempo informado em horas e plataforma
 * restrita às do jogo. Na edição, apenas os campos alterados são enviados.
 */
export function GameLogFormDialog({
  game,
  entry,
  platforms,
  platformsPending = false,
  onClose,
  onSaved,
}: GameLogFormDialogProps) {
  const editing = Boolean(entry);

  const [status, setStatus] = useState<GameLogStatus | ''>(entry?.status ?? '');
  const [startedAt, setStartedAt] = useState(entry?.startedAt ?? '');
  const [finishedAt, setFinishedAt] = useState(entry?.finishedAt ?? '');
  const [playtimeHours, setPlaytimeHours] = useState(
    entry?.playtimeMinutes != null ? minutesToHoursInput(entry.playtimeMinutes) : '',
  );
  const [platformId, setPlatformId] = useState(entry?.platform?.id ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A plataforma atual pode ter sido desvinculada do jogo depois do registro (RN-F8-06):
  // continua sendo exibida como opção para o valor não mudar sem intenção.
  const platformOptions = entry?.platform
    ? [entry.platform, ...platforms.filter((item) => item.id !== entry.platform?.id)]
    : platforms;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors: Record<string, string> = {};
    const parsedStatus = gameLogStatusSchema.safeParse(status);

    if (!parsedStatus.success) {
      errors.status = MISSING_STATUS_MESSAGE;
    }

    const trimmedPlaytime = playtimeHours.trim();
    const minutes = trimmedPlaytime.length === 0 ? null : hoursToMinutes(trimmedPlaytime);

    if (minutes === null && trimmedPlaytime.length > 0) {
      errors.playtimeHours = INVALID_PLAYTIME_MESSAGE;
    }

    const values = {
      startedAt: startedAt.length > 0 ? startedAt : null,
      finishedAt: finishedAt.length > 0 ? finishedAt : null,
      playtimeMinutes: minutes,
      platformId: platformId.length > 0 ? platformId : null,
    };

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(null);
      focusFirstField(errors);
      return;
    }

    if (!parsedStatus.success) {
      return;
    }

    if (entry) {
      // Edição parcial: só os campos alterados são enviados (RN-F8-02).
      const patch: GameLogEntryUpdateInput = {};

      if (parsedStatus.data !== entry.status) {
        patch.status = parsedStatus.data;
      }

      if (values.startedAt !== entry.startedAt) {
        patch.startedAt = values.startedAt;
      }

      if (values.finishedAt !== entry.finishedAt) {
        patch.finishedAt = values.finishedAt;
      }

      if (values.playtimeMinutes !== entry.playtimeMinutes) {
        patch.playtimeMinutes = values.playtimeMinutes;
      }

      if (values.platformId !== (entry.platform?.id ?? null)) {
        patch.platformId = values.platformId;
      }

      const parsedPatch = gameLogEntryUpdateSchema.safeParse(patch);

      if (!parsedPatch.success) {
        // Nada mudou: não há o que gravar (RN-F8-02).
        onClose();
        return;
      }

      void submit(() => updateMyGameLog(game.slug, parsedPatch.data));
      return;
    }

    const input: GameLogEntryInput = { status: parsedStatus.data, ...values };
    const parsedInput = gameLogEntryInputSchema.safeParse(input);

    if (!parsedInput.success) {
      const zodErrors: Record<string, string> = {};

      for (const issue of parsedInput.error.issues) {
        const field =
          FIELD_ALIASES[String(issue.path[0] ?? 'body')] ?? String(issue.path[0] ?? 'body');
        zodErrors[field] ??= issue.message;
      }

      setFieldErrors(zodErrors);
      setFormError(null);
      focusFirstField(zodErrors);
      return;
    }

    void submit(() => saveMyGameLog(game.slug, parsedInput.data));
  }

  async function submit(request: () => Promise<GameLogEntry>): Promise<void> {
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    try {
      onSaved(await request());
    } catch (error) {
      if (error instanceof ApiError) {
        const apiErrors = mapFieldErrors(fieldErrorsFromDetails(error.details));

        setFieldErrors(apiErrors);
        setFormError(Object.keys(apiErrors).length === 0 ? formMessageFor(error) : null);
      } else {
        setFormError(formMessageFor(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelectChange(setter: (value: string) => void) {
    return (event: ChangeEvent<HTMLSelectElement>) => setter(event.target.value);
  }

  return (
    <Modal title={editing ? 'Editar registro' : 'Adicionar ao diário'} onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        noValidate
        data-testid="formulario-diario"
        className="flex flex-col gap-4"
      >
        <p className="text-sm text-muted-foreground">{game.title}</p>

        {formError ? (
          <p
            role="alert"
            data-testid="erro-formulario-diario"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}

        <FormSelect
          label="Status"
          name="status"
          required
          value={status}
          error={fieldErrors.status}
          onChange={handleSelectChange((value) => setStatus(value as GameLogStatus | ''))}
        >
          <option value="">Selecione…</option>
          {GAME_LOG_STATUSES.map((value) => (
            <option key={value} value={value}>
              {gameLogStatusLabel(value)}
            </option>
          ))}
        </FormSelect>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Data de início"
            name="startedAt"
            type="date"
            min={GAME_LOG_MIN_DATE}
            max={todayIsoDate()}
            value={startedAt}
            error={fieldErrors.startedAt}
            onChange={(event) => setStartedAt(event.target.value)}
          />

          <FormField
            label="Data de conclusão"
            name="finishedAt"
            type="date"
            min={GAME_LOG_MIN_DATE}
            max={todayIsoDate()}
            value={finishedAt}
            error={fieldErrors.finishedAt}
            onChange={(event) => setFinishedAt(event.target.value)}
          />
        </div>

        <FormField
          label="Tempo jogado (em horas)"
          name="playtimeHours"
          inputMode="decimal"
          placeholder="12,5"
          value={playtimeHours}
          error={fieldErrors.playtimeHours}
          onChange={(event) => setPlaytimeHours(event.target.value)}
        />

        <FormSelect
          label="Plataforma"
          name="platformId"
          value={platformId}
          disabled={platformsPending}
          error={fieldErrors.platformId}
          onChange={handleSelectChange(setPlatformId)}
        >
          <option value="">Sem plataforma</option>
          {platformOptions.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.name}
            </option>
          ))}
        </FormSelect>

        {platformsPending ? (
          <p className="text-sm text-muted-foreground">Carregando plataformas do jogo…</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={OUTLINE_BUTTON_CLASS}
          >
            Cancelar
          </button>
          <button
            type="submit"
            data-testid="salvar-diario"
            disabled={submitting}
            className={SUBMIT_BUTTON_CLASS}
          >
            {submitting ? 'Salvando…' : editing ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
