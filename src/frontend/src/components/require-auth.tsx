import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import { useAuth } from '@/lib/auth-store';

/**
 * Protege rotas autenticadas: enquanto a sessão é restaurada exibe um aviso; visitante
 * é redirecionado para `/entrar?returnTo=<rota>` (seção 6 da SPEC F1).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <p className="text-muted-foreground">Carregando sessão…</p>
      </main>
    );
  }

  if (status === 'anonymous') {
    const returnTo = `${location.pathname}${location.search}`;

    return <Navigate to={`/entrar?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  return <>{children}</>;
}
