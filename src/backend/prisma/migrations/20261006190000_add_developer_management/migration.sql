-- Etapa 2 (F7 — gerenciamento de desenvolvedora, seção 1 da SPEC F7).
--
-- Acrescenta o nome normalizado (unicidade sem diferenciar caixa/acentos, RN-F7-02) e as
-- colunas de auditoria exibidas na administração. O backfill usa a extensão `unaccent`,
-- criada na migration da F3 (20261006155344_add_catalog), e preserva os dados existentes;
-- as restrições NOT NULL e de unicidade só são aplicadas depois do preenchimento.

ALTER TABLE "developers" ADD COLUMN "name_normalized" VARCHAR(100);
ALTER TABLE "developers" ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "developers" ADD COLUMN "updated_at" TIMESTAMPTZ(3);

-- Equivalente ao helper normalizeTaxonomyName (trim + espaços colapsados + minúsculas +
-- remoção de acentos) para os registros já existentes; `updated_at` é preenchido na mesma
-- passagem (o Prisma Schema não define default para a coluna, que é mantida pelo cliente).
UPDATE "developers"
SET "name_normalized" = lower(regexp_replace(btrim(unaccent("name")), '\s+', ' ', 'g')),
    "updated_at" = CURRENT_TIMESTAMP;

ALTER TABLE "developers" ALTER COLUMN "name_normalized" SET NOT NULL;
ALTER TABLE "developers" ALTER COLUMN "updated_at" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "developers_name_normalized_key" ON "developers"("name_normalized");
