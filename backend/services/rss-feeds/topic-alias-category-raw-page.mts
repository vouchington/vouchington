import type { TransactionQuery } from '@data-stores/psql/types'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'
const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

export type AliasCategoryPhase = 0 | 1 | 2 | 3

export type AliasCategoryCursor = {
  phase: AliasCategoryPhase
  scan_upper_item_id: string | null
  scan_upper_feed_id: string | null
  after_item_id: string | null
  after_category_identity_id: string | null
  after_feed_id: string | null
}

export type AliasCategoryRawRow = {
  rss_feed_item_id?: string
  rss_feed_id?: string
  category_identity_id: string
}

export type AliasCategoryRawPage = {
  rows: AliasCategoryRawRow[]
  cursor: AliasCategoryCursor
  hasMore: boolean
}

/** Page one indexed raw stream before mapping eligibility so an unchanged prefix cannot starve work. */
export async function readAliasCategoryRawPage(
  query: TransactionQuery,
  aliasId: string,
  alias: string,
  cursor: AliasCategoryCursor,
  pageSize: number,
): Promise<AliasCategoryRawPage> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1)
    throw new RangeError('Invalid category page size')
  if (cursor.phase === 3) return { rows: [], cursor, hasMore: false }

  const upperItemId = cursor.scan_upper_item_id ?? (await readUpperId(query, 'rss_feed_items'))
  const upperFeedId = cursor.scan_upper_feed_id ?? (await readUpperId(query, 'rss_feeds'))
  let rows: AliasCategoryRawRow[]
  const textIdentityId = cursor.phase === 0 ? null : await readCategoryIdentityId(query, alias)
  if (cursor.phase === 0) {
    const result = await query<AliasCategoryRawRow>(
      `/* readAliasCategoryRawPage authoredItems */
       SELECT rss_feed_item_id, category_identity_id
       FROM rss_feed_item_categories
       WHERE topic_alias_id = $1::uuid
         AND rss_feed_item_id <= $2::uuid
         AND (rss_feed_item_id, category_identity_id) <
           ($3::uuid, $4::uuid)
       ORDER BY rss_feed_item_id DESC, category_identity_id DESC
       LIMIT $5::integer`,
      [
        aliasId,
        upperItemId,
        cursor.after_item_id ?? MAX_UUID,
        cursor.after_category_identity_id ?? MAX_UUID,
        pageSize + 1,
      ],
    )
    rows = result.rows
  } else if (cursor.phase === 1) {
    const result = await query<AliasCategoryRawRow>(
      `/* readAliasCategoryRawPage textItems */
       SELECT category.rss_feed_item_id, category.category_identity_id
       FROM rss_feed_item_categories category
       WHERE category.category_identity_id = $1::uuid
         AND category.rss_feed_item_id <= $2::uuid
         AND category.rss_feed_item_id > $3::uuid
       ORDER BY category.rss_feed_item_id
       LIMIT $4::integer`,
      [textIdentityId, upperItemId, cursor.after_item_id ?? NIL_UUID, pageSize + 1],
    )
    rows = result.rows
  } else {
    const result = await query<AliasCategoryRawRow>(
      `/* readAliasCategoryRawPage textFeeds */
       SELECT category.rss_feed_id, category.category_identity_id
       FROM rss_feed_categories category
       WHERE category.category_identity_id = $1::uuid
         AND category.rss_feed_id <= $2::uuid
         AND category.rss_feed_id > $3::uuid
       ORDER BY category.rss_feed_id
       LIMIT $4::integer`,
      [textIdentityId, upperFeedId, cursor.after_feed_id ?? NIL_UUID, pageSize + 1],
    )
    rows = result.rows
  }
  const selected = rows.slice(0, pageSize)
  const moreInPhase = rows.length > pageSize
  const last = selected.at(-1)
  const nextPhase = moreInPhase ? cursor.phase : ((cursor.phase + 1) as AliasCategoryPhase)
  return {
    rows: selected,
    cursor: {
      phase: nextPhase,
      scan_upper_item_id: upperItemId,
      scan_upper_feed_id: upperFeedId,
      after_item_id: moreInPhase ? (last?.rss_feed_item_id ?? null) : null,
      after_category_identity_id:
        moreInPhase && cursor.phase === 0 ? (last?.category_identity_id ?? null) : null,
      after_feed_id: moreInPhase ? (last?.rss_feed_id ?? null) : null,
    },
    hasMore: nextPhase !== 3,
  }
}

async function readCategoryIdentityId(
  query: TransactionQuery,
  categoryText: string,
): Promise<string | null> {
  const { rows } = await query<{ id: string }>(
    `/* readAliasCategoryRawPage identity */
     SELECT id FROM rss_category_identities
     WHERE category_text = LOWER($1::text) LIMIT 1`,
    [categoryText],
  )
  return rows[0]?.id ?? null
}

async function readUpperId(
  query: TransactionQuery,
  relation: 'rss_feed_items' | 'rss_feeds',
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `/* readAliasCategoryRawPage upper */ SELECT id FROM ${relation} ORDER BY id DESC LIMIT 1`,
  )
  return rows[0]?.id ?? NIL_UUID
}
