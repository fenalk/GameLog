-- Etapa 3 (F8 — registro de jogos jogados, seção 1 da SPEC F8).
--
-- Cria o diário: um registro por par jogador↔jogo (`UNIQUE (user_id, game_id)`),
-- com status, datas, tempo jogado e plataforma opcional. As cascatas refletem a
-- RN-F8-12: excluir a conta ou o jogo remove os registros; excluir a plataforma apenas
-- desvincula (`SET NULL`), sem remover o registro do diário.

-- CreateEnum
CREATE TYPE "GameLogStatus" AS ENUM ('PLAYING', 'COMPLETED', 'ON_HOLD', 'DROPPED', 'BACKLOG');

-- CreateTable
CREATE TABLE "game_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "status" "GameLogStatus" NOT NULL,
    "started_at" DATE,
    "finished_at" DATE,
    "playtime_minutes" INTEGER,
    "platform_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "game_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_logs_user_id_updated_at_idx" ON "game_logs"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "game_logs_game_id_idx" ON "game_logs"("game_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_logs_user_id_game_id_key" ON "game_logs"("user_id", "game_id");

-- AddForeignKey
ALTER TABLE "game_logs" ADD CONSTRAINT "game_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_logs" ADD CONSTRAINT "game_logs_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_logs" ADD CONSTRAINT "game_logs_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
