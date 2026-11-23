-- A citizen joining a demo hospital's queue may choose to show the visit (age, sex and screening
-- results only, never a name) on the public demo board, so a judge can follow their own phone scan.
ALTER TABLE tokens ADD COLUMN demo_visible INTEGER NOT NULL DEFAULT 0;
