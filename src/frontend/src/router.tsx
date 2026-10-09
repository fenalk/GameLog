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
import { ListaPage } from '@/pages/lista';
import { ListaEditorPage } from '@/pages/lista-editor';
import { ReviewEditorPage } from '@/pages/review-editor';
import { ReviewPage } from '@/pages/review';
import { SeguidoresPage, SeguindoPage } from '@/pages/seguidores';

/**
 * Rotas da aplicação. `/conta` é protegida: o visitante é enviado para
 * `/entrar?returnTo=<rota>` e volta à rota original após o login. `/jogadores/:username`
 * é o perfil público (SPEC F2); `/jogadores/:username/seguidores` e
 * `/jogadores/:username/seguindo` são as listas públicas de seguidores e seguindo (SPEC
 * F12); `/jogos` e `/jogos/:slug` são o catálogo e o detalhe do
 * jogo (SPEC F3), públicos e sem exigir autenticação. `/admin/generos`,
 * `/admin/plataformas` e `/admin/desenvolvedoras` são as telas de administração (SPECs
 * F5, F6 e F7), exclusivas de `ADMIN`. `/listas/:id` é o permalink de uma lista e
 * `/listas/nova` e `/listas/:id/editar` são o editor (SPEC F11), protegidos por sessão.
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
        path: 'listas/nova',
        element: (
          <RequireAuth>
            <ListaEditorPage />
          </RequireAuth>
        ),
      },
      {
        path: 'listas/:id',
        element: <ListaPage />,
      },
      {
        path: 'listas/:id/editar',
        element: (
          <RequireAuth>
            <ListaEditorPage />
          </RequireAuth>
        ),
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
        path: 'jogadores/:username/seguidores',
        element: <SeguidoresPage />,
      },
      {
        path: 'jogadores/:username/seguindo',
        element: <SeguindoPage />,
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
