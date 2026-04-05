CREATE TABLE IF NOT EXISTS ai_config (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT DEFAULT '' CHECK(provider IN ('','openai','anthropic','ollama','custom')),
  api_key_encrypted TEXT DEFAULT '',
  model TEXT DEFAULT '',
  base_url TEXT DEFAULT '',
  enabled INTEGER DEFAULT 0
);
