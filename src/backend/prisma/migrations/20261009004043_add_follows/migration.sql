-- Etapa 5 (F12 — seguimento de outros jogadores, seção 1 da SPEC F12).
--
-- Cria a relação direcionada seguidor→seguido entre usuários. O
-- `UNIQUE (follower_id, following_id)` garante que cada jogador siga outro no máximo uma
-- vez (PUT idempotente, RN-F12-04) e o `CHECK` barra o autosseguimento como rede de
-- segurança da RN-F12-02 (o serviço responde 409 CANNOT_FOLLOW_SELF). As cascatas refletem
-- a RN-F12-11: excluir a conta remove os vínculos criados e os que apontam para ela. Os
-- índices cobrem as duas listagens ordenadas por `created_at` (RN-F12-08) e os contadores
-- do perfil são derivados na leitura, sem coluna desnormalizada (RN-F12-06).

-- CreateTable
CREATE TABLE "follows" (
    "id" UUID NOT NULL,
    "follower_id" UUID NOT NULL,
    "following_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follows_following_id_created_at_idx" ON "follows"("following_id", "created_at");

-- CreateIndex
CREATE INDEX "follows_follower_id_created_at_idx" ON "follows"("follower_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "follows_follower_id_following_id_key" ON "follows"("follower_id", "following_id");

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Autosseguimento barrado no banco (RN-F12-02): rede de segurança da regra do serviço.
ALTER TABLE "follows" ADD CONSTRAINT "follows_no_self_follow_check" CHECK ("follower_id" <> "following_id");
