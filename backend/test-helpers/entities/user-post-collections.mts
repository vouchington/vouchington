import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export interface TestSavedPostCollection {
  visiblePostIds: string[]
  filteredPostId: string
  filteredPostIds: string[]
}

/**
 * Seed a saved-post collection with newer rows that the collection query must
 * filter before applying its page limit. The fixture writes posts, approval
 * changes, slugs, and relations in one CTE to keep pool use bounded.
 */
export async function insertTestSavedPostCollection(options: {
  ownerId: string
  visibleCount?: number
  newerFilteredCount?: number
  slugPrefix?: string
}): Promise<TestSavedPostCollection> {
  const visibleCount = options.visibleCount ?? 101
  if (!Number.isInteger(visibleCount) || visibleCount < 1) {
    throw new Error('visibleCount must be a positive integer')
  }
  const newerFilteredCount = options.newerFilteredCount ?? 1
  if (!Number.isInteger(newerFilteredCount) || newerFilteredCount < 1) {
    throw new Error('newerFilteredCount must be a positive integer')
  }
  const slugPrefix = options.slugPrefix ?? `saved-lifecycle-${options.ownerId}`
  const baseTime = Date.UTC(2026, 0, 1, 0, 0, 0)
  const visiblePostIds = Array.from({ length: visibleCount }, (_, index) =>
    uuidv7({ msecs: baseTime + index * 1_000 }),
  )
  const filteredPostIds = Array.from({ length: newerFilteredCount }, (_, index) =>
    uuidv7({ msecs: baseTime + (visibleCount + index + 1) * 1_000 }),
  )
  const allPostIds = [...visiblePostIds, ...filteredPostIds]
  const titles = [
    ...visiblePostIds.map((_, index) => `Saved lifecycle post ${index + 1}`),
    ...filteredPostIds.map((_, index) => `Filtered saved lifecycle post ${index + 1}`),
  ]
  const slugs = [
    ...visiblePostIds.map((_, index) => `${slugPrefix}-${index + 1}`),
    ...filteredPostIds.map((_, index) => `${slugPrefix}-filtered-${index + 1}`),
  ]
  const markdowns = [...titles]
  await write(sql`/* insertTestSavedPostCollection */
    WITH source AS (
      SELECT * FROM unnest(
        ${allPostIds}::uuid[], ${titles}::text[], ${slugs}::text[], ${markdowns}::text[]
      ) AS row(id, title, slug, markdown)
    ), posts_inserted AS (
      INSERT INTO posts (
        id, post_type, title, markdown, created_by_id,
        bedrock_nova_multimodal_v1_content_sha256,
        openai_omni_moderation_content_sha256, llm_moderation_content_sha256
      )
      SELECT id, (CASE WHEN id = ANY(${filteredPostIds}::uuid[]) THEN 'topic_recommendation' ELSE 'discussion' END)::post_types,
        title, markdown, ${options.ownerId}::uuid,
        ${`\\x${'0'.repeat(64)}`}, ${`\\x${'0'.repeat(64)}`}, ${`\\x${'0'.repeat(64)}`}
      FROM source
      RETURNING id
    ), clearance AS (
      INSERT INTO post_clearance_changes (post_id, change_type, changed_by_id)
      SELECT id, 'approve', ${options.ownerId}::uuid FROM posts_inserted
      RETURNING id, post_id, created_at
    ), approved AS (
      UPDATE posts SET latest_clearance_change_id = clearance.id, approved_at = clearance.created_at
      FROM clearance WHERE posts.id = clearance.post_id
    ), inserted_slugs AS (
      INSERT INTO post_slugs (post_id, slug) SELECT id, slug FROM source
    )
    INSERT INTO relation__user__save__post (subject_id, object_id)
    SELECT ${options.ownerId}::uuid, id FROM source
    ON CONFLICT DO NOTHING
  `)
  return { visiblePostIds, filteredPostId: filteredPostIds[0]!, filteredPostIds }
}
