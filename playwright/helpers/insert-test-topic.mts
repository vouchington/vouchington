import { write } from '../../backend/data-stores/psql/clients.mts'
import { getTopicTypeSlug } from '../../backend/types/entities/topic.mts'

// Test user ID from seed data
const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'
const ZERO_SHA = Buffer.alloc(32)

/**
 * Insert a test topic with spending category support.
 * Uses topic_type='topic' by default to avoid type-specific table requirements (e.g. topics__cards).
 * Returns { id, urlSlug } where urlSlug is the URL path segment (e.g. 'source' for 'rss_feed').
 */
export async function insertTestTopic(
  name: string,
  slug: string,
  topicType = 'topic',
  flags: { noindex?: boolean; allowReviews?: boolean } = {},
): Promise<{ id: string; urlSlug: string }> {
  // Handle both uniqueness constraints atomically:
  // - slug conflict: update name in-place (publisher type re-seeding on dirty DB)
  // - name conflict: update slug in-place (fixed-name topics re-inserted with fresh slugs)
  const result = await write(
    `WITH
     slug_match AS (
       UPDATE topics SET name = $1, topic_type = $3
       WHERE slug = $2
       RETURNING id
     ),
     name_match AS (
       UPDATE topics SET slug = $2, topic_type = $3
       WHERE LOWER(name) = LOWER($1) AND NOT EXISTS (SELECT 1 FROM slug_match)
       RETURNING id
     ),
     ins AS (
       INSERT INTO topics (name, slug, topic_type, created_by_id, bedrock_nova_multimodal_v1_content_sha256)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (SELECT 1 FROM slug_match) AND NOT EXISTS (SELECT 1 FROM name_match)
       ON CONFLICT DO NOTHING
       RETURNING id
     )
     SELECT id FROM ins
     UNION ALL SELECT id FROM slug_match
     UNION ALL SELECT id FROM name_match
     LIMIT 1`,
    [name, slug, topicType, TEST_USER_ID, ZERO_SHA],
  )
  // ON CONFLICT DO NOTHING suppresses errors but the CTE snapshot predates a concurrent
  // winner's insert; read the row they inserted in a fresh statement.
  // Cover both races: slug-conflict (same slug, name updated) and name-conflict
  // (same name, different fresh slug) by checking slug OR normalized name.
  const id = (result.rows[0]?.id ??
    (
      await write(`SELECT id FROM topics WHERE slug = $1 OR LOWER(name) = LOWER($2) LIMIT 1`, [
        slug,
        name,
      ])
    ).rows[0].id) as string
  if (flags.noindex !== undefined || flags.allowReviews !== undefined) {
    await write(`UPDATE topics SET noindex = $2, allow_reviews = $3 WHERE id = $1`, [
      id,
      flags.noindex ?? false,
      flags.allowReviews ?? true,
    ])
  }
  await write(
    `INSERT INTO topic_metrics (topic_id) VALUES ($1) ON CONFLICT (topic_id) DO NOTHING`,
    [id],
  )
  if (topicType === 'topic') {
    await write(
      `INSERT INTO topics__spending_categories (topic_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [id],
    )
  }
  return { id, urlSlug: getTopicTypeSlug(topicType) }
}
