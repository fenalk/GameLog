-- Etapa 4 (F11 — criação e gerenciamento de listas, seção 1 da SPEC F11).
--
-- Cria as listas de jogos e seus itens: uma lista por dono, com título, descrição e
-- visibilidade (padrão `PUBLIC`), e itens com posição densa (mantida pelo serviço) e nota
-- opcional. O `UNIQUE (list_id, game_id)` garante que um jogo apareça no máximo uma vez
-- por lista. As cascatas refletem a RN-F11-18: excluir a conta remove as listas (e seus
-- itens) e excluir o jogo remove os itens vinculados, mantendo as listas.

-- CreateEnum
CREATE TYPE "ListVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateTable
CREATE TABLE "game_lists" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "visibility" "ListVisibility" NOT NULL DEFAULT 'PUBLIC',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "game_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_list_items" (
    "id" UUID NOT NULL,
    "list_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "note" VARCHAR(280),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "game_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_lists_user_id_updated_at_idx" ON "game_lists"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "game_lists_visibility_idx" ON "game_lists"("visibility");

-- CreateIndex
CREATE INDEX "game_list_items_list_id_position_idx" ON "game_list_items"("list_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "game_list_items_list_id_game_id_key" ON "game_list_items"("list_id", "game_id");

-- AddForeignKey
ALTER TABLE "game_lists" ADD CONSTRAINT "game_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_list_items" ADD CONSTRAINT "game_list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "game_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_list_items" ADD CONSTRAINT "game_list_items_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
