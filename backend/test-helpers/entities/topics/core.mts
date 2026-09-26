import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function updateTopicMarkdown(topicId: string, markdown: string): Promise<void> {
  await write(
    sql`/* updateTopicMarkdown */ UPDATE topics SET markdown = ${markdown} WHERE id = ${topicId}`,
  )
}

export async function updateTopicName(topicId: string, name: string): Promise<void> {
  await write(sql`/* updateTopicName */ UPDATE topics SET name = ${name} WHERE id = ${topicId}`)
}

export async function insertTestTopic(data: {
  name: string
  slug: string
  createdById: string
  embeddingSha256?: string
  topicType?: string
  noindex?: boolean
  allowReviews?: boolean
  hostnameId?: string | null
  aliases?: string[]
}): Promise<string> {
  const embeddingSha256 = data.embeddingSha256 || `\\x${'0'.repeat(64)}`
  const topicType = data.topicType || 'topic'
  const noindex = data.noindex ?? false
  const allowReviews = data.allowReviews ?? true
  const hostnameId = data.hostnameId === undefined ? null : data.hostnameId
  const aliases = data.aliases ?? []
  const { rows } = await write(sql`/* insertTestTopic */
    INSERT INTO topics (name, slug, created_by_id, topic_type, noindex, allow_reviews, hostname_id, bedrock_nova_multimodal_v1_content_sha256, aliases, created_via)
    VALUES (${data.name}, ${data.slug}, ${data.createdById}, ${topicType}, ${noindex}, ${allowReviews}, ${hostnameId}, ${embeddingSha256}, ${aliases}, 'system')
    RETURNING id
  `)
  const topicId = rows[0].id
  await write(sql`/* insertTestTopic */
    INSERT INTO topic_metrics (topic_id) VALUES (${topicId})
    ON CONFLICT (topic_id) DO NOTHING
  `)
  return topicId
}

export async function insertTestTopicsAndExplicitPostCategories({
  count,
  createdById,
  postId,
  prefix,
}: {
  count: number
  createdById: string
  postId: string
  prefix: string
}): Promise<string[]> {
  const embeddingSha256 = `\\x${'0'.repeat(64)}`
  const { rows } = await write<{
    topic_id: string
  }>(sql`/* insertTestTopicsAndExplicitPostCategories */
    WITH inserted_topics AS (
      INSERT INTO topics (name, slug, created_by_id, bedrock_nova_multimodal_v1_content_sha256, created_via)
      SELECT
        ${prefix} || ' topic ' || series.ordinal,
        ${prefix} || '-topic-' || series.ordinal,
        ${createdById},
        ${embeddingSha256},
        'system'
      FROM generate_series(1, ${count}) AS series(ordinal)
      RETURNING id
    )
    INSERT INTO post_explicit_topic_categories (post_id, topic_id)
    SELECT ${postId}, id FROM inserted_topics
    RETURNING topic_id
  `)
  return rows.map(row => row.topic_id)
}

export async function insertTestTopicBatch(options: {
  count: number
  createdById: string
  prefix: string
}): Promise<string[]> {
  const embeddingSha256 = `\\x${'0'.repeat(64)}`
  const { rows } = await write<{ id: string }>(sql`/* insertTestTopicBatch */
    INSERT INTO topics (name, slug, created_by_id, bedrock_nova_multimodal_v1_content_sha256, created_via)
    SELECT
      ${options.prefix} || ' topic ' || series.ordinal,
      ${options.prefix} || '-topic-' || series.ordinal,
      ${options.createdById},
      ${embeddingSha256},
      'system'
    FROM generate_series(1, ${options.count}) AS series(ordinal)
    RETURNING id
  `)
  return rows.map(row => row.id)
}

export async function hardDeleteTestTopics(topicIds: readonly string[]): Promise<void> {
  if (topicIds.length === 0) return
  await write(
    sql`/* hardDeleteTestTopics */ DELETE FROM topics WHERE id = ANY(${topicIds}::uuid[])`,
  )
}

export async function getTestTopicCreatedById(topicId: string): Promise<string | null> {
  const { rows } = await read<{ created_by_id: string | null }>(sql`/* getTestTopicCreatedById */
    SELECT created_by_id FROM topics WHERE id = ${topicId}
  `)
  return rows[0]?.created_by_id ?? null
}

export async function getTestTopicAliasRowVersion(aliasId: string): Promise<string> {
  const { rows } = await write<{ row_version: string }>(sql`/* getTestTopicAliasRowVersion */
    SELECT xmin::text AS row_version
    FROM topic_aliases
    WHERE id = ${aliasId}
  `)
  return rows[0]!.row_version
}

// Reads the generated search_vector column directly: no service queries topics.search_vector
// via FTS today (topic listing/tool search use plain name/slug ILIKE), so this is the only way
// to assert the voucha_english config folds diacritics on the generated-column write path.
export async function topicSearchVectorMatchesQuery(
  topicId: string,
  query: string,
): Promise<boolean> {
  const { rows } = await read<{ matches: boolean }>(sql`/* topicSearchVectorMatchesQuery */
    SELECT search_vector @@ websearch_to_tsquery('voucha_english', ${query}) AS matches
    FROM topics
    WHERE id = ${topicId}
  `)
  return rows[0]?.matches ?? false
}

export async function hasUniqueSlugIndexOnTopics(): Promise<boolean> {
  const { rows } = await read(sql`/* hasUniqueSlugIndexOnTopics */
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = CURRENT_SCHEMA()
      AND tablename = 'topics'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%ON%topics%(slug)%'
      AND indexdef NOT ILIKE '%LOWER%'
  `)
  return rows.length > 0
}

export async function addSpendingCategoryToTopic(topicId: string): Promise<string> {
  const { rows } = await write(sql`/* addSpendingCategoryToTopic */
    INSERT INTO topics__spending_categories (topic_id)
    VALUES (${topicId})
    RETURNING topic_id
  `)
  return rows[0].topic_id
}
