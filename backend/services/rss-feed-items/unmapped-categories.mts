import { recordModeratorAction } from '@services/moderator-actions'
import { read, runWithTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { decodeCursor, buildPageInfo, isScoreCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanManageRssFeedCategories } from './authorization.mts'
import { createTopicAliases } from '@services/topics/aliases'
import { backfillCategoriesForTopicAliases } from './backfill-categories-for-topic-aliases.mts'
import { registerRssCategoryIdentities } from './category-identities.mts'

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
      ? `SELECT c.category_identity_id, c.item_count::int, FALSE AS rejected
         FROM rss_feed_item_unmapped_category_counts c
         WHERE NOT EXISTS (
             SELECT 1 FROM rss_feed_item_category_rejections r
             WHERE r.category_identity_id = c.category_identity_id
           )`
      : status === 'rejected'
        ? `SELECT r.category_identity_id, COALESCE(g.item_count, 0)::int AS item_count, TRUE AS rejected
           FROM rss_feed_item_category_rejections r
           LEFT JOIN rss_feed_item_unmapped_category_counts g ON g.category_identity_id = r.category_identity_id`
        : /* all */
          `SELECT c.category_identity_id, c.item_count::int, FALSE AS rejected
           FROM rss_feed_item_unmapped_category_counts c
           WHERE NOT EXISTS (
               SELECT 1 FROM rss_feed_item_category_rejections r2
               WHERE r2.category_identity_id = c.category_identity_id
             )
           UNION ALL
           SELECT r.category_identity_id, COALESCE(g.item_count, 0)::int AS item_count, TRUE AS rejected
           FROM rss_feed_item_category_rejections r
           LEFT JOIN rss_feed_item_unmapped_category_counts g ON g.category_identity_id = r.category_identity_id`

  const query = sql`/* getUnmappedRssFeedItemCategories */
    SELECT identity.category_text, base.item_count, base.rejected
    FROM (`
  // Append the static inner SQL (no user data — safe string interpolation)
  query.append(innerSql)
  query.append(sql`) base
    JOIN rss_category_identities identity ON identity.id = base.category_identity_id
    WHERE TRUE`)

  if (cursorScore !== null && cursorId !== null) {
    query.append(
      sql` AND (base.item_count < ${cursorScore} OR (base.item_count = ${cursorScore} AND identity.category_text > ${cursorId}))`,
    )
  }

  query.append(sql` ORDER BY base.item_count DESC, identity.category_text ASC LIMIT ${limit + 1}`)

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
  options: { query?: TransactionQuery } = {},
): Promise<void> {
  assert(currentUserCanManageRssFeedCategories(currentUser), 403, 'Forbidden')
  const normalized = categoryText.trim().toLowerCase()
  assert(normalized, 422, 'category_text is required')
  return runWithTransaction(options.query, async (query: TransactionQuery) => {
    await registerRssCategoryIdentities([normalized], query)
    const { rowCount } = await query(sql`/* rejectRssFeedItemCategory */
    INSERT INTO rss_feed_item_category_rejections (category_identity_id, created_by_id)
    SELECT id, ${currentUser.id} FROM rss_category_identities
    WHERE category_text = ${normalized}
    ON CONFLICT (category_identity_id) DO NOTHING
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
  })
}

export async function unrejectRssFeedItemCategory(
  currentUser: PrivateUser,
  categoryText: string,
  options: { query?: TransactionQuery } = {},
): Promise<void> {
  assert(currentUserCanManageRssFeedCategories(currentUser), 403, 'Forbidden')
  const normalized = categoryText.trim().toLowerCase()
  assert(normalized, 422, 'category_text is required')
  return runWithTransaction(options.query, async (query: TransactionQuery) => {
    const { rowCount } = await query(sql`/* unrejectRssFeedItemCategory */
    DELETE FROM rss_feed_item_category_rejections rejection
    USING rss_category_identities identity
    WHERE rejection.category_identity_id = identity.id
      AND identity.category_text = ${normalized}
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
  })
}

export async function assignRssFeedItemCategoryToTopic(
  currentUser: PrivateUser,
  { categoryText, topicId }: { categoryText: string; topicId: string },
  options: { query?: TransactionQuery } = {},
): Promise<{ updated: number }> {
  assert(currentUserCanManageRssFeedCategories(currentUser), 403, 'Forbidden')
  const normalized = categoryText.trim().toLowerCase()
  assert(normalized, 422, 'category_text is required')
  assert(topicId, 422, 'topic_id is required')

  return runWithTransaction(options.query, async query => {
    const { updated } = await assignCategoryInTransaction(
      currentUser.id,
      topicId,
      normalized,
      query,
    )
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
    return { updated }
  })
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
