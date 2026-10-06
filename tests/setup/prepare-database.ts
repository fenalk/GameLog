import { prepareTestDatabase } from './test-database.js';

/**
 * `globalSetup` compartilhado pelo Vitest e pelo Playwright: cria/migra o banco
 * dedicado aos testes antes de qualquer teste rodar (ver tests/setup/test-database.ts).
 */
export default function prepareDatabase(): void {
  prepareTestDatabase();
}
