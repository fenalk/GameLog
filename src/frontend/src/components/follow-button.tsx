import { followButtonLabel, type FollowState } from '@gamelog/shared';
import { useState } from 'react';
import { Link } from 'react-router';

import { ConfirmDialog } from '@/components/modal';
import { useAuth } from '@/lib/auth-store';
import { followPlayer, unfollowPlayer } from '@/lib/follows';
import { formMessageFor } from '@/lib/forms';
import { cn } from '@/lib/utils';

const BASE_BUTTON_CLASS =
  'rounded-md px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60';
const FOLLOW_BUTTON_CLASS = 'bg-foreground text-background hover:bg-foreground/90';
const FOLLOWING_BUTTON_CLASS = 'border hover:bg-accent';

export type FollowButtonProps = {
  /** Username do alvo (perfil ou item da listagem). */
  username: string;
  displayName: string;
  /** Estado atual do vínculo (`isFollowedByMe`). */
  isFollowing: boolean;
  /** Rota para onde voltar depois de entrar (padrão da F1). */
  returnTo: string;
  className?: string;
  /** Estado devolvido pelo `PUT`, para atualizar o botão e os contadores (RN-F12-04). */
  onFollowed: (state: FollowState) => void;
  onUnfollowed: () => void;
};

/**
 * Botão **Seguir/Seguindo** (seção 4 da SPEC F12): para visitantes vira convite a entrar;
 * para autenticados alterna o vínculo, e deixar de seguir pede confirmação. O botão fica
 * desabilitado durante a requisição e o estado é atualizado pelo retorno do `PUT`.
 */
export function FollowButton({
  username,
  displayName,
  isFollowing,
  returnTo,
  className,
  onFollowed,
  onUnfollowed,
}: FollowButtonProps) {
  const { status } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const buttonClass = cn(
    BASE_BUTTON_CLASS,
    isFollowing ? FOLLOWING_BUTTON_CLASS : FOLLOW_BUTTON_CLASS,
    className,
  );

  if (status === 'anonymous') {
    return (
      <Link
        to={`/entrar?returnTo=${encodeURIComponent(returnTo)}`}
        data-testid={`seguir-${username}`}
        className={buttonClass}
      >
        Seguir
      </Link>
    );
  }

  async function handleFollow() {
    setBusy(true);
    setError(undefined);

    try {
      onFollowed(await followPlayer(username));
    } catch (caught) {
      setError(formMessageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnfollow() {
    setBusy(true);
    setError(undefined);

    try {
      await unfollowPlayer(username);
      setConfirming(false);
      onUnfollowed();
    } catch (caught) {
      setError(formMessageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid={`seguir-${username}`}
        aria-pressed={isFollowing}
        disabled={busy || status === 'loading'}
        onClick={() => {
          if (isFollowing) {
            setError(undefined);
            setConfirming(true);
          } else {
            void handleFollow();
          }
        }}
        className={buttonClass}
      >
        {followButtonLabel(isFollowing)}
      </button>

      {error && !confirming ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title="Deixar de seguir"
          message={`Deixar de seguir ${displayName}? Você pode voltar a segui-lo depois.`}
          confirmLabel="Deixar de seguir"
          busy={busy}
          error={error}
          onConfirm={() => void handleUnfollow()}
          onCancel={() => {
            setConfirming(false);
            setError(undefined);
          }}
        />
      ) : null}
    </>
  );
}
