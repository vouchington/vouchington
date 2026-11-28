import type { TransactionQuery } from '@data-stores/psql'

export async function holdRssFeedScopeLockForTest(
  query: TransactionQuery,
  feedId: string,
): Promise<void> {
  await query(
    `/* holdUnrelatedFeedScope */ SELECT pg_advisory_xact_lock(hashtextextended('rss_feed:' || $1::uuid::text, 0))`,
    [feedId],
  )
}
