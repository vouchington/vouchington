-- Pre-launch Hacker News reference facts per URL. Neutral facts only: item ids, counts and dates.
-- No comment text is stored and nothing here feeds ranking or trust. Rows are capped per URL by
-- the writer and are removed with the URL.
-- A zero-hit lookup still records its time; readers and the filter use the counts.
CREATE TABLE IF NOT EXISTS url_hacker_news_totals (
  url_id UUID PRIMARY KEY REFERENCES urls(id) ON DELETE CASCADE,
  story_count INTEGER NOT NULL DEFAULT 0 CHECK (story_count >= 0),
  comment_count INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  looked_up_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS url_hacker_news_stories (
  url_id UUID NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
  hacker_news_item_id BIGINT NOT NULL CHECK (hacker_news_item_id > 0),
  points INTEGER NOT NULL CHECK (points >= 0),
  reply_count INTEGER NOT NULL CHECK (reply_count >= 0),
  posted_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (url_id, hacker_news_item_id)
);

CREATE TABLE IF NOT EXISTS url_hacker_news_comments (
  url_id UUID NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
  hacker_news_item_id BIGINT NOT NULL CHECK (hacker_news_item_id > 0),
  parent_story_item_id BIGINT NOT NULL CHECK (parent_story_item_id > 0),
  posted_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (url_id, hacker_news_item_id)
);

COMMENT ON TABLE url_hacker_news_totals IS 'Per-URL totals of Hacker News stories and comments that link the URL, with the time of the last lookup. Facts only; never a ranking or trust input.';
COMMENT ON COLUMN url_hacker_news_totals.url_id IS 'The URL these totals describe. Removed with the URL.';
COMMENT ON COLUMN url_hacker_news_totals.story_count IS 'Total Hacker News stories linking the URL, including stories beyond the capped stored rows.';
COMMENT ON COLUMN url_hacker_news_totals.comment_count IS 'Total Hacker News comments linking the URL, including comments beyond the capped stored rows.';
COMMENT ON COLUMN url_hacker_news_totals.looked_up_at IS 'When the totals and stored rows were last refreshed from Hacker News search, including lookups with zero hits.';

COMMENT ON TABLE url_hacker_news_stories IS 'Capped Hacker News stories that link a URL: item id, points, reply count and posted time. No titles or text.';
COMMENT ON COLUMN url_hacker_news_stories.url_id IS 'The URL the story links. Removed with the URL.';
COMMENT ON COLUMN url_hacker_news_stories.hacker_news_item_id IS 'Hacker News item id of the story; an outside identifier with no row here.';
COMMENT ON COLUMN url_hacker_news_stories.points IS 'Story points when last looked up.';
COMMENT ON COLUMN url_hacker_news_stories.reply_count IS 'Number of replies on the story thread when last looked up; not the number of comments that mention the URL.';
COMMENT ON COLUMN url_hacker_news_stories.posted_at IS 'When the story was posted on Hacker News.';

COMMENT ON TABLE url_hacker_news_comments IS 'Capped Hacker News comments that link a URL: item id, parent story id and posted time. No comment text, and no points because Hacker News publishes none.';
COMMENT ON COLUMN url_hacker_news_comments.url_id IS 'The URL the comment links. Removed with the URL.';
COMMENT ON COLUMN url_hacker_news_comments.hacker_news_item_id IS 'Hacker News item id of the comment; an outside identifier with no row here.';
COMMENT ON COLUMN url_hacker_news_comments.parent_story_item_id IS 'Hacker News item id of the story whose thread holds the comment; an outside identifier that may not link the URL itself.';
COMMENT ON COLUMN url_hacker_news_comments.posted_at IS 'When the comment was posted on Hacker News.';

-- Partial indexes support bounded post and feed searches with the reference filter.
CREATE INDEX IF NOT EXISTS idx_posts__hacker_news_references__id
  ON posts (id DESC)
  WHERE has_hacker_news_references AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_posts__hacker_news_references__votes_score_sort__id
  ON posts (votes_score_sort DESC, id DESC)
  WHERE has_hacker_news_references AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rss_feed_items__hacker_news_references__published_at__id
  ON rss_feed_items (published_at DESC, id DESC)
  WHERE has_hacker_news_references AND deleted_at IS NULL;
