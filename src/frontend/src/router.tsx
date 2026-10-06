import { createBrowserRouter } from 'react-router';

import { AppLayout } from '@/components/app-layout';
import { RequireAuth } from '@/components/require-auth';
import { CadastroPage } from '@/pages/cadastro';
import { ContaPage } from '@/pages/conta';
import { EntrarPage } from '@/pages/entrar';
import { HomePage } from '@/pages/home';

/**
 * Rotas da aplicação. `/conta` é protegida: o visitante é enviado para
 * `/entrar?returnTo=<rota>` e volta à rota original após o login.
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
    ],
  },
]);
