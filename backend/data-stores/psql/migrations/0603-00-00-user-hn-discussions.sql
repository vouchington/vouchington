ALTER TABLE users
ADD COLUMN IF NOT EXISTS hn_discussions BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.hn_discussions IS 'When TRUE, related Hacker News threads are fetched for linked URLs on post and article pages.';
