import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router';

import { signOut, useAuth } from '@/lib/auth-store';

/** Cabeçalho da aplicação: visitante vê "Entrar"/"Cadastrar"; autenticado vê a conta e "Sair". */
export function AppLayout() {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);

    try {
      await signOut();
      navigate('/');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link to="/" className="font-semibold tracking-tight">
              GameLog
            </Link>
            <Link
              to="/jogos"
              className="text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              Catálogo
            </Link>
          </div>

          <nav aria-label="Sessão" className="flex items-center gap-4 text-sm">
            {status === 'loading' ? (
              <span className="text-muted-foreground">Carregando sessão…</span>
            ) : null}

            {status === 'anonymous' ? (
              <>
                <Link
                  to="/entrar"
                  className="rounded-md px-2 py-1 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  Entrar
                </Link>
                <Link
                  to="/cadastro"
                  className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  Cadastrar
                </Link>
              </>
            ) : null}

            {status === 'authenticated' && user ? (
              <>
                {user.role === 'ADMIN' ? (
                  <>
                    <Link
                      to="/admin/generos"
                      data-testid="menu-admin-generos"
                      className="rounded-md px-2 py-1 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      Gêneros
                    </Link>
                    <Link
                      to="/admin/plataformas"
                      data-testid="menu-admin-plataformas"
                      className="rounded-md px-2 py-1 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      Plataformas
                    </Link>
                    <Link
                      to="/admin/desenvolvedoras"
                      data-testid="menu-admin-desenvolvedoras"
                      className="rounded-md px-2 py-1 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      Desenvolvedoras
                    </Link>
                  </>
                ) : null}
                <Link
                  to="/conta"
                  data-testid="usuario-atual"
                  className="rounded-md px-2 py-1 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  {user.username}
                </Link>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={signingOut}
                  className="rounded-md border px-3 py-1.5 transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
                >
                  Sair
                </button>
              </>
            ) : null}
          </nav>
        </div>
      </header>

      <Outlet />
    </div>
  );
}
