CREATE TABLE IF NOT EXISTS discography_release_overrides (
  release_id           INTEGER PRIMARY KEY, -- ID stored in discography_releases (the list page link)
  preferred_release_id INTEGER NOT NULL,    -- Discogs release ID to use for detail page fetch
  updated_at           TEXT NOT NULL
);
