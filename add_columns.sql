-- Adicionar colunas faltantes na tabela memorial_config
ALTER TABLE memorial_config ADD COLUMN IF NOT EXISTS bio text default '';
ALTER TABLE memorial_config ADD COLUMN IF NOT EXISTS ambient_music text default '';
