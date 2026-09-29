import type { TransactionQuery } from '@data-stores/psql'
import { recentSeedCrawlId } from '../crawl-ids.mts'

async function seedPlaywrightCrawlersAndCrawls(
  query: TransactionQuery,
  _testUserEmail: string,
): Promise<void> {
  /* v8 ignore stop */
  await query(
    `INSERT INTO url_hostnames (id, hostname, crawlable) VALUES ('019c64e6-1000-7000-b000-000000000001', 'example.com', TRUE), ('019c64e6-1000-7000-b000-000000000002', 'test.org', TRUE), ('019c64e6-1000-7000-b000-000000000003', 'blocked-site.com', FALSE), ('019c64e6-1000-7000-b000-000000000004', 'www.doctorofcredit.com', TRUE), ('019c64e6-1000-7000-b000-000000000005', 'thepointsguy.com', TRUE) ON CONFLICT (hostname) DO UPDATE SET crawlable = EXCLUDED.crawlable`,
  )
  // Insert the history row so blocked-site.com has a url_hostname_blocks entry that the
  // trigger-maintained url_hostnames.blocked column stays consistent with, and so
  // unblockHostname() can lift it.  WHERE NOT EXISTS makes this idempotent across re-seeds.
  await query(
    `INSERT INTO url_hostname_blocks (url_hostname_id, blocked_source)
     SELECT '019c64e6-1000-7000-b000-000000000003', 'seed'
     WHERE NOT EXISTS (
       SELECT 1 FROM url_hostname_blocks
       WHERE url_hostname_id = '019c64e6-1000-7000-b000-000000000003'
         AND lifted_at IS NULL
     )`,
  )
  await query(
    `INSERT INTO urls (id, url, hostname_id, pathname, search_params) VALUES ('019c64e6-2000-7000-8000-000000000001', 'https://example.com/page1', '019c64e6-1000-7000-b000-000000000001', '/page1', '{}'::JSONB), ('019c64e6-2000-7000-8000-000000000002', 'https://example.com/page2', '019c64e6-1000-7000-b000-000000000001', '/page2', '{}'::JSONB), ('019c64e6-2000-7000-8000-000000000003', 'https://test.org/article', '019c64e6-1000-7000-b000-000000000002', '/article', '{}'::JSONB) ON CONFLICT (url) DO NOTHING`,
  )
  await query(
    `INSERT INTO crawlers (id, hostname_id, description, crawler_type, priority, css_selectors_to_remove, link_text_content_to_remove, link_hrefs_to_remove) VALUES ( '019c64e6-3000-7000-8000-000000000001', '019c64e6-1000-7000-b000-000000000001', 'Example.com crawler', 'fetch', 1, ARRAY['.ads', '.sidebar']::TEXT[], ARRAY['Advertisement', 'Sponsored']::TEXT[], ARRAY['https://ads.example.com']::TEXT[] ), ( '019c64e6-3000-7000-8000-000000000002', '019c64e6-1000-7000-b000-000000000002', 'Test.org automation crawler', 'automation', 0, ARRAY['.banner']::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[] ) ON CONFLICT (id) DO UPDATE SET hostname_id = EXCLUDED.hostname_id, description = EXCLUDED.description, crawler_type = EXCLUDED.crawler_type, priority = EXCLUDED.priority, css_selectors_to_remove = EXCLUDED.css_selectors_to_remove, link_text_content_to_remove = EXCLUDED.link_text_content_to_remove, link_hrefs_to_remove = EXCLUDED.link_hrefs_to_remove, deleted_at = NULL`,
  )
  await query(
    `DELETE FROM crawls WHERE url_id IN ( '019c64e6-2000-7000-8000-000000000001', '019c64e6-2000-7000-8000-000000000002', '019c64e6-2000-7000-8000-000000000003' )`,
  )
  const crawlId1 = recentSeedCrawlId(1)
  const crawlId2 = recentSeedCrawlId(2)
  const crawlId3 = recentSeedCrawlId(3)
  const crawlId4 = recentSeedCrawlId(4)
  await query(`
  INSERT INTO crawls (id, url_id, crawler_id, response_status_code, completed_at, embeddings_generated_at, markdown, title)
  VALUES
    (
      '${crawlId1}',
      '019c64e6-2000-7000-8000-000000000001',
      '019c64e6-3000-7000-8000-000000000001',
      200,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      '# Test Page 1\n\nThis is test content for page 1.',
      'Test Page 1'
    ),
    (
      '${crawlId2}',
      '019c64e6-2000-7000-8000-000000000001',
      '019c64e6-3000-7000-8000-000000000001',
      200,
      CURRENT_TIMESTAMP - INTERVAL '1 day',
      CURRENT_TIMESTAMP - INTERVAL '1 day',
      '# Test Page 1 (Old)\n\nThis is older content for page 1.',
      'Test Page 1 (Old)'
    ),
    (
      '${crawlId3}',
      '019c64e6-2000-7000-8000-000000000002',
      '019c64e6-3000-7000-8000-000000000001',
      200,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      '# Test Page 2\n\nThis is test content for page 2.',
      'Test Page 2'
    ),
    (
      '${crawlId4}',
      '019c64e6-2000-7000-8000-000000000003',
      '019c64e6-3000-7000-8000-000000000002',
      404,
      CURRENT_TIMESTAMP,
      NULL,
      '',
      NULL
    )
  ON CONFLICT (id) DO UPDATE SET
    embeddings_generated_at = EXCLUDED.embeddings_generated_at,
    markdown = EXCLUDED.markdown,
    title = EXCLUDED.title
      `)
  await query(
    `INSERT INTO crawl_chunks (
      crawl_id,
      order_index,
      markdown,
      bedrock_nova_multimodal_v1_content_sha256
    ) VALUES (
      '${crawlId1}',
      0,
      'The playwright fixture token pwwebsearchsnippet appears in this crawled page for web search tests.',
      decode('00000000000000000000000000000000000000000000000000000000000000c1', 'hex')
    )
    ON CONFLICT (crawl_id, order_index) DO UPDATE SET
      markdown = EXCLUDED.markdown,
      bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256`,
  )
}

export { seedPlaywrightCrawlersAndCrawls }
