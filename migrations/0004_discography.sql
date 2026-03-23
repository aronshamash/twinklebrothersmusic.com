CREATE TABLE IF NOT EXISTS discography_releases (
  id           INTEGER PRIMARY KEY,  -- Discogs release/master ID
  master_id    INTEGER,
  title        TEXT NOT NULL,
  year         INTEGER,
  label        TEXT,
  thumb        TEXT,                 -- Discogs thumbnail URL
  format       TEXT,
  release_type TEXT NOT NULL,        -- 'master' | 'release'
  synced_at    TEXT NOT NULL         -- ISO 8601 timestamp
);

CREATE TABLE IF NOT EXISTS discography_image_overrides (
  release_id  INTEGER PRIMARY KEY,   -- references discography_releases.id
  image_url   TEXT NOT NULL,         -- any URL: R2, CDN, or external
  updated_at  TEXT NOT NULL
);
