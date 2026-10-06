-- Etapa 2 (F5 — gerenciamento de gênero, seção 1 da SPEC F5).
--
-- Acrescenta o nome normalizado (unicidade sem diferenciar caixa/acentos, RN-F5-02) e as
-- colunas de auditoria exibidas na administração. O backfill usa a extensão `unaccent`,
-- criada na migration da F3 (20261006155344_add_catalog), e preserva os dados existentes;
-- a restrição NOT NULL só é aplicada depois do preenchimento.

ALTER TABLE "genres" ADD COLUMN "name_normalized" VARCHAR(50);
ALTER TABLE "genres" ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "genres" ADD COLUMN "updated_at" TIMESTAMPTZ(3);

-- Equivalente ao helper normalizeTaxonomyName (trim + espaços colapsados + minúsculas +
-- remoção de acentos) para os registros já existentes; `updated_at` é preenchido na mesma
-- passagem (o Prisma Schema não define default para a coluna, que é mantida pelo cliente).
UPDATE "genres"
SET "name_normalized" = lower(regexp_replace(btrim(unaccent("name")), '\s+', ' ', 'g')),
    "updated_at" = CURRENT_TIMESTAMP;

ALTER TABLE "genres" ALTER COLUMN "name_normalized" SET NOT NULL;
ALTER TABLE "genres" ALTER COLUMN "updated_at" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_normalized_key" ON "genres"("name_normalized");
