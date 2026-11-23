ALTER TABLE sessions ADD COLUMN creation_key TEXT;
CREATE UNIQUE INDEX idx_sessions_creation_key ON sessions(creation_key);
