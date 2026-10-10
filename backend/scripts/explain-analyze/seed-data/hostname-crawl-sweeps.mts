import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'
import { resolveSeedAnchor } from './seed-anchor.mts'

export async function seedHostnameCrawlSweeps(): Promise<void> {
  const anchor = new Date(resolveSeedAnchor(process.env.EXPLAIN_SEED_ANCHOR_DATE).dayAnchorMs)
  const recent = anchor.toISOString()
  const overdue = new Date(anchor.getTime() - 10 * 86400000).toISOString()
  const rows = Array.from({ length: 2006 }, (_, i) => ({
    id: seedUuid(2000 + i, '02'),
    hostname: `seed-crawl-sweep-${i}.example.com`,
    swept_at: i < 3 ? null : i < 6 ? overdue : recent,
  }))
  await write(
    `/* seedHostnameCrawlSweeps */ INSERT INTO url_hostnames
    (id, hostname, age_threshold_days, crawl_swept_at)
    SELECT id, hostname, 7, swept_at FROM jsonb_to_recordset($1::jsonb)
      AS seed(id uuid, hostname text, swept_at timestamptz) ON CONFLICT DO NOTHING`,
    [JSON.stringify(rows)],
  )
}
