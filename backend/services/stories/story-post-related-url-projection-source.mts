import { beginTransaction, write } from '@data-stores/psql'
import { containsReferralLinks } from '@services/referral-program-link-validations/contains-referral-links'
import { assertUrlsHaveNoBlockedHostnames } from '@services/urls/assert-hostname-not-blocked'
import pMap from 'p-map'
import sql from 'sql-template-strings'
import { publicationStoryItemPageCtes } from '@services/post-publication/story-item-pages'
import type {
  ProjectionWork,
  SourceDecision,
  SourceRow,
} from './story-post-related-url-projection-types.mts'
import { isStoryPostRelatedUrlProjectionWorkCurrent } from './story-post-related-url-projection-work.mts'

export const STORY_POST_RELATED_URL_PROJECTION_PAGE_SIZE = 100
const SAFETY_CONCURRENCY = 5

export async function getStoryPostRelatedUrlProjectionSourcePage(input: {
  storyId: string
  sourceCursorId: string | null
  sourceHighWaterId: string
  limit: number
}): Promise<SourceRow[]> {
  const cursor = input.sourceCursorId ?? '00000000-0000-0000-0000-000000000000'
  const scope = sql`SELECT ${input.storyId}::uuid AS story_id, ${cursor}::uuid AS cursor_id, ${input.sourceHighWaterId}::uuid AS high_water_id`
  const statement = sql`/* storyPostRelatedUrlProjectionSourcePage */ `.append(
    publicationStoryItemPageCtes(scope, input.limit, input.sourceCursorId === null, true),
  ).append(sql`SELECT items.id, items.url_id, urls.url FROM items
      JOIN urls ON urls.id = items.url_id ORDER BY items.id`)
  const { rows } = await write<SourceRow>(statement)
  return rows
}

export async function getStoryPostRelatedUrlProjectionSourcePageForWork(
  work: ProjectionWork,
): Promise<SourceRow[]> {
  // A NULL high-water is a real empty snapshot, not an unbounded scan that could
  // accidentally absorb items assigned after this generation began.
  if (!work.source_high_water_id) return []
  return getStoryPostRelatedUrlProjectionSourcePage({
    storyId: work.story_id,
    sourceCursorId: work.source_cursor_id,
    sourceHighWaterId: work.source_high_water_id,
    limit: STORY_POST_RELATED_URL_PROJECTION_PAGE_SIZE,
  })
}

type PendingEligibilityInput = {
  row: SourceRow
  referralUrls: ReadonlySet<string>
}

export async function decideStoryPostRelatedUrlProjectionRows(
  work: ProjectionWork,
  rows: SourceRow[],
): Promise<SourceDecision[]> {
  const uniqueByUrlId = new Map<string, SourceRow>()
  for (const row of rows) {
    if (!uniqueByUrlId.has(row.url_id)) uniqueByUrlId.set(row.url_id, row)
  }
  const uniqueRows = [...uniqueByUrlId.values()]
  const uniqueUrlIds: string[] = []
  for (const row of uniqueRows) uniqueUrlIds.push(row.url_id)
  const { rows: receiptRows } = await write<{ url_id: string; eligible: boolean }>(
    `/* storyPostRelatedUrlProjectionExistingReceipts */
      SELECT url_id, eligible FROM story_post_related_url_projection_receipts
      WHERE post_id = $1 AND generation = $2 AND url_id = ANY($3::uuid[])`,
    [work.post_id, work.generation, uniqueUrlIds],
  )
  const receiptDecisions = new Map<string, boolean>()
  for (const row of receiptRows) receiptDecisions.set(row.url_id, row.eligible)
  const pendingRows: SourceRow[] = []
  for (const row of uniqueRows) {
    if (!receiptDecisions.has(row.url_id)) pendingRows.push(row)
  }
  const pendingUrls: string[] = []
  for (const row of pendingRows) pendingUrls.push(row.url)
  const { matched_urls: matched } = await containsReferralLinks(pendingUrls, { readOnly: false })
  const referralUrls = new Set<string>()
  for (const row of matched) referralUrls.add(row.url)
  const pendingInputs: PendingEligibilityInput[] = []
  for (const row of pendingRows) pendingInputs.push({ row, referralUrls })
  const decisions = await pMap(pendingInputs, decidePendingStoryPostRelatedUrlProjectionRow, {
    concurrency: SAFETY_CONCURRENCY,
    stopOnError: true,
  })
  const pendingDecisions = new Map<string, boolean>()
  for (let index = 0; index < pendingInputs.length; index++) {
    pendingDecisions.set(pendingInputs[index]!.row.url_id, decisions[index]!)
  }
  const sourceDecisions: SourceDecision[] = []
  for (const row of uniqueRows) {
    sourceDecisions.push({
      ...row,
      eligible: receiptDecisions.get(row.url_id) ?? pendingDecisions.get(row.url_id) ?? false,
    })
  }
  return sourceDecisions
}

async function decidePendingStoryPostRelatedUrlProjectionRow(
  input: PendingEligibilityInput,
): Promise<boolean> {
  if (input.referralUrls.has(input.row.url)) return false
  try {
    // No user id: historical RSS URLs must never penalize @story-teller.
    await assertUrlsHaveNoBlockedHostnames([input.row.url_id])
    return true
  } catch (error) {
    if (isUnsafeUrlError(error)) return false
    throw error
  }
}

export async function stageStoryPostRelatedUrlProjectionReceipts(
  work: ProjectionWork,
  rows: SourceDecision[],
): Promise<boolean> {
  if (rows.length === 0) return isStoryPostRelatedUrlProjectionWorkCurrent(work)
  await using query = await beginTransaction()
  if (!(await isStoryPostRelatedUrlProjectionWorkCurrent(work, query, true))) return false
  await query(
    `/* stageStoryPostRelatedUrlProjectionReceipts */
      INSERT INTO story_post_related_url_projection_receipts
        (post_id, generation, url_id, source_item_id, eligible)
      SELECT $1, $2, url_id, source_item_id, eligible
      FROM unnest($3::uuid[], $4::uuid[], $5::boolean[]) AS input(url_id, source_item_id, eligible)
      ORDER BY url_id
      ON CONFLICT (post_id, generation, url_id) DO NOTHING`,
    [
      work.post_id,
      work.generation,
      sourceRowUrlIds(rows),
      sourceRowIds(rows),
      sourceRowEligibility(rows),
    ],
  )
  await query.commit()
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
  for (const row of rows) eligibility.push(row.eligible)
  return eligibility
}

function isUnsafeUrlError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error.status === 400 || error.status === 422)
  )
}
