import type { TransactionQuery } from '@data-stores/psql'

async function seedPlaywrightPostFeedFixtures(query: TransactionQuery): Promise<void> {
  await query(
    `INSERT INTO topics (id, topic_type, name, slug, markdown, bedrock_nova_multimodal_v1_content_sha256) VALUES ( '019c64e6-f8a0-7000-a000-000000000001', 'card', 'Test News Source', 'test-news-source', 'A test news source for Playwright tests', decode('00000000000000000000000000000000000000000000000000000000000000e1', 'hex') ) ON CONFLICT (id) DO UPDATE SET topic_type = EXCLUDED.topic_type, name = EXCLUDED.name, slug = EXCLUDED.slug, markdown = EXCLUDED.markdown, bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256`,
  )
  await query(
    `INSERT INTO urls (id, url, hostname_id, pathname, search_params) VALUES ('019c64e6-f8b0-7000-b000-000000000001', 'https://example.com/feed.xml', '019c64e6-1000-7000-b000-000000000001', '/feed.xml', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000002', 'https://example.com', '019c64e6-1000-7000-b000-000000000001', '/', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000003', 'https://example.com/article1', '019c64e6-1000-7000-b000-000000000001', '/article1', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000004', 'https://example.com/article2', '019c64e6-1000-7000-b000-000000000001', '/article2', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000005', 'https://example.com/podcast-ep-1', '019c64e6-1000-7000-b000-000000000001', '/podcast-ep-1', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000006', 'https://example.com/video-1', '019c64e6-1000-7000-b000-000000000001', '/video-1', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000007', 'https://example.com/modal-story-primary', '019c64e6-1000-7000-b000-000000000001', '/modal-story-primary', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000008', 'https://example.com/modal-story-related', '019c64e6-1000-7000-b000-000000000001', '/modal-story-related', '{}'::JSONB) ON CONFLICT (url) DO NOTHING`,
  )
  await query(
    `INSERT INTO rss_feeds (id, rss_feed_url_id, topic_id, title) VALUES ( '019c64e6-f8c0-7000-8000-000000000001', '019c64e6-f8b0-7000-b000-000000000001', '019c64e6-f8a0-7000-a000-000000000001', 'Test News Source Feed' ) ON CONFLICT (rss_feed_url_id) WHERE deleted_at IS NULL DO UPDATE SET id = EXCLUDED.id, topic_id = EXCLUDED.topic_id, title = EXCLUDED.title, deleted_at = NULL`,
  )
  await query(
    `DELETE FROM rss_feed_enablement_changes WHERE rss_feed_id = '019c64e6-f8c0-7000-8000-000000000001'`,
  )
  await query(
    `INSERT INTO rss_feed_enablement_changes (rss_feed_id, enabled, reason) VALUES ('019c64e6-f8c0-7000-8000-000000000001', TRUE, 'playwright seed current state')`,
  )
  await query(
    `DELETE FROM rss_feed_discoverability_changes WHERE rss_feed_id = '019c64e6-f8c0-7000-8000-000000000001'`,
  )
  await query(
    `INSERT INTO rss_feed_discoverability_changes (rss_feed_id, enabled, reason) VALUES ('019c64e6-f8c0-7000-8000-000000000001', TRUE, 'playwright seed current state')`,
  )
  await query(
    `INSERT INTO rss_feed_item_ids (url_hostname_id, guid) VALUES ('019c64e6-1000-7000-b000-000000000001', 'test-item-1'), ('019c64e6-1000-7000-b000-000000000001', 'test-item-2'), ('019c64e6-1000-7000-b000-000000000001', 'modal-story-primary'), ('019c64e6-1000-7000-b000-000000000001', 'modal-story-related') ON CONFLICT (url_hostname_id, guid) DO NOTHING`,
  )
  await query(
    `WITH seeded(url_hostname_id, guid, url_id, data, content_sha256) AS (VALUES ('019c64e6-1000-7000-b000-000000000001'::UUID, 'test-item-1'::TEXT, '019c64e6-f8b0-7000-b000-000000000003'::UUID, '{"title": "Test News Article 1", "link": "https://example.com/article1", "guid": "test-item-1", "isoDate": "2025-01-01T00:00:00Z", "contentSnippet": "This is a test news article for Playwright testing."}'::JSONB, decode('00000000000000000000000000000000000000000000000000000000000000f5', 'hex')), ('019c64e6-1000-7000-b000-000000000001'::UUID, 'test-item-2'::TEXT, '019c64e6-f8b0-7000-b000-000000000004'::UUID, '{"title": "Test News Article 2", "link": "https://example.com/article2", "guid": "test-item-2", "isoDate": "2025-01-02T00:00:00Z", "contentSnippet": "This is another test news article for Playwright testing."}'::JSONB, decode('00000000000000000000000000000000000000000000000000000000000000f6', 'hex')), ('019c64e6-1000-7000-b000-000000000001'::UUID, 'modal-story-primary'::TEXT, '019c64e6-f8b0-7000-b000-000000000007'::UUID, '{"title": "Playwright Modal Story Primary", "link": "https://example.com/modal-story-primary", "guid": "modal-story-primary", "isoDate": "2099-01-01T00:00:00Z", "contentSnippet": "Primary story item for modal navigation regression testing.", "content": "<p>Safe modal article body.</p><script>unsafe()</script><a href=javascript:unsafe() onclick=unsafe()>unsafe link</a>"}'::JSONB, decode('00000000000000000000000000000000000000000000000000000000000000f9', 'hex')), ('019c64e6-1000-7000-b000-000000000001'::UUID, 'modal-story-related'::TEXT, '019c64e6-f8b0-7000-b000-000000000008'::UUID, '{"title": "Playwright Modal Story Related", "link": "https://example.com/modal-story-related", "guid": "modal-story-related", "isoDate": "2099-01-01T00:00:00Z", "contentSnippet": "Related story item for modal navigation regression testing."}'::JSONB, decode('00000000000000000000000000000000000000000000000000000000000000fa', 'hex'))) INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256) SELECT identity.id, seeded.url_id, seeded.data, seeded.content_sha256 FROM seeded JOIN rss_feed_item_ids identity USING (url_hostname_id, guid) ON CONFLICT (id) DO UPDATE SET url_id = EXCLUDED.url_id, data = EXCLUDED.data, bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256, deleted_at = NULL`,
  )
  await query(
    `INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at) SELECT '019c64e6-f8c0-7000-8000-000000000001', ids.id, items.published_at FROM rss_feed_item_ids ids LEFT JOIN rss_feed_items items ON items.id = ids.id WHERE ids.url_hostname_id = '019c64e6-1000-7000-b000-000000000001' AND ids.guid IN ('test-item-1', 'test-item-2', 'modal-story-primary', 'modal-story-related') ON CONFLICT DO NOTHING`,
  )
  await query(
    `WITH primary_item AS ( SELECT id FROM rss_feed_item_ids WHERE url_hostname_id = '019c64e6-1000-7000-b000-000000000001' AND guid = 'modal-story-primary' LIMIT 1 ) INSERT INTO stories (id, title, published_at, cluster_reason, official_rss_feed_item_id) SELECT '019c64e6-f8d0-7000-9000-000000000001', 'Playwright Modal Story', '2099-01-01T00:00:00Z', 'Seeded cluster for modal navigation regression tests', primary_item.id FROM primary_item ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, published_at = EXCLUDED.published_at, cluster_reason = EXCLUDED.cluster_reason, official_rss_feed_item_id = EXCLUDED.official_rss_feed_item_id`,
  )
  await query(
    `UPDATE rss_feed_items SET story_id = '019c64e6-f8d0-7000-9000-000000000001' WHERE id IN (SELECT id FROM rss_feed_item_ids WHERE url_hostname_id = '019c64e6-1000-7000-b000-000000000001' AND guid IN ('modal-story-primary', 'modal-story-related'))`,
  )
  await query(
    `INSERT INTO rss_feed_item_ids (url_hostname_id, guid) VALUES ('019c64e6-1000-7000-b000-000000000001', 'test-podcast-1'), ('019c64e6-1000-7000-b000-000000000001', 'test-video-1') ON CONFLICT (url_hostname_id, guid) DO NOTHING`,
  )
  await query(
    `WITH seeded(url_hostname_id, guid, url_id, data, content_sha256, media_type, enclosure_url, enclosure_type, enclosure_length, duration_seconds, thumbnail_url, video_id, video_platform) AS (VALUES ('019c64e6-1000-7000-b000-000000000001'::UUID, 'test-podcast-1'::TEXT, '019c64e6-f8b0-7000-b000-000000000005'::UUID, '{"title": "Test Podcast Episode 1", "link": "https://example.com/podcast-ep-1", "guid": "test-podcast-1", "isoDate": "2025-01-03T00:00:00Z", "media_type": "audio", "enclosure_url": "https://example.com/podcast-ep-1.mp3", "enclosure_type": "audio/mpeg", "enclosure_length": 50000000, "duration_seconds": 1830, "contentSnippet": "A test podcast episode for Playwright testing."}'::JSONB, decode('00000000000000000000000000000000000000000000000000000000000000f7', 'hex'), 'audio'::rss_feed_item_media_types, 'https://example.com/podcast-ep-1.mp3'::TEXT, 'audio/mpeg'::TEXT, 50000000::BIGINT, 1830::INTEGER, NULL::TEXT, NULL::TEXT, NULL::TEXT), ('019c64e6-1000-7000-b000-000000000001'::UUID, 'test-video-1'::TEXT, '019c64e6-f8b0-7000-b000-000000000006'::UUID, '{"title": "Test YouTube Video 1", "link": "https://example.com/video-1", "guid": "test-video-1", "isoDate": "2025-01-04T00:00:00Z", "media_type": "video", "video_platform": "youtube", "video_id": "dQw4w9WgXcQ", "contentSnippet": "A test YouTube video for Playwright testing."}'::JSONB, decode('00000000000000000000000000000000000000000000000000000000000000f8', 'hex'), 'video'::rss_feed_item_media_types, NULL::TEXT, NULL::TEXT, NULL::BIGINT, NULL::INTEGER, NULL::TEXT, 'dQw4w9WgXcQ'::TEXT, 'youtube'::TEXT)) INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256, media_type, enclosure_url, enclosure_type, enclosure_length, duration_seconds, thumbnail_url, video_id, video_platform) SELECT identity.id, seeded.url_id, seeded.data, seeded.content_sha256, seeded.media_type, seeded.enclosure_url, seeded.enclosure_type, seeded.enclosure_length, seeded.duration_seconds, seeded.thumbnail_url, seeded.video_id, seeded.video_platform FROM seeded JOIN rss_feed_item_ids identity USING (url_hostname_id, guid) ON CONFLICT (id) DO UPDATE SET url_id = EXCLUDED.url_id, data = EXCLUDED.data, bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256, media_type = EXCLUDED.media_type, enclosure_url = EXCLUDED.enclosure_url, enclosure_type = EXCLUDED.enclosure_type, enclosure_length = EXCLUDED.enclosure_length, duration_seconds = EXCLUDED.duration_seconds, thumbnail_url = EXCLUDED.thumbnail_url, video_id = EXCLUDED.video_id, video_platform = EXCLUDED.video_platform, deleted_at = NULL`,
  )
  await query(
    `INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at) SELECT '019c64e6-f8c0-7000-8000-000000000001', ids.id, items.published_at FROM rss_feed_item_ids ids LEFT JOIN rss_feed_items items ON items.id = ids.id WHERE ids.url_hostname_id = '019c64e6-1000-7000-b000-000000000001' AND ids.guid IN ('test-podcast-1', 'test-video-1') ON CONFLICT DO NOTHING`,
  )
  await query(
    `INSERT INTO topics (id, topic_type, name, slug, markdown, bedrock_nova_multimodal_v1_content_sha256) VALUES ( '019c64e6-f8a0-7000-a000-000000000002', 'card', 'Credit Card News', 'credit-card-news', 'Latest credit card news and deals', decode('00000000000000000000000000000000000000000000000000000000000000e2', 'hex') ) ON CONFLICT (id) DO UPDATE SET topic_type = EXCLUDED.topic_type, name = EXCLUDED.name, slug = EXCLUDED.slug, markdown = EXCLUDED.markdown, bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256`,
  )
  await query(
    `INSERT INTO topics (id, topic_type, name, slug, markdown, bedrock_nova_multimodal_v1_content_sha256) VALUES ( '019c64e6-f8a0-7000-a000-000000000003', 'card', 'Doctor of Credit News', 'doctor-of-credit-news', 'Latest Doctor of Credit stories', decode('00000000000000000000000000000000000000000000000000000000000000e3', 'hex') ) ON CONFLICT (id) DO UPDATE SET topic_type = EXCLUDED.topic_type, name = EXCLUDED.name, slug = EXCLUDED.slug, markdown = EXCLUDED.markdown, bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256`,
  )
  await query(
    `UPDATE topics SET hostname_id = CASE id WHEN '019c64e6-f8a0-7000-a000-000000000001' THEN '019c64e6-1000-7000-b000-000000000001' WHEN '019c64e6-f8a0-7000-a000-000000000002' THEN '019c64e6-1000-7000-b000-000000000005' WHEN '019c64e6-f8a0-7000-a000-000000000003' THEN '019c64e6-1000-7000-b000-000000000004' ELSE hostname_id END WHERE id IN ( '019c64e6-f8a0-7000-a000-000000000001', '019c64e6-f8a0-7000-a000-000000000002', '019c64e6-f8a0-7000-a000-000000000003' )`,
  )
  await query(
    `UPDATE url_hostnames SET topic_id = CASE id WHEN '019c64e6-1000-7000-b000-000000000001' THEN '019c64e6-f8a0-7000-a000-000000000001' WHEN '019c64e6-1000-7000-b000-000000000004' THEN '019c64e6-f8a0-7000-a000-000000000003' WHEN '019c64e6-1000-7000-b000-000000000005' THEN '019c64e6-f8a0-7000-a000-000000000002' ELSE topic_id END WHERE id IN ( '019c64e6-1000-7000-b000-000000000001', '019c64e6-1000-7000-b000-000000000004', '019c64e6-1000-7000-b000-000000000005' )`,
  )
  await query(
    `INSERT INTO urls (id, url, hostname_id, pathname, search_params) VALUES ('019c64e6-f8b0-7000-b000-000000000010', 'https://www.doctorofcredit.com/feed/', '019c64e6-1000-7000-b000-000000000004', '/feed/', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000011', 'https://www.doctorofcredit.com', '019c64e6-1000-7000-b000-000000000004', '/', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000012', 'https://thepointsguy.com/feed/', '019c64e6-1000-7000-b000-000000000005', '/feed/', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000013', 'https://thepointsguy.com', '019c64e6-1000-7000-b000-000000000005', '/', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000020', 'https://www.doctorofcredit.com/chase-sapphire-preferred-new-bonus', '019c64e6-1000-7000-b000-000000000004', '/chase-sapphire-preferred-new-bonus', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000021', 'https://thepointsguy.com/news/chase-sapphire-preferred-bonus-update', '019c64e6-1000-7000-b000-000000000005', '/news/chase-sapphire-preferred-bonus-update', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000022', 'https://www.doctorofcredit.com/amex-gold-grocery-credits', '019c64e6-1000-7000-b000-000000000004', '/amex-gold-grocery-credits', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000023', 'https://thepointsguy.com/news/amex-gold-grocery-update', '019c64e6-1000-7000-b000-000000000005', '/news/amex-gold-grocery-update', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000024', 'https://www.doctorofcredit.com/hilton-points-devaluation', '019c64e6-1000-7000-b000-000000000004', '/hilton-points-devaluation', '{}'::JSONB), ('019c64e6-f8b0-7000-b000-000000000025', 'https://thepointsguy.com/news/best-travel-cards-2025', '019c64e6-1000-7000-b000-000000000005', '/news/best-travel-cards-2025', '{}'::JSONB) ON CONFLICT (url) DO NOTHING`,
  )
  await query(
    `INSERT INTO rss_feeds (id, rss_feed_url_id, topic_id, title) VALUES ( '019c64e6-f8c0-7000-8000-000000000002', '019c64e6-f8b0-7000-b000-000000000010', '019c64e6-f8a0-7000-a000-000000000003', 'Doctor of Credit' ) ON CONFLICT (rss_feed_url_id) WHERE deleted_at IS NULL DO UPDATE SET id = EXCLUDED.id, topic_id = EXCLUDED.topic_id, title = EXCLUDED.title, deleted_at = NULL`,
  )
  await query(
    `INSERT INTO rss_feeds (id, rss_feed_url_id, topic_id, title) VALUES ( '019c64e6-f8c0-7000-8000-000000000003', '019c64e6-f8b0-7000-b000-000000000012', '019c64e6-f8a0-7000-a000-000000000002', 'The Points Guy' ) ON CONFLICT (rss_feed_url_id) WHERE deleted_at IS NULL DO UPDATE SET id = EXCLUDED.id, topic_id = EXCLUDED.topic_id, title = EXCLUDED.title, deleted_at = NULL`,
  )
  await query(
    `DELETE FROM rss_feed_enablement_changes WHERE rss_feed_id IN ( '019c64e6-f8c0-7000-8000-000000000002', '019c64e6-f8c0-7000-8000-000000000003' )`,
  )
  await query(
    `INSERT INTO rss_feed_enablement_changes (rss_feed_id, enabled, reason) VALUES ('019c64e6-f8c0-7000-8000-000000000002', TRUE, 'playwright seed initial state'), ('019c64e6-f8c0-7000-8000-000000000003', TRUE, 'playwright seed initial state')`,
  )
  await query(
    `DELETE FROM rss_feed_discoverability_changes WHERE rss_feed_id IN ( '019c64e6-f8c0-7000-8000-000000000002', '019c64e6-f8c0-7000-8000-000000000003' )`,
  )
  await query(
    `INSERT INTO rss_feed_discoverability_changes (rss_feed_id, enabled, reason) VALUES ('019c64e6-f8c0-7000-8000-000000000002', TRUE, 'playwright seed initial state'), ('019c64e6-f8c0-7000-8000-000000000003', TRUE, 'playwright seed initial state')`,
  )
}

export { seedPlaywrightPostFeedFixtures }
