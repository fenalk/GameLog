import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';

import { useAuth } from '@/lib/auth-store';

/**
 * Protege as rotas administrativas (seção 4 da SPEC F5): visitante é enviado ao login com
 * `returnTo` (padrão da F1); jogador autenticado vê "Acesso restrito" (403); ADMIN acessa.
 * Reutilizável pelas telas de administração de F4–F7.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
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

  if (user?.role !== 'ADMIN') {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-16">
        <h1 data-testid="acesso-restrito" className="text-2xl font-semibold tracking-tight">
          Acesso restrito
        </h1>
        <p className="text-muted-foreground">
          Esta área é exclusiva de administradores da plataforma.
        </p>
        <Link
          to="/"
          className="self-start rounded-md border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          Voltar para a Home
        </Link>
      </main>
    );
  }

  return <>{children}</>;
}
