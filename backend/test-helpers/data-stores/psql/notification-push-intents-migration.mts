import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function backfillHistoricalPushEndpointOwnership(ownerBackfillSql: string): Promise<{
  active: Array<{ endpoint: string }>
  owners: Array<{ endpoint: string }>
}> {
  await using client = await beginTransaction()
  await client(
    sql`CREATE TEMP TABLE web_push_subscriptions (id UUID PRIMARY KEY, user_id UUID NOT NULL, endpoint TEXT NOT NULL, deleted_at TIMESTAMPTZ) ON COMMIT DROP`,
  )
  await client(
    sql`CREATE TEMP TABLE web_push_endpoint_owners (endpoint_digest BYTEA PRIMARY KEY, endpoint TEXT NOT NULL, user_id UUID NOT NULL, subscription_id UUID NOT NULL) ON COMMIT DROP`,
  )
  await client(
    sql`INSERT INTO web_push_subscriptions (id, user_id, endpoint, deleted_at) VALUES ('00000000-0000-7000-8000-000000000011', '00000000-0000-7000-8000-000000000001', 'https://push.test/historical', '2026-01-01'), ('00000000-0000-7000-8000-000000000012', '00000000-0000-7000-8000-000000000002', 'https://push.test/historical', NULL), ('00000000-0000-7000-8000-000000000013', '00000000-0000-7000-8000-000000000003', 'https://push.test/unique', NULL)`,
  )
  await client(ownerBackfillSql)
  const { rows: active } = await client<{ endpoint: string }>(
    sql`SELECT endpoint FROM web_push_subscriptions WHERE deleted_at IS NULL ORDER BY endpoint`,
  )
  const { rows: owners } = await client<{ endpoint: string }>(
    sql`SELECT endpoint FROM web_push_endpoint_owners ORDER BY endpoint`,
  )
  await client.commit()
  return { active, owners }
}
