import { createBrowserRouter } from 'react-router';

import { AppLayout } from '@/components/app-layout';
import { RequireAdmin } from '@/components/require-admin';
import { RequireAuth } from '@/components/require-auth';
import { AdminDesenvolvedorasPage } from '@/pages/admin-desenvolvedoras';
import { AdminGenerosPage } from '@/pages/admin-generos';
import { AdminPlataformasPage } from '@/pages/admin-plataformas';
import { CadastroPage } from '@/pages/cadastro';
import { CatalogoPage } from '@/pages/catalogo';
import { ContaPage } from '@/pages/conta';
import { EntrarPage } from '@/pages/entrar';
import { HomePage } from '@/pages/home';
import { JogadorPage } from '@/pages/jogador';
import { JogoPage } from '@/pages/jogo';
import { ReviewEditorPage } from '@/pages/review-editor';
import { ReviewPage } from '@/pages/review';

/**
 * Rotas da aplicação. `/conta` é protegida: o visitante é enviado para
 * `/entrar?returnTo=<rota>` e volta à rota original após o login. `/jogadores/:username`
 * é o perfil público (SPEC F2); `/jogos` e `/jogos/:slug` são o catálogo e o detalhe do
 * jogo (SPEC F3), públicos e sem exigir autenticação. `/admin/generos`,
 * `/admin/plataformas` e `/admin/desenvolvedoras` são as telas de administração (SPECs
 * F5, F6 e F7), exclusivas de `ADMIN`.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'jogos',
        element: <CatalogoPage />,
      },
      {
        path: 'jogos/:slug',
        element: <JogoPage />,
      },
      {
        path: 'jogos/:slug/resenha',
        element: (
          <RequireAuth>
            <ReviewEditorPage />
          </RequireAuth>
        ),
      },
      {
        path: 'resenhas/:id',
        element: <ReviewPage />,
      },
      {
        path: 'cadastro',
        element: <CadastroPage />,
      },
      {
        path: 'entrar',
        element: <EntrarPage />,
      },
      {
        path: 'conta',
        element: (
          <RequireAuth>
            <ContaPage />
          </RequireAuth>
        ),
      },
      {
        path: 'jogadores/:username',
        element: <JogadorPage />,
      },
      {
        path: 'admin/generos',
        element: (
          <RequireAdmin>
            <AdminGenerosPage />
          </RequireAdmin>
        ),
      },
      {
        path: 'admin/plataformas',
        element: (
          <RequireAdmin>
            <AdminPlataformasPage />
          </RequireAdmin>
        ),
      },
      {
        path: 'admin/desenvolvedoras',
        element: (
          <RequireAdmin>
            <AdminDesenvolvedorasPage />
          </RequireAdmin>
        ),
      },
    ],
  },
]);
