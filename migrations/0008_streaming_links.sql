CREATE TABLE IF NOT EXISTS discography_streaming_links (
  release_id        INTEGER PRIMARY KEY,  -- references discography_releases.id
  spotify_url       TEXT,
  youtube_music_url TEXT,
  updated_at        TEXT NOT NULL
);
