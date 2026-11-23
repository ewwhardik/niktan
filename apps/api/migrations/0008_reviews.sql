-- Team reviews collected at the event and shown on the home page. No personal data: a team name,
-- star ratings and a short remark. `hidden` lets a reviewer be taken down without losing the row.
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  team TEXT NOT NULL,
  overall INTEGER NOT NULL CHECK (overall BETWEEN 1 AND 5),
  ratings_json TEXT NOT NULL,
  tried_json TEXT NOT NULL DEFAULT '[]',
  remark TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_reviews_created ON reviews(created_at);
