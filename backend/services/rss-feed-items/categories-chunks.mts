import { write, type QueryExecutor } from '@data-stores/psql'
import { registerRssCategoryIdentities } from './category-identities.mts'
import { orderedCategoryChunks } from './ordered-category-chunks.mts'

export type CategoryTopicMutation = {
  rss_feed_item_id: string
  previous_topic_id: string | null
  topic_id: string | null
  previous_topic_alias_id: string | null
  topic_alias_id: string | null
}

export async function insertMissingHashtagAliases(aliases: string[]): Promise<void> {
  const uniqueAliases = [...new Set(aliases)].toSorted((left, right) => left.localeCompare(right))
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
  toInsert: Array<{
    rss_feed_item_id: string
    category: string
    hashtag_alias: string | null
    topicId: string | null
  }>,
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
  toInsert: Array<{
    rss_feed_item_id: string
    category: string
    hashtag_alias: string | null
    topicId: string | null
  }>,
  query: QueryExecutor,
): Promise<CategoryTopicMutation[]> {
  await registerRssCategoryIdentities(
    toInsert.map(category => category.category),
    query,
  )
  const { rows } = await query<CategoryTopicMutation>(
    `/* insertMissingCategories */
      INSERT INTO rss_feed_item_categories (
        rss_feed_item_id,
        category_identity_id,
        category_text,
        topic_id,
        topic_alias_id
      )
      SELECT
        input.rss_feed_item_id,
        identity.id,
        input.category_text,
        input.topic_id,
        ta.id AS topic_alias_id
      FROM unnest($1::uuid[], $2::text[], $3::text[], $4::uuid[])
        AS input(rss_feed_item_id, category_text, hashtag_alias, topic_id)
      CROSS JOIN LATERAL (
        SELECT id FROM rss_category_identities
        WHERE category_text = LOWER(TRIM(input.category_text))
        LIMIT 1
      ) identity
      LEFT JOIN LATERAL (
        SELECT id FROM topic_aliases
        WHERE alias = input.hashtag_alias AND unlink_requested_at IS NULL
        LIMIT 1
      ) ta ON TRUE
      ORDER BY input.rss_feed_item_id, identity.id
      ON CONFLICT (rss_feed_item_id, category_identity_id) DO NOTHING
      RETURNING rss_feed_item_id, NULL::uuid AS previous_topic_id, topic_id,
        NULL::uuid AS previous_topic_alias_id, topic_alias_id
    `,
    [
      toInsert.map(i => i.rss_feed_item_id),
      toInsert.map(i => i.category),
      toInsert.map(i => i.hashtag_alias),
      toInsert.map(i => i.topicId),
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

async function updateMatchedCategoriesChunk(
  toUpdate: Array<{
    rss_feed_item_id: string
    category: string
    topicId?: string | null
    topicAliasId?: string | null
  }>,
  query: QueryExecutor,
): Promise<CategoryTopicMutation[]> {
  // lock-reason: prevents: publication using a superseded topic or alias mapping; writer: clearUnlinkedTopicAliasCategoryBatch
  const { rows } = await query<CategoryTopicMutation>(
    `/* updateMatchedCategories */
      WITH updates AS (
        SELECT input.rss_feed_item_id, identity.id AS category_identity_id,
          input.topic_id, input.topic_alias_id
        FROM unnest($1::uuid[], $2::text[], $3::uuid[], $4::uuid[])
          AS input(rss_feed_item_id, category_text, topic_id, topic_alias_id)
        CROSS JOIN LATERAL (
          SELECT id FROM rss_category_identities
          WHERE category_text = LOWER(TRIM(input.category_text))
          LIMIT 1
        ) identity
      ), candidates AS (
        SELECT
          category.rss_feed_item_id,
          category.category_identity_id,
          category.topic_id AS previous_topic_id,
          category.topic_alias_id AS previous_topic_alias_id,
          updates.topic_id AS requested_topic_id,
          updates.topic_alias_id AS requested_topic_alias_id
        FROM unnest(ARRAY(SELECT updates FROM updates)) AS updates(
          rss_feed_item_id uuid,
          category_identity_id uuid,
          topic_id uuid,
          topic_alias_id uuid
        )
        JOIN rss_feed_item_categories category
          ON category.rss_feed_item_id = updates.rss_feed_item_id
         AND category.category_identity_id = updates.category_identity_id
        WHERE category.topic_id IS DISTINCT FROM COALESCE(updates.topic_id, category.topic_id)
           OR category.topic_alias_id IS DISTINCT FROM COALESCE(updates.topic_alias_id, category.topic_alias_id)
        ORDER BY category.rss_feed_item_id, category.category_identity_id
        FOR UPDATE OF category
      ), changed AS (
        UPDATE rss_feed_item_categories category
        SET topic_id = COALESCE(candidates.requested_topic_id, category.topic_id),
            topic_alias_id = COALESCE(candidates.requested_topic_alias_id, category.topic_alias_id)
        -- Keep the locked pairs together and use their keys for target index probes.
        FROM unnest(ARRAY(SELECT candidates FROM candidates)) AS candidates(
          rss_feed_item_id uuid,
          category_identity_id uuid,
          previous_topic_id uuid,
          previous_topic_alias_id uuid,
          requested_topic_id uuid,
          requested_topic_alias_id uuid
        )
        WHERE category.rss_feed_item_id = candidates.rss_feed_item_id
          AND category.category_identity_id = candidates.category_identity_id
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
