-- Seed initial publisher type relations for known RSS feed source topics.

WITH seed_relations(source_slug, publisher_slug) AS (
  VALUES
    ('hacker-news-news-ycombinator-com-rss', 'aggregator'),
    ('reddit', 'aggregator'),
    ('lobsters', 'aggregator'),
    ('slashdot', 'aggregator'),
    ('stack-overflow', 'forum'),
    ('devto-dev-to-feed', 'blog'),
    ('simon-willisons-weblog-simonwillison-net-atom-everything', 'blog'),
    ('grafana-blog-grafana-com-blog-index-xml', 'blog'),
    ('aws-blog-aws-amazon-com-blogs-aws-feed', 'blog'),
    ('cloudflare-blog-blog-cloudflare-com-rss', 'blog'),
    ('digitalocean-blog-digitalocean-com-blog-atom', 'blog'),
    ('flyio-blog-fly-io-blog-feed-xml', 'blog'),
    ('planetscale-blog-planetscale-com-blog-feed-atom', 'blog'),
    ('neon-blog-neon-com-blog-rss-xml', 'blog'),
    ('github-blog-github-blog-feed', 'blog'),
    ('jetbrains-blog-blog-jetbrains-com-feed', 'blog'),
    ('sentry-blog-blog-sentry-io-feed-xml', 'blog'),
    ('medium', 'ugc-platform'),
    ('youtube', 'ugc-platform'),
    ('substack', 'ugc-platform'),
    ('the-verge-theverge-com-rss-index-xml', 'mainstream-media'),
    ('the-verge-hardware', 'mainstream-media'),
    ('the-verge-cars', 'mainstream-media'),
    ('techcrunch-techcrunch-com-feed', 'mainstream-media'),
    ('techcrunch-ai', 'mainstream-media'),
    ('ars-technica-feeds-arstechnica-com-arstechnica-index', 'mainstream-media'),
    ('ars-technica-hardware', 'mainstream-media'),
    ('ars-technica-cars', 'mainstream-media'),
    ('wired-wired-com-feed-rss', 'mainstream-media'),
    ('cnet-cnet-com-rss-news', 'mainstream-media'),
    ('engadget-engadget-com-rss-xml', 'mainstream-media'),
    ('gizmodo-gizmodo-com-feed', 'mainstream-media'),
    ('the-points-guy-thepointsguy-com-feed', 'mainstream-media'),
    ('the-points-guy-travel', 'mainstream-media'),
    ('doctor-of-credit-doctorofcredit-com-feed', 'blog'),
    ('nerdwallet-nerdwallet-com-blog-feed', 'mainstream-media'),
    ('eye-of-the-flyer-eyeoftheflyer-com-feed', 'blog'),
    ('toyota-newsroom-pressroom-toyota-com-feed', 'corporate-media'),
    ('nvidia-blog-blogs-nvidia-com-feed', 'corporate-media'),
    ('google-deepmind-blog-deepmind-google-blog-rss-xml', 'corporate-media'),
    ('hugging-face-blog-huggingface-co-blog-feed-xml', 'corporate-media'),
    ('replit-blog-blog-replit-com-feed-xml', 'corporate-media'),
    ('replicate-blog-replicate-com-blog-rss', 'corporate-media'),
    ('car-and-driver-caranddriver-com-rss-all-xml', 'mainstream-media'),
    ('edmunds-edmunds-com-feeds-rss-articles-xml', 'mainstream-media'),
    ('jalopnik-jalopnik-com-feed', 'mainstream-media'),
    ('kelley-blue-book-mediaroom-kbb-com-press-releases-pagetemplate-rss', 'mainstream-media'),
    ('the-drive-thedrive-com-feed', 'mainstream-media')
)
INSERT INTO relation__topic__publisher_type__topic (
  subject_id,
  object_id,
  votes_count_up,
  votes_score_up
)
SELECT source_topics.id, publisher_topics.id, 1, 1
FROM seed_relations
JOIN topics source_topics
  ON source_topics.slug = seed_relations.source_slug
  AND source_topics.deleted_at IS NULL
JOIN topics publisher_topics
  ON publisher_topics.slug = seed_relations.publisher_slug
  AND publisher_topics.deleted_at IS NULL
ON CONFLICT (subject_id, object_id) DO UPDATE SET
  votes_count_up = GREATEST(
    relation__topic__publisher_type__topic.votes_count_up,
    EXCLUDED.votes_count_up
  ),
  votes_score_up = GREATEST(
    relation__topic__publisher_type__topic.votes_score_up,
    EXCLUDED.votes_score_up
  ),
  deleted_at = NULL,
  deleted_by_id = NULL;
