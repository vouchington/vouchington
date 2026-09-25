import type { TransactionQuery } from '@data-stores/psql'
import { buildEmbeddingVector, sha256 } from './helpers.mts'
export async function seedPlaywrightFeedData(query: TransactionQuery): Promise<void> {
  const cspEmbedding1 = buildEmbeddingVector(10, 0) // Chase Sapphire cluster
  const cspEmbedding2 = buildEmbeddingVector(10, 1) // Chase Sapphire cluster (similar)
  const amexEmbedding1 = buildEmbeddingVector(20, 0) // Amex Gold cluster
  const amexEmbedding2 = buildEmbeddingVector(20, 1) // Amex Gold cluster (similar)
  const hiltonEmbedding = buildEmbeddingVector(30, 0) // Standalone
  const travelEmbedding = buildEmbeddingVector(40, 0) // Standalone
  await query(`
    INSERT INTO rss_feed_item_ids (url_hostname_id, guid)
    VALUES
      ('019c64e6-1000-7000-b000-000000000004', 'doc-csp-bonus'),
      ('019c64e6-1000-7000-b000-000000000005', 'tpg-csp-bonus'),
      ('019c64e6-1000-7000-b000-000000000004', 'doc-amex-grocery'),
      ('019c64e6-1000-7000-b000-000000000005', 'tpg-amex-grocery'),
      ('019c64e6-1000-7000-b000-000000000004', 'doc-hilton-devalue'),
      ('019c64e6-1000-7000-b000-000000000005', 'tpg-best-travel-cards')
    ON CONFLICT (url_hostname_id, guid) DO NOTHING
  `)
  await query(`
  WITH seeded(url_hostname_id, guid, url_id, data, content_sha256, input_sha256, embedding, embedding_created_at) AS (
  VALUES
    (
      '019c64e6-1000-7000-b000-000000000004'::UUID,
      'doc-csp-bonus'::TEXT,
      '019c64e6-f8b0-7000-b000-000000000020'::UUID,
      '{"title": "Chase Sapphire Preferred Now Offering 75K Bonus Points", "link": "https://www.doctorofcredit.com/chase-sapphire-preferred-new-bonus", "guid": "doc-csp-bonus", "isoDate": "2025-01-15T00:00:00.000Z", "contentSnippet": "Chase has increased the signup bonus on the Sapphire Preferred card to 75,000 Ultimate Rewards points after spending $4,000 in the first 3 months."}'::JSONB,
      decode('${sha256('doc-csp-bonus').toString('hex')}', 'hex'),
      decode('${sha256('doc-csp-bonus').toString('hex')}', 'hex'),
      '${cspEmbedding1}'::vector,
      CURRENT_TIMESTAMP
    ),
    (
      '019c64e6-1000-7000-b000-000000000005'::UUID,
      'tpg-csp-bonus'::TEXT,
      '019c64e6-f8b0-7000-b000-000000000021'::UUID,
      '{"title": "Breaking: Chase Sapphire Preferred Bonus Jumps to 75K Points", "link": "https://thepointsguy.com/news/chase-sapphire-preferred-bonus-update", "guid": "tpg-csp-bonus", "isoDate": "2025-01-15T00:00:00.000Z", "contentSnippet": "The Chase Sapphire Preferred card is now offering its highest-ever signup bonus of 75,000 Ultimate Rewards points for new cardholders."}'::JSONB,
      decode('${sha256('tpg-csp-bonus').toString('hex')}', 'hex'),
      decode('${sha256('tpg-csp-bonus').toString('hex')}', 'hex'),
      '${cspEmbedding2}'::vector,
      CURRENT_TIMESTAMP
    ),
    (
      '019c64e6-1000-7000-b000-000000000004'::UUID,
      'doc-amex-grocery'::TEXT,
      '019c64e6-f8b0-7000-b000-000000000022'::UUID,
      '{"title": "Amex Gold Card Adding New Grocery Store Credits", "link": "https://www.doctorofcredit.com/amex-gold-grocery-credits", "guid": "doc-amex-grocery", "isoDate": "2025-01-15T00:00:00.000Z", "contentSnippet": "American Express is adding a new monthly grocery store credit to the Gold Card, worth up to $10 per month at select supermarkets."}'::JSONB,
      decode('${sha256('doc-amex-grocery').toString('hex')}', 'hex'),
      decode('${sha256('doc-amex-grocery').toString('hex')}', 'hex'),
      '${amexEmbedding1}'::vector,
      CURRENT_TIMESTAMP
    ),
    (
      '019c64e6-1000-7000-b000-000000000005'::UUID,
      'tpg-amex-grocery'::TEXT,
      '019c64e6-f8b0-7000-b000-000000000023'::UUID,
      '{"title": "Amex Gold Gets New Monthly Grocery Benefit", "link": "https://thepointsguy.com/news/amex-gold-grocery-update", "guid": "tpg-amex-grocery", "isoDate": "2025-01-15T00:00:00.000Z", "contentSnippet": "The Amex Gold Card is getting a new perk: monthly credits at grocery stores, making it even better for everyday spending."}'::JSONB,
      decode('${sha256('tpg-amex-grocery').toString('hex')}', 'hex'),
      decode('${sha256('tpg-amex-grocery').toString('hex')}', 'hex'),
      '${amexEmbedding2}'::vector,
      CURRENT_TIMESTAMP
    ),
    (
      '019c64e6-1000-7000-b000-000000000004'::UUID,
      'doc-hilton-devalue'::TEXT,
      '019c64e6-f8b0-7000-b000-000000000024'::UUID,
      '{"title": "Hilton Honors Points Devaluation Coming March 2025", "link": "https://www.doctorofcredit.com/hilton-points-devaluation", "guid": "doc-hilton-devalue", "isoDate": "2025-01-15T00:00:00.000Z", "contentSnippet": "Hilton has announced changes to their award chart that will increase point costs at many popular properties starting March 2025."}'::JSONB,
      decode('${sha256('doc-hilton-devalue').toString('hex')}', 'hex'),
      decode('${sha256('doc-hilton-devalue').toString('hex')}', 'hex'),
      '${hiltonEmbedding}'::vector,
      CURRENT_TIMESTAMP
    ),
    (
      '019c64e6-1000-7000-b000-000000000005'::UUID,
      'tpg-best-travel-cards'::TEXT,
      '019c64e6-f8b0-7000-b000-000000000025'::UUID,
      '{"title": "The Best Travel Credit Cards for 2025", "link": "https://thepointsguy.com/news/best-travel-cards-2025", "guid": "tpg-best-travel-cards", "isoDate": "2025-01-15T00:00:00.000Z", "contentSnippet": "Our updated rankings of the best travel credit cards, including new welcome bonuses and expanded benefits for 2025."}'::JSONB,
      decode('${sha256('tpg-best-travel-cards').toString('hex')}', 'hex'),
      decode('${sha256('tpg-best-travel-cards').toString('hex')}', 'hex'),
      '${travelEmbedding}'::vector,
      CURRENT_TIMESTAMP
    )
  )
  INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256, bedrock_nova_multimodal_v1_input_sha256, bedrock_nova_multimodal_v1_embedding, bedrock_nova_multimodal_v1_embedding_created_at)
  SELECT identity.id, seeded.url_id, seeded.data, seeded.content_sha256, seeded.input_sha256, seeded.embedding, seeded.embedding_created_at
  FROM seeded
  JOIN rss_feed_item_ids identity USING (url_hostname_id, guid)
  ON CONFLICT (id) DO UPDATE SET
    url_id = EXCLUDED.url_id,
    data = EXCLUDED.data,
    bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256,
    bedrock_nova_multimodal_v1_input_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_input_sha256,
    bedrock_nova_multimodal_v1_embedding = EXCLUDED.bedrock_nova_multimodal_v1_embedding,
    bedrock_nova_multimodal_v1_embedding_created_at = EXCLUDED.bedrock_nova_multimodal_v1_embedding_created_at,
    deleted_at = NULL
      `)
  await query(
    `INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at) SELECT '019c64e6-f8c0-7000-8000-000000000002', ids.id, items.published_at FROM rss_feed_item_ids ids LEFT JOIN rss_feed_items items ON items.id = ids.id WHERE ids.url_hostname_id = '019c64e6-1000-7000-b000-000000000004' AND ids.guid IN ('doc-csp-bonus', 'doc-amex-grocery', 'doc-hilton-devalue') ON CONFLICT DO NOTHING`,
  )
  await query(
    `INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at) SELECT '019c64e6-f8c0-7000-8000-000000000003', ids.id, items.published_at FROM rss_feed_item_ids ids LEFT JOIN rss_feed_items items ON items.id = ids.id WHERE ids.url_hostname_id = '019c64e6-1000-7000-b000-000000000005' AND ids.guid IN ('tpg-csp-bonus', 'tpg-amex-grocery', 'tpg-best-travel-cards') ON CONFLICT DO NOTHING`,
  )
  await query(
    `WITH primary_item AS ( SELECT id FROM rss_feed_item_ids WHERE url_hostname_id = '019c64e6-1000-7000-b000-000000000004' AND guid = 'doc-csp-bonus' LIMIT 1 ) INSERT INTO stories (id, title, published_at, cluster_reason, official_rss_feed_item_id) SELECT '019c64e6-f8d0-7000-9000-000000000002', 'Chase Sapphire Preferred Bonus Update', '2025-01-15T00:00:00Z', 'Seeded cluster for related-articles Playwright test', primary_item.id FROM primary_item ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, published_at = EXCLUDED.published_at, cluster_reason = EXCLUDED.cluster_reason, official_rss_feed_item_id = EXCLUDED.official_rss_feed_item_id`,
  )
  await query(
    `UPDATE rss_feed_items SET story_id = '019c64e6-f8d0-7000-9000-000000000002' WHERE id IN (SELECT id FROM rss_feed_item_ids WHERE (url_hostname_id = '019c64e6-1000-7000-b000-000000000004' AND guid = 'doc-csp-bonus') OR (url_hostname_id = '019c64e6-1000-7000-b000-000000000005' AND guid = 'tpg-csp-bonus'))`,
  )
  await query(
    `WITH primary_item AS ( SELECT id FROM rss_feed_item_ids WHERE url_hostname_id = '019c64e6-1000-7000-b000-000000000004' AND guid = 'doc-amex-grocery' LIMIT 1 ) INSERT INTO stories (id, title, published_at, cluster_reason, official_rss_feed_item_id) SELECT '019c64e6-f8d0-7000-9000-000000000003', 'Amex Gold Grocery Credits', '2025-01-15T00:00:00Z', 'Seeded cluster for related-articles Playwright test', primary_item.id FROM primary_item ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, published_at = EXCLUDED.published_at, cluster_reason = EXCLUDED.cluster_reason, official_rss_feed_item_id = EXCLUDED.official_rss_feed_item_id`,
  )
  await query(
    `UPDATE rss_feed_items SET story_id = '019c64e6-f8d0-7000-9000-000000000003' WHERE id IN (SELECT id FROM rss_feed_item_ids WHERE (url_hostname_id = '019c64e6-1000-7000-b000-000000000004' AND guid = 'doc-amex-grocery') OR (url_hostname_id = '019c64e6-1000-7000-b000-000000000005' AND guid = 'tpg-amex-grocery'))`,
  )
  await query(
    `DELETE FROM relation__user__follow__topic WHERE subject_id = '019f0000-0000-7000-8000-000000000000' AND object_id IN ( '019c64e6-f710-74cb-b36d-130af8ff1067', '019c64e6-f8a0-7000-a000-000000000001', '019c64e6-f8a0-7000-a000-000000000002', '019c64e6-f8a0-7000-a000-000000000003' )`,
  )
  await query(
    `DELETE FROM relation__user__follow__user WHERE subject_id = '019f0000-0000-7000-8000-000000000000' AND object_id IN ( '019f0000-0000-7000-8000-000000000000', '00000000-0000-0000-0000-000000000001' )`,
  )
  await query(
    `DELETE FROM relation__user__follow__user WHERE subject_id = '00000000-0000-0000-0000-000000000001' AND object_id = '019f0000-0000-7000-8000-000000000000'`,
  )
  await query(
    `DELETE FROM relation__user__follow__rss_feed WHERE subject_id = '019f0000-0000-7000-8000-000000000000' AND object_id = '019c64e6-f8c0-7000-8000-000000000001'`,
  )
  await query(
    `DELETE FROM relation__user__block__topic WHERE subject_id = '019f0000-0000-7000-8000-000000000000' AND object_id = '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1'`,
  )
  await query(
    `DELETE FROM relation__user__mute__topic WHERE subject_id = '019f0000-0000-7000-8000-000000000000' AND object_id = '019c64e6-f716-722f-b05c-f4c4f7b93cd0'`,
  )
  await query(
    `DELETE FROM relation__user__block__user WHERE subject_id = '019f0000-0000-7000-8000-000000000000' AND object_id = '00000000-0000-0000-0000-000000000002'`,
  )
  await query(
    `DELETE FROM relation__user__mute__user WHERE subject_id = '019f0000-0000-7000-8000-000000000000' AND object_id = '00000000-0000-0000-0000-000000000003'`,
  )
  await query(
    `DELETE FROM relation__user__save__rss_feed_item WHERE subject_id = '019f0000-0000-7000-8000-000000000000' AND object_id IN ( SELECT id FROM rss_feed_item_ids WHERE guid = 'test-item-1' AND url_hostname_id = '019c64e6-1000-7000-b000-000000000001' )`,
  )
  await query(
    `INSERT INTO relation__user__follow__topic (subject_id, object_id) VALUES ('019f0000-0000-7000-8000-000000000000', '019c64e6-f710-74cb-b36d-130af8ff1067'), ('019f0000-0000-7000-8000-000000000000', '019c64e6-f8a0-7000-a000-000000000001'), ('019f0000-0000-7000-8000-000000000000', '019c64e6-f8a0-7000-a000-000000000002'), ('019f0000-0000-7000-8000-000000000000', '019c64e6-f8a0-7000-a000-000000000003') ON CONFLICT DO NOTHING`,
  )
  await query(
    `INSERT INTO relation__user__follow__user (subject_id, object_id) VALUES ('019f0000-0000-7000-8000-000000000000', '00000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING`,
  )
  await query(
    `INSERT INTO relation__user__follow__user (subject_id, object_id) VALUES ('00000000-0000-0000-0000-000000000001', '019f0000-0000-7000-8000-000000000000') ON CONFLICT DO NOTHING`,
  )
  await query(
    `INSERT INTO notifications ( user_id, entity_type, actor_user_id, delivery_type, title, body, actor_label, target_path ) VALUES ( '019f0000-0000-7000-8000-000000000000', 'follow', '00000000-0000-0000-0000-000000000001', 'subscription', '@test-friend started following you', '', 'test-friend', '/@test-friend' ) ON CONFLICT DO NOTHING`,
  )
  await query(
    `INSERT INTO relation__user__follow__rss_feed (subject_id, object_id) VALUES ('019f0000-0000-7000-8000-000000000000', '019c64e6-f8c0-7000-8000-000000000001') ON CONFLICT DO NOTHING`,
  )
  await query(
    `INSERT INTO relation__user__block__topic (subject_id, object_id) VALUES ('019f0000-0000-7000-8000-000000000000', '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1') ON CONFLICT DO NOTHING`,
  )
  await query(
    `INSERT INTO relation__user__mute__topic (subject_id, object_id) VALUES ('019f0000-0000-7000-8000-000000000000', '019c64e6-f716-722f-b05c-f4c4f7b93cd0') ON CONFLICT DO NOTHING`,
  )
  await query(
    `INSERT INTO relation__user__block__user (subject_id, object_id) VALUES ('019f0000-0000-7000-8000-000000000000', '00000000-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING`,
  )
  await query(
    `INSERT INTO relation__user__mute__user (subject_id, object_id) VALUES ('019f0000-0000-7000-8000-000000000000', '00000000-0000-0000-0000-000000000003') ON CONFLICT DO NOTHING`,
  )
  await query(
    `INSERT INTO relation__user__save__rss_feed_item (subject_id, object_id) SELECT '019f0000-0000-7000-8000-000000000000', id FROM rss_feed_item_ids WHERE guid = 'test-item-1' AND url_hostname_id = '019c64e6-1000-7000-b000-000000000001' ON CONFLICT DO NOTHING`,
  )
}
