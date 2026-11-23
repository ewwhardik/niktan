-- Who did what to which visit, kept for 180 days for DPDP accountability. No PINs, notes or
-- patient details are written here. token_id has no foreign key so the trail outlives the visit.
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  staff_id TEXT,
  hospital_id TEXT NOT NULL,
  action TEXT NOT NULL,
  token_id TEXT,
  detail TEXT
);
CREATE INDEX idx_audit_hospital_at ON audit_log(hospital_id, at);
CREATE INDEX idx_audit_at ON audit_log(at);
