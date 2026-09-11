import { write, type QueryExecutor } from '@data-stores/psql'
import { RSS_FEED_ITEM_CATEGORY_SQL_BATCH_SIZE } from './processing-limits.mts'

export type CategoryTopicMutation = {
  rss_feed_item_id: string
  previous_topic_id: string | null
  topic_id: string | null
  previous_topic_alias_id: string | null
  topic_alias_id: string | null
}

export async function insertMissingHashtagAliases(aliases: string[]): Promise<void> {
  const uniqueAliases = [...new Set(aliases)].sort((left, right) => left.localeCompare(right))
  if (uniqueAliases.length === 0) return

  await write(
    `/* insertMissingHashtagAliases */
      INSERT INTO topic_aliases (alias)
      SELECT alias
      FROM unnest($1::text[]) AS input(alias)
      ORDER BY alias
      ON CONFLICT (alias) DO NOTHING
    `,
    [uniqueAliases],
  )
}

export async function insertMissingCategories(
  toInsert: Array<{ rss_feed_item_id: string; category: string; hashtag_alias: string | null }>,
  query: QueryExecutor,
): Promise<CategoryTopicMutation[]> {
  if (toInsert.length === 0) return []

  const mutations: CategoryTopicMutation[] = []
  for (const chunk of orderedCategoryChunks(toInsert)) {
    // eslint-disable-next-line no-await-in-loop -- Sequential chunks avoid DB lock contention.
    mutations.push(...(await insertMissingCategoriesChunk(chunk, query)))
  }
  return mutations
}

async function insertMissingCategoriesChunk(
  toInsert: Array<{ rss_feed_item_id: string; category: string; hashtag_alias: string | null }>,
  query: QueryExecutor,
): Promise<CategoryTopicMutation[]> {
  const { rows } = await query<CategoryTopicMutation>(
    `/* insertMissingCategories */
      INSERT INTO rss_feed_item_categories (
        rss_feed_item_id,
        category_text,
        topic_id,
        topic_alias_id
      )
      SELECT
        input.rss_feed_item_id,
        input.category_text,
        COALESCE(t_alias.id, t_name.id, t_slug.id) as topic_id,
        ta.id AS topic_alias_id
      FROM (
        SELECT
          unnest($1::uuid[]) as rss_feed_item_id,
          unnest($2::text[]) as category_text,
          unnest($3::text[]) as hashtag_alias
      ) as input
      LEFT JOIN topic_aliases ta
        ON ta.alias = input.hashtag_alias
      LEFT JOIN topic_aliases text_alias
        ON text_alias.alias = LOWER(input.category_text)
      LEFT JOIN topics t_alias ON t_alias.id = COALESCE(ta.topic_id, text_alias.topic_id) AND t_alias.deleted_at IS NULL AND t_alias.merged_into_topic_id IS NULL
      LEFT JOIN topics t_name ON LOWER(t_name.name) = LOWER(input.category_text) AND t_name.deleted_at IS NULL AND t_name.merged_into_topic_id IS NULL
      LEFT JOIN topics t_slug ON t_slug.slug = LOWER(input.category_text) AND t_slug.deleted_at IS NULL AND t_slug.merged_into_topic_id IS NULL
      ORDER BY input.rss_feed_item_id, LOWER(input.category_text), input.category_text
      ON CONFLICT (rss_feed_item_id, (LOWER(category_text))) DO NOTHING
      RETURNING rss_feed_item_id, NULL::uuid AS previous_topic_id, topic_id,
        NULL::uuid AS previous_topic_alias_id, topic_alias_id
    `,
    [
      toInsert.map(i => i.rss_feed_item_id),
      toInsert.map(i => i.category),
      toInsert.map(i => i.hashtag_alias),
    ],
  )
  return rows
}

