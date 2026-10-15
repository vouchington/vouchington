import { insertExplainHostnameFlagSources } from '@voucha/test-helpers/entities/explain-bloom-repair'
import { bloomRepairSeedWindow } from './bloom-reconciliation.mts'
import { beginTransaction, write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const HOSTNAME_FLAG_SEED_ROW_COUNT = 11

export async function seedHostnameFlags(): Promise<void> {
  const rows = Array.from({ length: HOSTNAME_FLAG_SEED_ROW_COUNT }, (_, i) => ({
    id: seedUuid(1100 + i, '02'),
    hostname: `seed-flags-${i}.example.com`,
    crawlable: i >= 5 && i !== 10,
    blocked: i >= 5,
    updated_at: new Date(
      bloomRepairSeedWindow().start.getTime() + (i < 4 ? 1000 : -90 * 86_400_000),
    ).toISOString(),
  }))
  await insertExplainHostnameFlagSources(rows)
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedHostnameFlagsBlocks */ INSERT INTO url_hostname_blocks (url_hostname_id, blocked_source)
    SELECT id, 'admin' FROM jsonb_to_recordset($1::jsonb) AS seed(id uuid, blocked boolean)
    WHERE blocked AND NOT EXISTS (SELECT 1 FROM url_hostname_blocks b WHERE b.url_hostname_id = seed.id AND b.lifted_at IS NULL)`,
    [JSON.stringify(rows)],
  )
  await transaction.commit()
}

/** A large work backlog with one bounded due page for the indexed claim scenario. */
export async function seedHostnameCacheInvalidationWork(): Promise<void> {
  await write(
    `/* seedExplainHostnameCacheInvalidationWork */
    INSERT INTO url_hostname_cache_invalidation_work_items (url_hostname_id, available_at)
    SELECT id,
      CASE WHEN ordinal <= 1000 THEN CURRENT_TIMESTAMP
        ELSE CURRENT_TIMESTAMP + INTERVAL '1 day' END
    FROM (
      SELECT id, row_number() OVER (ORDER BY hostname) AS ordinal
      FROM url_hostnames WHERE hostname LIKE 'seed-blocked-%.example.net'
    ) seed
    ON CONFLICT (url_hostname_id) DO NOTHING`,
  )
}
