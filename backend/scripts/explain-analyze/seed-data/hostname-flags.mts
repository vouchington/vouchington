import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export async function seedHostnameFlags(): Promise<void> {
  await using transaction = await beginTransaction()
  const rows = Array.from({ length: 11 }, (_, i) => ({
    id: seedUuid(1100 + i, '02'),
    hostname: `seed-flags-${i}.example.com`,
    crawlable: i >= 5 && i !== 10,
    blocked: i >= 5,
  }))
  await transaction(
    `/* seedHostnameFlags */ INSERT INTO url_hostnames (id, hostname, is_crawlable)
    SELECT id, hostname, crawlable FROM jsonb_to_recordset($1::jsonb)
      AS seed(id uuid, hostname text, crawlable boolean) ON CONFLICT DO NOTHING`,
    [JSON.stringify(rows)],
  )
  await transaction(
    `/* seedHostnameFlagsBlocks */ INSERT INTO url_hostname_blocks (url_hostname_id, blocked_source)
    SELECT id, 'admin' FROM jsonb_to_recordset($1::jsonb) AS seed(id uuid, blocked boolean)
    WHERE blocked AND NOT EXISTS (SELECT 1 FROM url_hostname_blocks b WHERE b.url_hostname_id = seed.id AND b.lifted_at IS NULL)`,
    [JSON.stringify(rows)],
  )
  await transaction.commit()
}
