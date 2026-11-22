-- No names, phone numbers, Aadhaar numbers or face/eye images are stored. Ever.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  device_id TEXT,
  age INTEGER NOT NULL,
  sex TEXT NOT NULL,
  pregnant INTEGER NOT NULL DEFAULT 0,
  lang TEXT NOT NULL DEFAULT 'hi',
  simulated INTEGER NOT NULL DEFAULT 0,
  hospital_id TEXT
);
CREATE INDEX idx_sessions_created ON sessions(created_at);

CREATE TABLE measurements (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  data_json TEXT NOT NULL,
  quality REAL,
  model_version TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (session_id, module)
);

CREATE TABLE triage (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  priority TEXT NOT NULL,
  department TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE hospitals (
  id TEXT PRIMARY KEY,
  name_hi TEXT NOT NULL,
  name_en TEXT NOT NULL,
  district TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL REFERENCES hospitals(id),
  code TEXT NOT NULL,
  avg_consult_min REAL NOT NULL DEFAULT 6,
  UNIQUE (hospital_id, code)
);

CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL REFERENCES departments(id),
  number INTEGER NOT NULL,
  day TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at INTEGER NOT NULL,
  called_at INTEGER,
  consult_start INTEGER,
  consult_end INTEGER,
  simulated INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT UNIQUE
);
CREATE INDEX idx_tokens_dept_day ON tokens(department_id, day, status);

CREATE TABLE doctor_notes (
  token_id TEXT PRIMARY KEY REFERENCES tokens(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  history_prefilled_useful INTEGER
);

CREATE TABLE thali_scans (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  items_json TEXT NOT NULL,
  totals_json TEXT NOT NULL,
  flags_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  rating INTEGER NOT NULL,
  would_use INTEGER NOT NULL,
  last_opd_wait_min INTEGER,
  comment TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL REFERENCES hospitals(id),
  role TEXT NOT NULL,
  pin_hash TEXT NOT NULL
);

CREATE TABLE ai_calls (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_ai_calls_created ON ai_calls(created_at);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