export async function updateMatchedCategories(
  toUpdate: Array<{
    rss_feed_item_id: string
    category: string
    topicId?: string | null
    topicAliasId?: string | null
  }>,
  query: QueryExecutor,
): Promise<CategoryTopicMutation[]> {
  if (toUpdate.length === 0) return []

  const mutations: CategoryTopicMutation[] = []
  for (const chunk of orderedCategoryChunks(toUpdate)) {
    // eslint-disable-next-line no-await-in-loop -- Sequential chunks avoid DB lock contention.
    mutations.push(...(await updateMatchedCategoriesChunk(chunk, query)))
  }
  return mutations
}

function orderedCategoryChunks<T extends { rss_feed_item_id: string }>(rows: readonly T[]): T[][] {
  const rowsByItemId = new Map<string, T[]>()
  for (const row of rows) {
    const itemRows = rowsByItemId.get(row.rss_feed_item_id) ?? []
    itemRows.push(row)
    rowsByItemId.set(row.rss_feed_item_id, itemRows)
  }
  const chunks: T[][] = []
  let chunk: T[] = []
  for (const [, itemRows] of [...rowsByItemId].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (
      chunk.length > 0 &&
      chunk.length + itemRows.length > RSS_FEED_ITEM_CATEGORY_SQL_BATCH_SIZE
    ) {
      chunks.push(chunk)
      chunk = []
    }
    chunk.push(...itemRows)
  }
  if (chunk.length > 0) chunks.push(chunk)
  return chunks
}

async function updateMatchedCategoriesChunk(
  toUpdate: Array<{
    rss_feed_item_id: string
    category: string
    topicId?: string | null
    topicAliasId?: string | null
  }>,
  query: QueryExecutor,
): Promise<CategoryTopicMutation[]> {
  const { rows } = await query<CategoryTopicMutation>(
    `/* updateMatchedCategories */
      WITH updates AS (
        SELECT
          unnest($1::uuid[]) as rss_feed_item_id,
          unnest($2::text[]) as category_text,
          unnest($3::uuid[]) as topic_id
          , unnest($4::uuid[]) as topic_alias_id
      ), candidates AS (
        SELECT
          category.rss_feed_item_id,
          category.category_text,
          category.topic_id AS previous_topic_id,
          category.topic_alias_id AS previous_topic_alias_id,
          updates.topic_id AS requested_topic_id,
          updates.topic_alias_id AS requested_topic_alias_id
        FROM rss_feed_item_categories category
        JOIN updates
          ON category.rss_feed_item_id = updates.rss_feed_item_id
         AND LOWER(category.category_text) = LOWER(updates.category_text)
        WHERE category.topic_id IS DISTINCT FROM COALESCE(updates.topic_id, category.topic_id)
           OR category.topic_alias_id IS DISTINCT FROM COALESCE(updates.topic_alias_id, category.topic_alias_id)
        ORDER BY category.rss_feed_item_id, LOWER(category.category_text), category.category_text
        FOR UPDATE OF category
      ), changed AS (
        UPDATE rss_feed_item_categories category
        SET topic_id = COALESCE(candidates.requested_topic_id, category.topic_id),
            topic_alias_id = COALESCE(candidates.requested_topic_alias_id, category.topic_alias_id)
        FROM candidates
        WHERE category.rss_feed_item_id = candidates.rss_feed_item_id
          AND category.category_text = candidates.category_text
        RETURNING category.rss_feed_item_id, candidates.previous_topic_id, category.topic_id,
          candidates.previous_topic_alias_id, category.topic_alias_id
      )
      SELECT rss_feed_item_id, previous_topic_id, topic_id,
        previous_topic_alias_id, topic_alias_id
      FROM changed
    `,
    [
      toUpdate.map(u => u.rss_feed_item_id),
      toUpdate.map(u => u.category),
      toUpdate.map(u => u.topicId ?? null),
      toUpdate.map(u => u.topicAliasId ?? null),
    ],
  )
  return rows
}
