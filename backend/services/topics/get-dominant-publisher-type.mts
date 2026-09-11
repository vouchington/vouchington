import { read } from '@data-stores/psql'
import { PUBLISHER_TYPE_SLUGS, type PublisherTypeSlug } from './publisher-type-topics.mts'
import sql from 'sql-template-strings'

export async function getDominantPublisherTypeSlug(
  topicId: string,
): Promise<PublisherTypeSlug | null> {
  const { rows } = await read(sql`/* getDominantPublisherTypeSlug */
    SELECT topics.slug
    FROM relation__topic__publisher_type__topic relations
    JOIN topics ON topics.id = relations.object_id
    WHERE relations.subject_id = ${topicId}
      AND relations.deleted_at IS NULL
      AND relations.votes_score_net > 0
      AND topics.deleted_at IS NULL
      AND topics.merged_into_topic_id IS NULL
      AND topics.slug = ANY(${PUBLISHER_TYPE_SLUGS})
    ORDER BY relations.votes_score_net DESC NULLS LAST, relations.id ASC
    LIMIT 1
  `)
  return (rows[0]?.slug as PublisherTypeSlug | undefined) ?? null
}
