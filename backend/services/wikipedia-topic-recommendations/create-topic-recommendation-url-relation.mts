import type { QueryOptions } from '@data-stores/psql/types'
import { addUrl } from '@services/urls'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import type { EntityRelation } from '@services/entity-relations/upsert-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import type { Topic } from '@services/topics/types'
import type { PrivateUser } from '@voucha/types/entities/user'
import assert from 'http-assert'

const landingPageRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'topic',
  objectType: 'url',
  predicate: 'landing_page',
})

export async function createTopicRecommendationUrlRelation(
  currentUser: PrivateUser,
  topic: Topic,
  url: string,
  options: QueryOptions,
): Promise<{ relation: EntityRelation | null; urlId: string | null }> {
  assert(options.query, 500, 'Query options are required')

  const addedUrl = await addUrl(currentUser.id, url, {
    query: options.query,
    skipCreatedEvents: true,
  })
  if (!addedUrl) return { relation: null, urlId: null }

  const relations = await writeEntityRelations(
    landingPageRelation,
    currentUser,
    [{ subject: topic, object: addedUrl }],
    { query: options.query, vote: false },
  )

  return { relation: relations[0] ?? null, urlId: addedUrl.id }
}
