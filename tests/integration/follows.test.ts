import {
  AUTH_ROUTES,
  FOLLOWING_MAX,
  apiErrorSchema,
  followMePath,
  followPageSchema,
  followStateSchema,
  followersPath,
  followingPath,
  ownProfileSchema,
  publicProfileSchema,
} from '@gamelog/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, testPath, type App } from '../helpers/app.js';
import { createGame } from '../helpers/catalog.js';
import { createFollow } from '../helpers/follows.js';
import { createTestUser, disconnectDatabase, prisma, resetDatabase } from '../helpers/db.js';

const VALID_PASSWORD = 'senhaForte1';
const AUTH_SCHEME = 'Bearer';

describe('SPEC F12 — seguimento de outros jogadores (API REST)', () => {
  let app: App;
  let queryCount = 0;

  beforeAll(async () => {
    app = await buildTestApp();

    // Conta as consultas emitidas pelo Prisma para verificar o CA-F12-12 (o evento só
    // existe em NODE_ENV=test — ver lib/prisma.ts).
    (prisma as unknown as { $on: (event: string, listener: () => void) => void }).$on(
      'query',
      () => {
        queryCount += 1;
      },
    );
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectDatabase();
  });

  function get(path: string, token?: string, query: Record<string, unknown> = {}) {
    const call = request(app.server).get(testPath(path)).query(query);

    return token ? call.set('Authorization', `${AUTH_SCHEME} ${token}`) : call;
  }

  function put(path: string, token?: string, body?: unknown) {
    const call = request(app.server).put(testPath(path));

    if (body !== undefined) {
      call.send(body);
    }

    return token ? call.set('Authorization', `${AUTH_SCHEME} ${token}`) : call;
  }

  function remove(path: string, token?: string, body?: unknown) {
    const call = request(app.server).delete(testPath(path));

    if (body !== undefined) {
      call.send(body);
    }

    return token ? call.set('Authorization', `${AUTH_SCHEME} ${token}`) : call;
  }

  /** Cria a conta e devolve o access token (a senha é a mesma de todos os cenários). */
  async function login(username: string, role?: 'ADMIN'): Promise<string> {
    await createTestUser({
      username,
      email: `${username}@example.com`,
      password: VALID_PASSWORD,
      ...(role ? { role } : {}),
    });

    const response = await request(app.server)
      .post(testPath(AUTH_ROUTES.login))
      .send({ identifier: username, password: VALID_PASSWORD });

    expect(response.status).toBe(200);

    return response.body.accessToken as string;
  }

  /** Cria apenas a conta (sem sessão), para cenários em que o vínculo vem por fixture. */
  async function createUser(username: string): Promise<string> {
    const user = await createTestUser({
      username,
      email: `${username}@example.com`,
      password: VALID_PASSWORD,
    });

    return user.id;
  }

  async function userId(username: string): Promise<string> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { username },
      select: { id: true },
    });

    return user.id;
  }

  async function followCount(): Promise<number> {
    return prisma.follow.count();
  }

  function expectError(
    response: { status: number; body: unknown },
    status: number,
    code: string,
  ): void {
    expect(response.status).toBe(status);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const body = response.body as { error: { code: string } };

    expect(body.error.code).toBe(code);
  }

  describe('seguir e deixar de seguir', () => {
    it('CA-F12-01: PUT cria o vínculo (201) e ele aparece nas duas listagens', async () => {
      const token = await login('seg_seguidor');
      await createUser('seg_alvo');

      const created = await put(followMePath('seg_alvo'), token);

      expect(created.status).toBe(201);
      const state = followStateSchema.parse(created.body);
      expect(state).toEqual({
        username: 'seg_alvo',
        followersCount: 1,
        followingCount: 0,
        isFollowedByMe: true,
      });

      const following = followPageSchema.parse((await get(followingPath('seg_seguidor'))).body);
      expect(following.data.map((item) => item.username)).toEqual(['seg_alvo']);

      const followers = followPageSchema.parse((await get(followersPath('seg_alvo'))).body);
      expect(followers.data.map((item) => item.username)).toEqual(['seg_seguidor']);
      expect(followers.data[0]?.isFollowedByMe).toBe(false);
    });

    it('CA-F12-02: PUT repetido responde 200, não duplica e preserva o followedAt', async () => {
      const token = await login('seg_repetido');
      await createUser('seg_repetido_alvo');

      const first = await put(followMePath('seg_repetido_alvo'), token);
      expect(first.status).toBe(201);

      const before = followPageSchema.parse((await get(followingPath('seg_repetido'))).body).data[0]
        ?.followedAt;

      const repeated = await put(followMePath('seg_repetido_alvo'), token);

      expect(repeated.status).toBe(200);
      expect(followStateSchema.parse(repeated.body).isFollowedByMe).toBe(true);
      expect(await followCount()).toBe(1);

      const after = followPageSchema.parse((await get(followingPath('seg_repetido'))).body).data[0]
        ?.followedAt;
      expect(after).toBe(before);
    });

    it('CA-F12-03: seguir a si mesmo responde 409 CANNOT_FOLLOW_SELF', async () => {
      const token = await login('seg_ego');

      expectError(await put(followMePath('seg_ego'), token), 409, 'CANNOT_FOLLOW_SELF');
      expectError(await put(followMePath('SEG_EGO'), token), 409, 'CANNOT_FOLLOW_SELF');
      expect(await followCount()).toBe(0);
    });

    it('CA-F12-04: alvo inexistente responde 404 e a busca ignora maiúsculas/minúsculas', async () => {
      const token = await login('seg_caixa');
      await createUser('seg_bia');

      expectError(await put(followMePath('nao_existe'), token), 404, 'NOT_FOUND');
      expectError(await remove(followMePath('nao_existe'), token), 404, 'NOT_FOUND');

      const created = await put(followMePath('SEG_BIA'), token);

      expect(created.status).toBe(201);
      expect(followStateSchema.parse(created.body).username).toBe('seg_bia');
      expect(await prisma.follow.count({ where: { followingId: await userId('seg_bia') } })).toBe(
        1,
      );
    });

    it('CA-F12-05: DELETE remove (204), repetir responde 404 e o PUT recria', async () => {
      const token = await login('seg_remove');
      await createUser('seg_remove_alvo');

      await put(followMePath('seg_remove_alvo'), token);

      const removed = await remove(followMePath('seg_remove_alvo'), token);
      expect(removed.status).toBe(204);

      expect(
        followPageSchema.parse((await get(followingPath('seg_remove'))).body).data,
      ).toHaveLength(0);
      expect(
        followPageSchema.parse((await get(followersPath('seg_remove_alvo'))).body).data,
      ).toHaveLength(0);

      expectError(await remove(followMePath('seg_remove_alvo'), token), 404, 'NOT_FOUND');

      const recreated = await put(followMePath('seg_remove_alvo'), token);
      expect(recreated.status).toBe(201);
      expect(followStateSchema.parse(recreated.body).followersCount).toBe(1);
    });

    it('CA-F12-06: a resposta do PUT traz o estado do alvo com os contadores atualizados', async () => {
      const token = await login('seg_estado');
      await createUser('seg_estado_alvo');
      const targetId = await userId('seg_estado_alvo');

      // Um vínculo anterior: o contador devolvido precisa refletir o novo total.
      await createFollow(prisma, {
        followerId: await createUser('seg_estado_antes'),
        followingId: targetId,
      });

      const created = await put(followMePath('seg_estado_alvo'), token);

      expect(created.status).toBe(201);
      expect(followStateSchema.parse(created.body)).toEqual({
        username: 'seg_estado_alvo',
        followersCount: 2,
        followingCount: 0,
        isFollowedByMe: true,
      });

      const repeated = await put(followMePath('seg_estado_alvo'), token);

      expect(repeated.status).toBe(200);
      expect(followStateSchema.parse(repeated.body)).toEqual({
        username: 'seg_estado_alvo',
        followersCount: 2,
        followingCount: 0,
        isFollowedByMe: true,
      });
    });

    it('CA-F12-07: escrita exige sessão ativa e o papel não bloqueia as rotas', async () => {
      await createUser('seg_privado');

      expectError(await put(followMePath('seg_privado')), 401, 'UNAUTHENTICATED');
      expectError(await remove(followMePath('seg_privado')), 401, 'UNAUTHENTICATED');

      const suspended = await createTestUser({
        username: 'seg_suspenso',
        email: 'seg_suspenso@example.com',
        password: VALID_PASSWORD,
      });
      const suspendedToken = (
        await request(app.server)
          .post(testPath(AUTH_ROUTES.login))
          .send({ identifier: 'seg_suspenso', password: VALID_PASSWORD })
      ).body.accessToken as string;

      await prisma.user.update({
        where: { id: suspended.id },
        data: { status: 'SUSPENDED' },
      });

      expectError(await put(followMePath('seg_privado'), suspendedToken), 403, 'ACCOUNT_SUSPENDED');

      const adminToken = await login('seg_admin', 'ADMIN');
      const adminFollow = await put(followMePath('seg_privado'), adminToken);

      expect(adminFollow.status).toBe(201);
      expect((await remove(followMePath('seg_privado'), adminToken)).status).toBe(204);
      expect((await remove(followMePath('seg_privado'), adminToken)).status).toBe(404);
    });

    it('CA-F12-08: seguir acima de FOLLOWING_MAX responde 409 FOLLOW_LIMIT_REACHED', async () => {
      const token = await login('seg_limite');
      const followerId = await userId('seg_limite');

      // 5.000 contas e vínculos criados em lote, direto no banco (o cenário não cabe na API).
      await prisma.$executeRaw`
        INSERT INTO users (id, username, email, password_hash, role, status, created_at, updated_at)
        SELECT gen_random_uuid(), 'limite_' || g, 'limite_' || g || '@example.com', 'hash', 'PLAYER', 'ACTIVE', now(), now()
        FROM generate_series(1, ${FOLLOWING_MAX}) AS g
      `;
      await prisma.$executeRaw`
        INSERT INTO follows (id, follower_id, following_id, created_at)
        SELECT gen_random_uuid(), ${followerId}::uuid, u.id, now()
        FROM users u WHERE u.username LIKE 'limite\\_%'
      `;
      await createUser('seg_limite_alvo');

      expect(await prisma.follow.count({ where: { followerId } })).toBe(FOLLOWING_MAX);

      expectError(await put(followMePath('seg_limite_alvo'), token), 409, 'FOLLOW_LIMIT_REACHED');

      // Repetir o PUT de um vínculo existente não falha por limite (RN-F12-05).
      const repeated = await put(followMePath('limite_1'), token);
      expect(repeated.status).toBe(200);
    });
  });

  describe('leituras públicas', () => {
    it('CA-F12-09: as listagens são públicas e trazem os campos de RN-F12-09', async () => {
      const followerId = await createUser('seg_pub_seguidor');
      const targetId = await createUser('seg_pub_alvo');

      await prisma.user.update({
        where: { id: followerId },
        data: { displayName: 'Seguidor Público', avatarUrl: 'https://exemplo.com/a.png' },
      });
      await createFollow(prisma, { followerId, followingId: targetId });

      const followers = followPageSchema.parse((await get(followersPath('seg_pub_alvo'))).body);

      expect(followers.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
      expect(followers.data[0]).toEqual({
        username: 'seg_pub_seguidor',
        displayName: 'Seguidor Público',
        avatarUrl: 'https://exemplo.com/a.png',
        followedAt: expect.any(String) as unknown as string,
        isFollowedByMe: false,
      });

      const following = followPageSchema.parse((await get(followingPath('seg_pub_seguidor'))).body);
      expect(following.data.map((item) => item.username)).toEqual(['seg_pub_alvo']);
    });

    it('CA-F12-10: username sem caixa, 404 para inexistente, SUSPENDED visível e sem dados privados', async () => {
      const followerId = await createUser('seg_susp_seguidor');
      const target = await createTestUser({
        username: 'seg_susp_alvo',
        email: 'seg_susp_alvo@example.com',
        password: VALID_PASSWORD,
      });

      await prisma.user.update({ where: { id: target.id }, data: { status: 'SUSPENDED' } });
      await createFollow(prisma, { followerId, followingId: target.id });

      const upper = await get(followersPath('SEG_SUSP_ALVO'));
      expect(upper.status).toBe(200);
      expect(followPageSchema.parse(upper.body).data.map((item) => item.username)).toEqual([
        'seg_susp_seguidor',
      ]);

      expectError(await get(followersPath('nao_existe')), 404, 'NOT_FOUND');
      expectError(await get(followingPath('nao_existe')), 404, 'NOT_FOUND');

      const suspendedFollowers = followPageSchema.parse(
        (await get(followingPath('seg_susp_alvo'))).body,
      );
      expect(suspendedFollowers.data).toHaveLength(0);

      const raw = JSON.stringify(upper.body);
      expect(raw).not.toContain('seg_susp_seguidor@example.com');
      expect(raw).not.toContain('password');
      expect(raw).not.toContain('"role"');
    });

    it('CA-F12-11: ordenações e paginação seguem a SPEC', async () => {
      const targetId = await createUser('seg_ord_alvo');

      // Vínculos criados fora de ordem alfabética, com `created_at` decrescente por nome.
      const names = ['carla', 'ana', 'bruno'];

      for (const [index, name] of names.entries()) {
        const followerId = await createUser(`seg_ord_${name}`);
        await createFollow(prisma, {
          followerId,
          followingId: targetId,
          createdAt: new Date(Date.UTC(2026, 0, 1 + (names.length - index))),
        });
      }

      const recent = followPageSchema.parse((await get(followersPath('seg_ord_alvo'))).body);
      expect(recent.data.map((item) => item.username)).toEqual([
        'seg_ord_carla',
        'seg_ord_ana',
        'seg_ord_bruno',
      ]);

      const byName = followPageSchema.parse(
        (await get(followersPath('seg_ord_alvo'), undefined, { sort: 'username' })).body,
      );
      expect(byName.data.map((item) => item.username)).toEqual([
        'seg_ord_ana',
        'seg_ord_bruno',
        'seg_ord_carla',
      ]);

      const reversed = followPageSchema.parse(
        (await get(followersPath('seg_ord_alvo'), undefined, { sort: 'username', order: 'desc' }))
          .body,
      );
      expect(reversed.data.map((item) => item.username)).toEqual([
        'seg_ord_carla',
        'seg_ord_bruno',
        'seg_ord_ana',
      ]);

      expectError(
        await get(followersPath('seg_ord_alvo'), undefined, { sort: 'title' }),
        400,
        'VALIDATION_ERROR',
      );
      expectError(
        await get(followersPath('seg_ord_alvo'), undefined, { order: 'up' }),
        400,
        'VALIDATION_ERROR',
      );

      const beyond = followPageSchema.parse(
        (await get(followersPath('seg_ord_alvo'), undefined, { page: 9, pageSize: 2 })).body,
      );
      expect(beyond.data).toEqual([]);
      expect(beyond.meta).toEqual({ page: 9, pageSize: 2, total: 3, totalPages: 2 });
    });

    it('CA-F12-12: as listagens usam um número constante de consultas (sem N+1)', async () => {
      const targetId = await createUser('seg_nmais1_alvo');

      for (let index = 0; index < 12; index += 1) {
        const followerId = await createUser(`seg_nmais1_${index}`);

        await createFollow(prisma, { followerId, followingId: targetId });
      }

      queryCount = 0;
      const small = followPageSchema.parse(
        (await get(followersPath('seg_nmais1_alvo'), undefined, { pageSize: 5 })).body,
      );
      const smallCount = queryCount;

      queryCount = 0;
      const large = followPageSchema.parse(
        (await get(followersPath('seg_nmais1_alvo'), undefined, { pageSize: 12 })).body,
      );
      const largeCount = queryCount;

      expect(small.data).toHaveLength(5);
      expect(large.data).toHaveLength(12);
      expect(largeCount).toBe(smallCount);
    });

    it('CA-F12-13: as listas são direcionadas, independentes e não incluem o próprio perfil', async () => {
      const anaId = await createUser('seg_dir_ana');
      const biaId = await createUser('seg_dir_bia');

      await createFollow(prisma, { followerId: anaId, followingId: biaId });

      const biaFollowers = followPageSchema.parse((await get(followersPath('seg_dir_bia'))).body);
      expect(biaFollowers.data.map((item) => item.username)).toEqual(['seg_dir_ana']);

      const biaFollowing = followPageSchema.parse((await get(followingPath('seg_dir_bia'))).body);
      expect(biaFollowing.data).toHaveLength(0);

      const anaFollowing = followPageSchema.parse((await get(followingPath('seg_dir_ana'))).body);
      expect(anaFollowing.data.map((item) => item.username)).toEqual(['seg_dir_bia']);

      const anaFollowers = followPageSchema.parse((await get(followersPath('seg_dir_ana'))).body);
      expect(anaFollowers.data).toHaveLength(0);
    });
  });

  describe('contadores e integração com o perfil (F2)', () => {
    it('CA-F12-14: o perfil público traz contadores e isFollowedByMe conforme o solicitante', async () => {
      const anaId = await createUser('seg_perf_ana');
      await createUser('seg_perf_bia');
      const biaId = await userId('seg_perf_bia');
      const token = await login('seg_perf_carla');

      const visitor = publicProfileSchema.parse(
        (await get(`/users/${encodeURIComponent('seg_perf_ana')}`)).body,
      );
      expect(visitor).toMatchObject({
        username: 'seg_perf_ana',
        followersCount: 0,
        followingCount: 0,
        isFollowedByMe: false,
      });

      // Bia segue Ana; Carla é quem consulta.
      await createFollow(prisma, { followerId: biaId, followingId: anaId });
      await put(followMePath('seg_perf_ana'), token);

      const withViewer = publicProfileSchema.parse(
        (
          await request(app.server)
            .get(testPath(`/users/${encodeURIComponent('seg_perf_ana')}`))
            .set('Authorization', `${AUTH_SCHEME} ${token}`)
        ).body,
      );

      expect(withViewer).toMatchObject({
        followersCount: 2,
        followingCount: 0,
        isFollowedByMe: true,
      });

      // No próprio perfil o vínculo é sempre `false`.
      const own = publicProfileSchema.parse(
        (
          await request(app.server)
            .get(testPath(`/users/${encodeURIComponent('seg_perf_carla')}`))
            .set('Authorization', `${AUTH_SCHEME} ${token}`)
        ).body,
      );

      expect(own).toMatchObject({ followersCount: 0, followingCount: 1, isFollowedByMe: false });
    });

    it('CA-F12-15: o perfil próprio traz os contadores e preserva os campos da F2', async () => {
      const token = await login('seg_proprio');
      await createUser('seg_proprio_alvo');

      await put(followMePath('seg_proprio_alvo'), token);

      const profile = ownProfileSchema.parse((await get('/me/profile', token)).body);

      expect(profile).toMatchObject({
        username: 'seg_proprio',
        email: 'seg_proprio@example.com',
        role: 'PLAYER',
        bio: null,
        avatarUrl: null,
        followersCount: 0,
        followingCount: 1,
        isFollowedByMe: false,
      });
      expect(profile.createdAt).toEqual(expect.any(String) as unknown as string);
    });

    it('CA-F12-16: seguir e deixar de seguir refletem nos contadores derivados', async () => {
      const token = await login('seg_contador');
      await createUser('seg_contador_alvo');
      const targetId = await userId('seg_contador_alvo');

      await put(followMePath('seg_contador_alvo'), token);

      const afterFollow = followStateSchema.parse(
        (await put(followMePath('seg_contador_alvo'), token)).body,
      );
      expect(afterFollow).toMatchObject({ followersCount: 1, followingCount: 0 });

      const own = ownProfileSchema.parse((await get('/me/profile', token)).body);
      expect(own.followingCount).toBe(1);

      await remove(followMePath('seg_contador_alvo'), token);

      const ownAfter = ownProfileSchema.parse((await get('/me/profile', token)).body);
      expect(ownAfter.followingCount).toBe(0);

      const target = publicProfileSchema.parse(
        (await get(`/users/${encodeURIComponent('seg_contador_alvo')}`)).body,
      );
      expect(target.followersCount).toBe(0);
      expect(await prisma.follow.count({ where: { followingId: targetId } })).toBe(0);
    });
  });

  describe('cascatas e independência', () => {
    it('CA-F12-17: excluir a conta remove os vínculos nos dois sentidos', async () => {
      const token = await login('seg_excluir');
      const otherId = await createUser('seg_excluir_outro');
      const meId = await userId('seg_excluir');

      await put(followMePath('seg_excluir_outro'), token);
      await createFollow(prisma, { followerId: otherId, followingId: meId });
      expect(await followCount()).toBe(2);

      const deleted = await remove('/me', token, { password: VALID_PASSWORD });

      expect(deleted.status).toBe(204);
      expect(await followCount()).toBe(0);

      const others = followPageSchema.parse((await get(followingPath('seg_excluir_outro'))).body);
      expect(others.data).toHaveLength(0);
      expect(others.meta.total).toBe(0);
    });

    it('CA-F12-18: seguir não cria nem altera diário, resenhas e listas', async () => {
      const token = await login('seg_indep');
      await createUser('seg_indep_alvo');
      await createGame(prisma, { slug: 'seg-jogo', title: 'Jogo do Seguimento' });

      const log = await put('/me/games/seg-jogo', token, { status: 'PLAYING' });
      expect(log.status).toBe(201);

      const list = await request(app.server)
        .post(testPath('/me/lists'))
        .set('Authorization', `${AUTH_SCHEME} ${token}`)
        .send({ title: 'Minha lista' });
      expect(list.status).toBe(201);

      const review = await put('/me/reviews/seg-jogo', token, { title: 'Bom', body: 'Muito bom.' });
      expect(review.status).toBe(201);

      await put(followMePath('seg_indep_alvo'), token);

      expect(await prisma.gameLog.count()).toBe(1);
      expect(await prisma.gameList.count()).toBe(1);
      expect(await prisma.review.count()).toBe(1);

      await remove(followMePath('seg_indep_alvo'), token);

      expect(await prisma.gameLog.count()).toBe(1);
      expect(await prisma.gameList.count()).toBe(1);
      expect(await prisma.review.count()).toBe(1);
    });
  });
});
