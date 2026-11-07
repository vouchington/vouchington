import { beginTransaction, write, type QueryOptions } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { getRelationTypeLimit } from '@services/entity-relations/relation-limits-config'
import { blockedUrlIdsForHostnameBlocks } from '@services/hostname-blocking'
import { containsReferralLinks } from '@services/referral-program-link-validations/contains-referral-links'
import type {
  ProjectionWork,
  SourceDecision,
  SourceRow,
} from './story-post-related-url-projection-types.mts'
import { isStoryPostRelatedUrlProjectionWorkCurrent } from './story-post-related-url-projection-work.mts'

export async function getStoryPostRelatedUrlProjectionPrefix(
  input: {
    storyId: string
    sourceHighWaterId: string
    limit: number
  },
  query?: TransactionQuery,
): Promise<SourceRow[]> {
  const statement = `/* getStoryPostRelatedUrlProjectionPrefix */
    SELECT items.id, items.url_id, urls.url
    -- no-mistakes-disable-next-line postgres-required-predicates: story membership can attach already-created items, so item IDs may predate story_id
    FROM rss_feed_items items
    JOIN urls ON urls.id = items.url_id
    WHERE items.story_id = $1 AND items.deleted_at IS NULL AND items.id <= $2
    -- deleted_at is NULL for every admitted row, so this is item-id order on
    -- idx_rss_feed_items__story_id__deleted_at__id.
    ORDER BY items.story_id, items.deleted_at, items.id
    LIMIT $3`
  const values = [input.storyId, input.sourceHighWaterId, input.limit]
  const { rows } = query
    ? await query<SourceRow>(statement, values)
    : await write<SourceRow>(statement, values)
  return rows
}

export async function getStoryPostRelatedUrlProjectionSourcePageForWork(
  work: ProjectionWork,
  query?: TransactionQuery,
): Promise<SourceRow[]> {
  const capacity = getRelationTypeLimit('relation__post__related__url')
  if (capacity === null) throw new Error('Missing post related URL limit')
  // A NULL high-water is a real empty snapshot, not an unbounded scan that could
  // accidentally absorb items assigned after this generation began.
  if (!work.sweep_upper_bound_source_id) return []
  return getStoryPostRelatedUrlProjectionPrefix(
    {
      storyId: work.story_id,
      sourceHighWaterId: work.sweep_upper_bound_source_id,
      limit: capacity,
    },
    query,
  )
}

export async function decideStoryPostRelatedUrlProjectionRows(
  work: ProjectionWork,
  rows: readonly SourceRow[],
  options: QueryOptions = {},
  webRiskBlockedUrls: ReadonlySet<string> = new Set(),
): Promise<SourceDecision[]> {
  const uniqueByUrlId = new Map<string, SourceRow>()
  for (const row of rows) {
    if (!uniqueByUrlId.has(row.url_id)) uniqueByUrlId.set(row.url_id, row)
  }
  const uniqueRows = [...uniqueByUrlId.values()]
  const uniqueUrlIds: string[] = []
  for (const row of uniqueRows) uniqueUrlIds.push(row.url_id)
  const receiptDecisions = new Map<string, boolean>()
  // The admission transaction rechecks every prefix URL under the hostname locks.
  if (!options.query && uniqueUrlIds.length > 0) {
    const { rows: receiptRows } = await write<{ url_id: string; is_eligible: boolean }>(
      `/* storyPostRelatedUrlProjectionExistingReceipts */
        SELECT url_id, is_eligible FROM story_post_related_url_projection_receipts
        WHERE post_id = $1 AND generation = $2 AND url_id = ANY($3::uuid[])`,
      [work.post_id, work.generation, uniqueUrlIds],
      options,
    )
    for (const row of receiptRows) receiptDecisions.set(row.url_id, row.is_eligible)
  }
  const pendingRows: SourceRow[] = []
  for (const row of uniqueRows) {
    if (!receiptDecisions.has(row.url_id)) pendingRows.push(row)
  }
  const pendingUrls: string[] = []
  for (const row of pendingRows) pendingUrls.push(row.url)
  const { matched_urls: matched } = await containsReferralLinks(pendingUrls, {
    ...options,
    readOnly: false,
  })
  const referralUrls = new Set<string>()
  for (const row of matched) referralUrls.add(row.url)
  const pendingUrlIds: string[] = []
  for (const row of pendingRows) pendingUrlIds.push(row.url_id)
  const blockedUrlIds = await blockedUrlIdsForHostnameBlocks(pendingUrlIds, options)
  const pendingDecisions = new Map<string, boolean>()
  for (const row of pendingRows) {
    pendingDecisions.set(
      row.url_id,
      !referralUrls.has(row.url) &&
        !blockedUrlIds.has(row.url_id) &&
        !webRiskBlockedUrls.has(row.url),
    )
  }
  const sourceDecisions: SourceDecision[] = []
  for (const row of uniqueRows) {
    sourceDecisions.push({
      ...row,
      is_eligible: receiptDecisions.get(row.url_id) ?? pendingDecisions.get(row.url_id) ?? false,
    })
  }
  return sourceDecisions
}

export async function stageStoryPostRelatedUrlProjectionReceipts(
  work: ProjectionWork,
  rows: SourceDecision[],
  existingQuery?: TransactionQuery,
): Promise<boolean> {
  if (rows.length === 0)
    return isStoryPostRelatedUrlProjectionWorkCurrent(work, existingQuery, false)
  if (existingQuery)
    return stageStoryPostRelatedUrlProjectionReceiptsOn(existingQuery, work, rows, false)
  await using query = await beginTransaction()
  const staged = await stageStoryPostRelatedUrlProjectionReceiptsOn(query, work, rows, true)
  if (staged) await query.commit()
  return staged
}

async function stageStoryPostRelatedUrlProjectionReceiptsOn(
  query: TransactionQuery,
  work: ProjectionWork,
  rows: SourceDecision[],
  lock: boolean,
): Promise<boolean> {
  if (!(await isStoryPostRelatedUrlProjectionWorkCurrent(work, query, lock))) return false
  await query(
    `/* stageStoryPostRelatedUrlProjectionReceipts */
      INSERT INTO story_post_related_url_projection_receipts
        (post_id, generation, url_id, source_item_id, is_eligible)
      SELECT $1::uuid AS post_id, $2::bigint AS generation, url_id, source_item_id, is_eligible
      FROM unnest($3::uuid[], $4::uuid[], $5::boolean[]) AS input(url_id, source_item_id, is_eligible)
      ORDER BY post_id, generation, url_id
      ON CONFLICT (post_id, generation, url_id) DO NOTHING`,
    [
      work.post_id,
      work.generation,
      sourceRowUrlIds(rows),
      sourceRowIds(rows),
      sourceRowEligibility(rows),
    ],
  )
  return true
}

function sourceRowUrlIds(rows: SourceRow[]): string[] {
  const urlIds: string[] = []
  for (const row of rows) urlIds.push(row.url_id)
  return urlIds
}

function sourceRowIds(rows: SourceRow[]): string[] {
  const ids: string[] = []
  for (const row of rows) ids.push(row.id)
  return ids
}

function sourceRowEligibility(rows: SourceDecision[]): boolean[] {
  const eligibility: boolean[] = []
  for (const row of rows) eligibility.push(row.is_eligible)
  return eligibility
}
