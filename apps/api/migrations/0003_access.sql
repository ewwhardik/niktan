-- Public staff accounts can work only with simulated visits. Additional staff accounts are private.
ALTER TABLE staff ADD COLUMN demo_only INTEGER NOT NULL DEFAULT 0;
UPDATE staff SET demo_only = 1 WHERE id IN
  ('demo-dh-nurse','demo-dh-doctor','demo-dh-admin','demo-chc-nurse','demo-chc-doctor','demo-chc-admin');

-- Owner handles, shared read-only handles and staff token IDs serve different audiences.
ALTER TABLE sessions ADD COLUMN share_id TEXT;
CREATE UNIQUE INDEX idx_sessions_share ON sessions(share_id) WHERE share_id IS NOT NULL;
ALTER TABLE tokens ADD COLUMN citizen_id TEXT;
CREATE UNIQUE INDEX idx_tokens_citizen ON tokens(citizen_id) WHERE citizen_id IS NOT NULL;
CREATE INDEX idx_tokens_session_day ON tokens(session_id,day,status);
CREATE UNIQUE INDEX idx_staff_pin ON staff(hospital_id, pin_hash);
