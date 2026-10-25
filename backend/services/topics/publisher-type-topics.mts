import { read } from '@data-stores/psql'
import {
  PUBLISHER_TYPES,
  PUBLISHER_TYPE_SLUGS,
  type PublisherTypeSlug,
} from '@ts-shared/utils/publisher-types'
import sql from 'sql-template-strings'

export { PUBLISHER_TYPE_SLUGS }
export type { PublisherTypeSlug }

export type PublisherTypeTopic = { id: string; slug: PublisherTypeSlug; label: string }

let cachedPublisherTypeTopics: PublisherTypeTopic[] | null = null

export async function getPublisherTypeTopics(): Promise<PublisherTypeTopic[]> {
  if (cachedPublisherTypeTopics) return cachedPublisherTypeTopics
  const { rows } = await read(sql`/* getPublisherTypeTopics */
    SELECT id, slug
    FROM topics
    WHERE slug = ANY(${PUBLISHER_TYPE_SLUGS})
      AND deleted_at IS NULL
      AND merged_into_topic_id IS NULL
  `)
  const labelBySlug = new Map(PUBLISHER_TYPES.map(t => [t.slug, t.label]))
  const results: PublisherTypeTopic[] = rows
    .map(row => ({
      id: row.id as string,
      slug: row.slug as PublisherTypeSlug,
      label: labelBySlug.get(row.slug as PublisherTypeSlug) ?? (row.slug as string),
    }))
    .toSorted((a, b) => PUBLISHER_TYPE_SLUGS.indexOf(a.slug) - PUBLISHER_TYPE_SLUGS.indexOf(b.slug))
  // Only cache when all publisher-type topics are present. An incomplete result indicates
  // a partially-seeded database; caching it would reject valid publisher types for the
  // lifetime of the process.
  if (results.length === PUBLISHER_TYPE_SLUGS.length) {
    cachedPublisherTypeTopics = results
  }
  return results
}
