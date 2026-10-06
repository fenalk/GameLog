import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { seedAdminUser } from '../src/modules/auth/auth.seed.js';

// Script do seed do administrador inicial (RN-F1-14): `npm run db:seed`.
// Idempotente: reexecutar não duplica nem altera a conta existente.
// As variáveis são lidas de src/backend/.env (já carregado por config/env.ts).
const { ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD } = env;

if (!ADMIN_EMAIL || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error(
    'Defina ADMIN_EMAIL, ADMIN_USERNAME e ADMIN_PASSWORD em src/backend/.env antes de rodar o seed (ver .env.example).',
  );
  process.exit(1);
}

try {
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
} finally {
  await prisma.$disconnect();
}
