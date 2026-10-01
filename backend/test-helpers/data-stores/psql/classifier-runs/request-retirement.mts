import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createAutotaggerRunAdapter } from '../../../../services/autotagger/index.mts'
import {
  listPendingClassifierRunRequests,
  type ClassifierRunAdapter,
} from '../../../../services/classifier-runs/index.mts'

/** Every post id the C6 sweep dispatches now, drained across pages. */
export const sweepableAutotaggerPostIds = () => sweepablePostIds(createAutotaggerRunAdapter())

/** Every post id an adapter's sweep dispatches now, drained across pages. */
export async function sweepablePostIds<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  after: string | null = null,
): Promise<string[]> {
  const page = await listPendingClassifierRunRequests(adapter, after)
  const ids = page.items.flatMap(item => (item.postId ? [item.postId] : []))
  return page.next ? [...ids, ...(await sweepablePostIds(adapter, page.next))] : ids
}

/**
 * The adapter whose sweep eligibility also waits on a prerequisite the test controls, as C6 waits
 * on an embedding: the subject stays live (its lock still returns it) while the sweep skips it.
 */
export function withSweepPrerequisite<C, L, E>(adapter: ClassifierRunAdapter<C, L, E>) {
  const prerequisite = { met: false }
  const waiting: ClassifierRunAdapter<C, L, E> = {
    ...adapter,
    requestEligibility: () =>
      sql`(`.append(adapter.requestEligibility()).append(sql` AND ${prerequisite.met}::boolean)`),
  }
  return { adapter: waiting, prerequisite }
}

/** Soft-deletes a feed item, or revives it, as an upstream removal or a re-upsert would. */
export async function setFeedItemDeletedForTest(itemId: string, deleted: boolean): Promise<void> {
  await write(sql`/* setFeedItemDeletedForTest */
    UPDATE rss_feed_items SET deleted_at = ${deleted ? new Date() : null} WHERE id = ${itemId}
  `)
}

/** Points a feed item back at a content digest it had before, as a reverted edit would. */
export async function setFeedItemContentHashForTest(
  itemId: string,
  inputSha256: Buffer,
): Promise<void> {
  await write(sql`/* setFeedItemContentHashForTest */
    UPDATE rss_feed_items SET bedrock_nova_multimodal_v1_content_sha256 = ${inputSha256}
    WHERE id = ${itemId}
  `)
}
