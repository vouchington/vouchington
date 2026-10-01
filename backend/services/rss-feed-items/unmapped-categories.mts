import { recordModeratorAction } from '@services/moderator-actions'
import { beginTransaction, read, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { decodeCursor, buildPageInfo, isScoreCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanManageRssFeedCategories } from './authorization.mts'
import { createTopicAliases } from '@services/topics/aliases'
import { backfillCategoriesForTopicAliases } from './backfill-categories-for-topic-aliases.mts'

export type UnmappedCategoryStatus = 'pending' | 'rejected' | 'all'

export type UnmappedCategory = {
  category_text: string
  item_count: number
  rejected: boolean
}

export type GetUnmappedCategoriesOptions = {
  status?: UnmappedCategoryStatus
  limit?: number
  after?: string
}

export type GetUnmappedCategoriesResult = {
  results: UnmappedCategory[]
  page_info: PageInfo
}

const UNMAPPED_COUNTS_SQL = `
  SELECT category_text, item_count::int
  FROM rss_feed_item_unmapped_category_counts
`

export async function getUnmappedRssFeedItemCategories(
  options: GetUnmappedCategoriesOptions = {},
): Promise<GetUnmappedCategoriesResult> {
  const status = options.status ?? 'pending'
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100)

  let cursorScore: number | null = null
  let cursorId: string | null = null
  if (options.after) {
    const cursor = decodeCursor(options.after)
    assert(isScoreCursor(cursor), 400, 'Invalid cursor format')
    cursorScore = cursor.score
    cursorId = cursor.id
  }

  // Build the inner SELECT based on status so that:
  // - pending:  categories with unmapped rows that are not rejected
  // - rejected: categories in the rejections table (item_count=0 when all rows are now mapped)
  // - all:      union of both (each category appears once in the correct bucket)
  const innerSql =
    status === 'pending'
      ? `SELECT c.category_text, c.item_count::int, FALSE AS rejected
         FROM rss_feed_item_unmapped_category_counts c
         WHERE NOT EXISTS (
             SELECT 1 FROM rss_feed_item_category_rejections r
             WHERE r.category_text = c.category_text
           )`
      : status === 'rejected'
        ? `SELECT r.category_text, COALESCE(g.item_count, 0)::int AS item_count, TRUE AS rejected
           FROM rss_feed_item_category_rejections r
           LEFT JOIN (${UNMAPPED_COUNTS_SQL}) g ON g.category_text = r.category_text`
        : /* all */
          `SELECT c.category_text, c.item_count::int, FALSE AS rejected
           FROM rss_feed_item_unmapped_category_counts c
           WHERE NOT EXISTS (
               SELECT 1 FROM rss_feed_item_category_rejections r2
               WHERE r2.category_text = c.category_text
             )
           UNION ALL
           SELECT r.category_text, COALESCE(g.item_count, 0)::int AS item_count, TRUE AS rejected
           FROM rss_feed_item_category_rejections r
           LEFT JOIN (${UNMAPPED_COUNTS_SQL}) g ON g.category_text = r.category_text`

  const query = sql`/* getUnmappedRssFeedItemCategories */
    SELECT category_text, item_count, rejected
    FROM (`
  // Append the static inner SQL (no user data — safe string interpolation)
  query.append(innerSql)
  query.append(sql`) base WHERE TRUE`)

  if (cursorScore !== null && cursorId !== null) {
    query.append(
      sql` AND (item_count < ${cursorScore} OR (item_count = ${cursorScore} AND category_text > ${cursorId}))`,
    )
  }

  query.append(sql` ORDER BY item_count DESC, category_text ASC LIMIT ${limit + 1}`)

  const { rows } = await read(query)
  const hasNextPage = rows.length > limit
  const results = (rows as UnmappedCategory[]).slice(0, limit)

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: item => ({ score: item.item_count, id: item.category_text }),
    }),
  }
}

export async function rejectRssFeedItemCategory(
  currentUser: PrivateUser,
  categoryText: string,
): Promise<void> {
  assert(currentUserCanManageRssFeedCategories(currentUser), 403, 'Forbidden')
  const normalized = categoryText.trim().toLowerCase()
  assert(normalized, 422, 'category_text is required')
  await using query = await beginTransaction()
  const { rowCount } = await query(sql`/* rejectRssFeedItemCategory */
    INSERT INTO rss_feed_item_category_rejections (category_text, created_by_id)
    VALUES (${normalized}, ${currentUser.id})
    ON CONFLICT (category_text) DO NOTHING
  `)
  await recordModeratorAction(
    currentUser.id,
    {
      actionType: 'rss_category_reject',
      rssCategoryText: normalized,
      metadata: { before: { rejected: !rowCount }, after: { rejected: true } },
    },
    { query },
  )
  await query.commit()
}

export async function unrejectRssFeedItemCategory(
  currentUser: PrivateUser,
  categoryText: string,
): Promise<void> {
  assert(currentUserCanManageRssFeedCategories(currentUser), 403, 'Forbidden')
  const normalized = categoryText.trim().toLowerCase()
  assert(normalized, 422, 'category_text is required')
  await using query = await beginTransaction()
  const { rowCount } = await query(sql`/* unrejectRssFeedItemCategory */
    DELETE FROM rss_feed_item_category_rejections
    WHERE category_text = ${normalized}
  `)
  await recordModeratorAction(
    currentUser.id,
    {
      actionType: 'rss_category_unreject',
      rssCategoryText: normalized,
      metadata: { before: { rejected: Boolean(rowCount) }, after: { rejected: false } },
    },
    { query },
  )
  await query.commit()
}

export async function assignRssFeedItemCategoryToTopic(
  currentUser: PrivateUser,
  { categoryText, topicId }: { categoryText: string; topicId: string },
): Promise<{ updated: number }> {
  assert(currentUserCanManageRssFeedCategories(currentUser), 403, 'Forbidden')
  const normalized = categoryText.trim().toLowerCase()
  assert(normalized, 422, 'category_text is required')
  assert(topicId, 422, 'topic_id is required')

  await using query = await beginTransaction()
  const { updated } = await assignCategoryInTransaction(currentUser.id, topicId, normalized, query)
  await recordModeratorAction(
    currentUser.id,
    {
      actionType: 'rss_category_assign',
      topicId,
      rssCategoryText: normalized,
      metadata: { after: { updated } },
    },
    { query },
  )
  await query.commit()
  return { updated }
}

async function assignCategoryInTransaction(
  currentUserId: string,
  topicId: string,
  category: string,
  query: TransactionQuery,
) {
  await createTopicAliases(topicId, [category], { query, revisedById: currentUserId })
  return backfillCategoriesForTopicAliases(topicId, { query })
}
