import { createBrowserRouter } from 'react-router';

import { AppLayout } from '@/components/app-layout';
import { RequireAuth } from '@/components/require-auth';
import { CadastroPage } from '@/pages/cadastro';
import { CatalogoPage } from '@/pages/catalogo';
import { ContaPage } from '@/pages/conta';
import { EntrarPage } from '@/pages/entrar';
import { HomePage } from '@/pages/home';
import { JogadorPage } from '@/pages/jogador';
import { JogoPage } from '@/pages/jogo';

/**
 * Rotas da aplicação. `/conta` é protegida: o visitante é enviado para
 * `/entrar?returnTo=<rota>` e volta à rota original após o login. `/jogadores/:username`
 * é o perfil público (SPEC F2); `/jogos` e `/jogos/:slug` são o catálogo e o detalhe do
 * jogo (SPEC F3), públicos e sem exigir autenticação.
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
    ],
  },
]);
