import type { QueryOptions } from '@data-stores/psql/types'
import { addUrl } from '@services/urls'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import type { EntityRelation } from '@services/entity-relations/upsert-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import type { Topic } from '@services/topics/types'
import type { PrivateUser } from '@voucha/types/entities/user'
import assert from 'http-assert'
import sql from 'sql-template-strings'

const landingPageRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'topic',
  objectType: 'url',
  predicate: 'landing_page',
})

export async function createTopicRecommendationLinkRelation(
  currentUser: PrivateUser,
  topic: Topic,
  hostname: { id: string; hostname: string },
  options: QueryOptions,
): Promise<{ relation: EntityRelation | null; urlId: string | null }> {
  assert(options.query, 500, 'Query options are required')

  const existingRelationQuery = await options.query(sql`/* createTopicRecommendationLinkRelation */
    SELECT rel.subject_id
    FROM relation__topic__landing_page__url rel
    JOIN urls u ON u.id = rel.object_id
    WHERE rel.deleted_at IS NULL
      AND u.hostname_id = ${hostname.id}
      AND rel.subject_id <> ${topic.id}
    LIMIT 1
  `)

  const existingTopicId = existingRelationQuery.rows[0]?.subject_id as string | undefined
  assert(
    !existingTopicId,
    422,
    `Hostname ${hostname.hostname} is already associated with another topic`,
  )

  const url = await addUrl(currentUser.id, `https://${hostname.hostname}/`, {
    query: options.query,
    skipCreatedEvents: true,
  })
  if (!url) return { relation: null, urlId: null }

  const relations = await writeEntityRelations(
    landingPageRelation,
    currentUser,
    [{ subject: topic, object: url }],
    { query: options.query, vote: false },
  )

  return { relation: relations[0] ?? null, urlId: url.id }
}
