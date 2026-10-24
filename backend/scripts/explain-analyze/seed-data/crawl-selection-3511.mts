import { write } from '@data-stores/psql'
import { CRAWL_SEED_PREFIX } from './common.mts'

export async function seedCrawlSelection3511(): Promise<void> {
  console.log('Seeding HTML parent-path pairs and sparse old invalid crawls...')
  await write(
    `/* seedCrawlSelection3511:htmlExisting */
      UPDATE crawls SET html_sha256 = decode(repeat('11', 32), 'hex'),
        html_snapshot_uploaded_at = NOW()
      WHERE id::text LIKE $1 AND completed_at IS NOT NULL`,
    [`${CRAWL_SEED_PREFIX}-1200-%`],
  )
  await write(
    `/* seedCrawlSelection3511:htmlPairs */
    INSERT INTO crawls (id, url_id, response_status_code, completed_at,
      html_sha256, html_snapshot_uploaded_at, markdown)
    SELECT ($1::text || '-1300-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      ('019e0000-0300-7000-8000-' || lpad(to_hex(ordinal + 1000), 12, '0'))::uuid,
      200, NOW(), decode(repeat('22', 32), 'hex'), NOW(), 'HTML parent-path fixture'
    FROM generate_series(0, 499) ordinal ON CONFLICT DO NOTHING`,
    [CRAWL_SEED_PREFIX],
  )
  await write(
    `/* seedCrawlSelection3511:invalidBacklog */
    INSERT INTO crawls (id, url_id, response_status_code, completed_at, markdown)
    SELECT ($1::text || '-1400-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      ('019e0000-0300-7000-8000-' || lpad(to_hex(ordinal % 1000), 12, '0'))::uuid,
      CASE WHEN ordinal % 100 = 0 THEN 599 ELSE 200 END,
      CASE WHEN ordinal % 100 = 0 THEN NULL ELSE NOW() - INTERVAL '100 days' END,
      'Old crawl cleanup fixture'
    FROM generate_series(1, 10000) ordinal ON CONFLICT DO NOTHING`,
    [CRAWL_SEED_PREFIX],
  )
}
