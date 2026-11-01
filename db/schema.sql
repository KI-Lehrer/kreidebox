-- Kreidebox: eigene Tabellen (die Login-Tabellen legt Better Auth an, siehe scripts/migrate.mjs).
-- Ein Deck gehört genau einer Person. Namen von Schülern werden nie gespeichert (siehe api/_lib/privacy.js).
CREATE TABLE IF NOT EXISTS kb_decks (
  id          text        NOT NULL,
  user_id     text        NOT NULL,
  name        text        NOT NULL,
  data        jsonb       NOT NULL,
  rev         integer     NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS kb_decks_user_updated ON kb_decks (user_id, updated_at DESC);
