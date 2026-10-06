import { useState } from 'react';

import { initialsFor } from '@/lib/profile';
import { cn } from '@/lib/utils';

export type ProfileAvatarProps = {
  displayName: string;
  avatarUrl: string | null;
  className?: string;
};

/**
 * Avatar do perfil (RN-F2-10): imagem externa com `referrerpolicy="no-referrer"` e
 * iniciais do `displayName` quando a URL é nula ou a imagem falha ao carregar.
 */
export function ProfileAvatar({ displayName, avatarUrl, className }: ProfileAvatarProps) {
  // Guarda a URL que falhou (em vez de um booleano) para tentar de novo quando ela muda.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageUrl = avatarUrl && avatarUrl !== failedUrl ? avatarUrl : null;

  return (
    <span
      aria-hidden
      className={cn(
        'flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-xl font-semibold text-muted-foreground',
        className,
      )}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(imageUrl)}
          data-testid="avatar-imagem"
          className="size-full object-cover"
        />
      ) : (
        <span data-testid="avatar-iniciais">{initialsFor(displayName)}</span>
      )}
    </span>
  );
}
