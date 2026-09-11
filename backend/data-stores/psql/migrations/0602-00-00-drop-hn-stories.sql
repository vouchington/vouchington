-- Drop cached Hacker News ingest. Related threads are fetched on demand from
-- the HN Algolia API in the client, so this table is unused.
-- squawk-ignore ban-drop-table
DROP TABLE IF EXISTS hn_stories;
