/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base da API REST; por padrão usa o proxy /api do servidor de desenvolvimento. */
  readonly VITE_API_URL?: string;
  /** Destino do proxy /api em desenvolvimento (padrão: http://localhost:3000). */
  readonly VITE_API_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
