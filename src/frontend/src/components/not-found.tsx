import { Link } from 'react-router';

/** Página 404 (ex.: perfil inexistente em `/jogadores/:username`) — CA-F2-22. */
export function NotFound({ message = 'Página não encontrada' }: { message?: string }) {
  return (
    <main
      data-testid="pagina-404"
      className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-16"
    >
      <p className="text-sm font-medium text-muted-foreground">Erro 404</p>
      <h1 className="text-2xl font-semibold tracking-tight">{message}</h1>
      <p className="text-sm text-muted-foreground">
        O endereço acessado não existe ou o conteúdo foi removido.
      </p>
      <Link to="/" className="text-sm underline underline-offset-4 hover:text-foreground">
        Voltar para a página inicial
      </Link>
    </main>
  );
}
