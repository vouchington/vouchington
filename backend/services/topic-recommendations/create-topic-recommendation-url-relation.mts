import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { addUrls } from '@services/urls'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import type { EntityRelation } from '@services/entity-relations/upsert-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { lockHostnameOwnership } from '@services/entity-relations/hostname-ownership-lock'
import { normalizeUrlHostname } from '@services/urls-hostnames/upsert'
import type { Topic } from '@services/topics/types'
import type { PrivateUser } from '@voucha/types/entities/user'
import assert from 'http-assert'

const landingPageRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'topic',
  objectType: 'url',
  predicate: 'landing_page',
})

type UrlRelationOptions = Omit<QueryOptions, 'query'> & {
  query: TransactionQuery
  hostnameOwnershipLocked?: boolean
}
type UrlRelationResult = { relation: EntityRelation | null; urlId: string | null }

export async function createTopicRecommendationUrlRelations(
  currentUser: PrivateUser,
  topic: Topic,
  urls: readonly string[],
  options: UrlRelationOptions,
): Promise<UrlRelationResult[]> {
  assert(options.query, 500, 'Query options are required')
  if (urls.length === 0) return []
  if (!options.hostnameOwnershipLocked) {
    await lockHostnameOwnership(
      options.query,
      urls.map(url => normalizeUrlHostname(url)),
    )
  }

  const addedUrls = await addUrls(currentUser.id, [...urls], {
    query: options.query,
    skipCreatedEvents: true,
  })
  const relations = await writeEntityRelations(
    landingPageRelation,
    currentUser,
    addedUrls.map(url => ({ subject: topic, object: url })),
    {
      query: options.query,
      vote: false,
      skipBlockedHostnameGuard: true,
      skipHostnameOwnershipLock: true,
    },
  )
  const relationsByObject = new Map(relations.map(relation => [relation.object_id, relation]))
  return addedUrls.map(url => ({
    relation: relationsByObject.get(url.id) ?? null,
    urlId: url.id,
  }))
}

export async function createTopicRecommendationUrlRelation(
  currentUser: PrivateUser,
  topic: Topic,
  url: string,
  options: UrlRelationOptions,
): Promise<UrlRelationResult> {
  const [result] = await createTopicRecommendationUrlRelations(currentUser, topic, [url], options)
  return result ?? { relation: null, urlId: null }
}
