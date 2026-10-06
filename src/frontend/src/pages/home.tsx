import { useQuery } from '@tanstack/react-query';

import { fetchHealth } from '@/lib/api';
import { cn } from '@/lib/utils';

const STACK = [
  { label: 'Backend', value: 'Node.js · Fastify · Zod · Prisma' },
  { label: 'Banco de dados', value: 'PostgreSQL' },
  { label: 'Frontend', value: 'React · Vite · Tailwind CSS · shadcn/ui' },
  { label: 'Testes', value: 'Vitest · Supertest · Playwright' },
] as const;

export function HomePage() {
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10_000,
    retry: 1,
  });

  const status = healthQuery.isSuccess ? 'ok' : healthQuery.isError ? 'offline' : 'loading';

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">GameLog</h1>
        <p className="text-muted-foreground">
          Etapa 0 — fundação do projeto: frontend React consumindo a API REST do backend Fastify.
        </p>
      </header>

      <section className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <h2 className="text-lg font-medium">Status da API REST</h2>

        <div className="mt-4 flex items-center gap-3">
          <span
            aria-hidden
            className={cn(
              'size-3 rounded-full',
              status === 'ok' && 'bg-emerald-500',
              status === 'offline' && 'bg-destructive',
              status === 'loading' && 'bg-muted-foreground',
            )}
          />
          <span data-testid="api-status" className="font-mono text-sm">
            {status === 'ok' ? 'ok' : status === 'offline' ? 'indisponível' : 'verificando...'}
          </span>
        </div>

        {healthQuery.data ? (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <dt>Serviço</dt>
            <dd className="font-mono">{healthQuery.data.service}</dd>
            <dt>Tempo de atividade</dt>
            <dd className="font-mono">{healthQuery.data.uptimeSeconds}s</dd>
            <dt>Verificado em</dt>
            <dd className="font-mono">{healthQuery.data.timestamp}</dd>
          </dl>
        ) : null}

        {healthQuery.isError ? (
          <p className="mt-4 text-sm text-destructive">
            Não foi possível falar com a API REST. Verifique se o backend está rodando (npm run
            dev:backend) e se o PostgreSQL está no ar (docker compose up -d db).
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {STACK.map((item) => (
          <div key={item.label} className="rounded-xl border p-4">
            <h3 className="text-sm font-medium">{item.label}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{item.value}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
