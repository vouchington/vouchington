import { read } from '@data-stores/psql'
import type { Topic } from './types.mts'

/**
 * Returns true if the slug exists in topics (any lifecycle state), because
 * idx_topics__slug is a non-partial unique index.
 */
export async function topicSlugExists(slug: string): Promise<boolean> {
  // no-mistakes-disable-next-line postgres-required-predicates: any lifecycle state is intentional, see doc comment above
  const { rows } = await read(
    `/* topicSlugExists */ SELECT 1 FROM topics WHERE slug = $1 LIMIT 1`,
    [slug.toLowerCase().trim()],
  )
  return rows.length > 0
}

/**
 * Returns true if the name exists in topics (any lifecycle state), because
 * idx_topics__name is a non-partial unique index on LOWER(name), so deleted and
 * merged topic names are still reserved and unavailable for new creates.
 */
export async function topicNameExists(name: string): Promise<boolean> {
  // no-mistakes-disable-next-line postgres-required-predicates: any lifecycle state is intentional, see doc comment above
  const { rows } = await read(
    `/* topicNameExists */ SELECT 1 FROM topics WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [name.trim()],
  )
  return rows.length > 0
}

/**
 * Case-insensitive lookup of an ACTIVE topic by name (deleted/merged excluded), so the
 * availability conflict only links to a topic page that actually exists. Use
 * `topicNameExists` separately to detect names reserved by deleted/merged topics.
 */
export async function getTopicByName(
  name: string,
): Promise<Pick<Topic, 'id' | 'name' | 'slug' | 'topic_type'> | null> {
  const { rows } = await read(
    `/* getTopicByName */
    SELECT id, name, slug, topic_type
    FROM topics
    WHERE LOWER(name) = LOWER($1)
      AND deleted_at IS NULL
      AND merged_into_topic_id IS NULL
    LIMIT 1`,
    [name.trim()],
  )
  return rows[0] ?? null
}
