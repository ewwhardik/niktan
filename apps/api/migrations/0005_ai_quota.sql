CREATE INDEX idx_ai_calls_error_created ON ai_calls(error, created_at) WHERE error IS NOT NULL;
