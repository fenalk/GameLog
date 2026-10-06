import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { seedAdminUser } from '../src/modules/auth/auth.seed.js';
import { seedCatalog } from '../src/modules/catalog/catalog.seed.js';

// Script do seed de desenvolvimento: catálogo de exemplo (SPEC F3, seção 1) e
// administrador inicial (RN-F1-14) — `npm run db:seed`.
// Idempotente: reexecutar não duplica jogos nem altera contas existentes.
// O catálogo não é semeado com NODE_ENV=production (CA-F3-23).
const { ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD } = env;

try {
  const catalog = await seedCatalog(prisma);

  if (catalog.status === 'skipped') {
    console.log('Catálogo de exemplo não é semeado em produção.');
  } else {
    console.log(
      `Catálogo de exemplo: ${catalog.games} jogos, ${catalog.genres} gêneros, ${catalog.platforms} plataformas e ${catalog.developers} desenvolvedoras criados (itens existentes foram preservados).`,
    );
  }

  if (!ADMIN_EMAIL || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.warn(
      'ADMIN_EMAIL, ADMIN_USERNAME e ADMIN_PASSWORD não definidos em src/backend/.env: o administrador inicial não foi criado (ver .env.example).',
    );
  } else {
    const result = await seedAdminUser(prisma, {
      email: ADMIN_EMAIL,
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    });

    if (result.status === 'created') {
      console.log(`Administrador criado (id: ${result.userId}).`);
    } else {
      console.log('Administrador já existe; nada foi alterado.');
    }
  }
} finally {
  await prisma.$disconnect();
}
