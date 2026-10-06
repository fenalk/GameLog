-- Baseline da Etapa 0 (Fundação do projeto).
--
-- Nenhuma entidade de negócio é criada aqui: os modelos de domínio serão adicionados
-- pelas migrations de cada funcionalidade (F1–F15), conforme as SPECs correspondentes.
-- Esta migration existe para validar o versionamento e a aplicação das migrations
-- (prisma migrate deploy) e o acesso da API ao PostgreSQL.
SELECT 1;
