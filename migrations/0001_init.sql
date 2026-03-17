CREATE TABLE images (
  id          TEXT PRIMARY KEY,
  r2_key      TEXT NOT NULL,
  type        TEXT DEFAULT 'photo',
  taken_at    DATE,
  caption     TEXT,
  credit      TEXT,
  location    TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE people (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  musician_id TEXT
);

CREATE TABLE image_people (
  image_id  TEXT NOT NULL,
  person_id TEXT NOT NULL,
  PRIMARY KEY (image_id, person_id)
);

CREATE TABLE places (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  country TEXT
);

CREATE TABLE image_places (
  image_id TEXT NOT NULL,
  place_id TEXT NOT NULL,
  PRIMARY KEY (image_id, place_id)
);

CREATE TABLE musicians (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,
  bio          TEXT,
  role         TEXT,
  years_active TEXT,
  photo_r2_key TEXT
);
