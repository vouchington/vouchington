import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'
import { resolveSeedAnchor } from './seed-anchor.mts'

export async function seedHostnameCrawlSweeps(): Promise<void> {
  const anchor = new Date(resolveSeedAnchor(process.env.EXPLAIN_SEED_ANCHOR_DATE).dayAnchorMs)
  const recent = anchor.toISOString()
  const overdue = new Date(anchor.getTime() - 10 * 86400000).toISOString()
  const rows = Array.from({ length: 2006 }, (_, i) => ({
    id: seedUuid(2000 + i, '02'),
    url_id: seedUuid(2000 + i, '13'),
    hostname: `seed-crawl-sweep-${i}.example.com`,
    url: `https://seed-crawl-sweep-${i}.example.com/`,
    swept_at: i < 3 ? null : i < 6 ? overdue : recent,
  }))
  await write(
    `/* seedHostnameCrawlSweeps */ INSERT INTO url_hostnames
    (id, hostname, age_threshold_days, crawl_swept_at, publicly_introduced_at)
    SELECT id, hostname, 7, swept_at, CURRENT_TIMESTAMP FROM jsonb_to_recordset($1::jsonb)
      AS seed(id uuid, hostname text, swept_at timestamptz) ON CONFLICT DO NOTHING`,
    [JSON.stringify(rows)],
  )
  await write(
    `/* seedHostnameCrawlSweeps:urls */ INSERT INTO urls
    (id, url, hostname_id, search_params)
    SELECT seed.url_id, seed.url, seed.id, '{}'::jsonb
    FROM jsonb_to_recordset($1::jsonb)
      AS seed(id uuid, url_id uuid, url text)
    JOIN url_hostnames host ON host.id = seed.id
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(rows)],
  )
}
