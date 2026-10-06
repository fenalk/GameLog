import { createBrowserRouter } from 'react-router';

import { AppLayout } from '@/components/app-layout';
import { RequireAuth } from '@/components/require-auth';
import { CadastroPage } from '@/pages/cadastro';
import { ContaPage } from '@/pages/conta';
import { EntrarPage } from '@/pages/entrar';
import { HomePage } from '@/pages/home';
import { JogadorPage } from '@/pages/jogador';

/**
 * Rotas da aplicação. `/conta` é protegida: o visitante é enviado para
 * `/entrar?returnTo=<rota>` e volta à rota original após o login. `/jogadores/:username`
 * é o perfil público (SPEC F2).
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
