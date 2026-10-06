import { createBrowserRouter } from 'react-router';

import { HomePage } from '@/pages/home';

/**
 * Roteamento base (T0.09 da Etapa 0). As rotas das funcionalidades (catálogo, jogo,
 * perfil, listas etc.) serão adicionadas conforme as SPECs de cada etapa.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
]);
