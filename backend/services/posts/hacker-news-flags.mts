import { buildHackerNewsPostUrlsSql } from '@services/urls/hacker-news-post-urls'
import { beginTransaction, withTransactionOptions, type TransactionQuery } from '@data-stores/psql'
import { lockPostPublicationPostScopes } from '@services/post-publication'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  getHackerNewsWorkLimit,
  hackerNewsWorkConfig,
} from '@services/urls/hacker-news-work-limits'

/** Recompute from current live URLs and referenced canonical totals, without rewriting unchanged rows. */
export async function recomputePostHackerNewsFlags(
  postIds: readonly string[],
  options: QueryOptions = {},
): Promise<void> {
  if (postIds.length === 0) return
  await hackerNewsWorkConfig.waitForInitialization()
  const ids = [...new Set(postIds)].toSorted()
  const size = getHackerNewsWorkLimit('write_batch_size')
  for (let index = 0; index < ids.length; index += size) {
    const batch = ids.slice(index, index + size)
    // no-mistakes-disable-next-line query-reached-per-item: each transaction handles a bounded batch, not an individual post.
    await recomputePostHackerNewsFlagChunk(batch, options) // oxlint-disable-line no-await-in-loop -- serialize chunks and their lock order.
  }
}

async function recomputePostHackerNewsFlagChunk(
  ids: string[],
  options: QueryOptions,
): Promise<void> {
  if (options.query || options.client) {
    await withTransactionOptions(options, query => recomputeLockedPostHackerNewsFlags(query, ids))
    return
  }
  await using query = await beginTransaction()
  await recomputeLockedPostHackerNewsFlags(query, ids)
  await query.commit()
}

async function recomputeLockedPostHackerNewsFlags(
  query: TransactionQuery,
  ids: string[],
): Promise<void> {
  // Match relation, vote, and post mutation scope locks before taking a fresh SQL snapshot.
  await lockPostPublicationPostScopes(query, ids)
  await query(
    `/* recomputePostHackerNewsFlags */
    UPDATE posts AS post SET has_hacker_news_references = desired.has_references
    FROM (
      SELECT candidate.id, EXISTS (
        SELECT 1 FROM LATERAL (${buildHackerNewsPostUrlsSql('candidate.id')}) links
        JOIN urls source ON source.id = links.url_id
        LEFT JOIN urls hop ON hop.id = source.canonical_url_id
        JOIN url_hacker_news_totals totals
          ON totals.url_id = COALESCE(hop.canonical_url_id, source.canonical_url_id, source.id)
        WHERE totals.story_count > 0 OR totals.comment_count > 0
      ) AS has_references
      FROM posts candidate WHERE candidate.id = ANY($1::uuid[])
    ) desired
    WHERE post.id = desired.id AND post.id = ANY($1::uuid[])
      AND post.has_hacker_news_references IS DISTINCT FROM desired.has_references`,
    [ids],
  )
}

export function recomputePostHackerNewsFlag(
  postId: string,
  options: QueryOptions = {},
): Promise<void> {
  return recomputePostHackerNewsFlags([postId], options)
}
