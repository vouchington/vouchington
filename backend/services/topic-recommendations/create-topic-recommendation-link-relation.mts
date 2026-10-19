import type { QueryOptions } from '@data-stores/psql/types'
import { addUrls } from '@services/urls'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import type { EntityRelation } from '@services/entity-relations/upsert-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { lockHostnameOwnership } from '@services/entity-relations/hostname-ownership-lock'
import { normalizeUrlHostname } from '@services/urls-hostnames/upsert'
import type { Topic } from '@services/topics/types'
import type { PrivateUser } from '@voucha/types/entities/user'
import assert from 'http-assert'
import sql from 'sql-template-strings'

const landingPageRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'topic',
  objectType: 'url',
  predicate: 'landing_page',
})

export type TopicRecommendationRelationWriteOptions = QueryOptions & {
  hostnameOwnershipLocked?: boolean
}

type LinkResult = { relation: EntityRelation | null; urlId: string | null }

export async function createTopicRecommendationLinkRelations(
  currentUser: PrivateUser,
  topic: Topic,
  hostnames: ReadonlyArray<{ id: string; hostname: string }>,
  options: TopicRecommendationRelationWriteOptions,
): Promise<LinkResult[]> {
  assert(options.query, 500, 'Query options are required')
  if (hostnames.length === 0) return []
  if (!options.hostnameOwnershipLocked) {
    await lockHostnameOwnership(
      options.query,
      hostnames.map(hostname => normalizeUrlHostname(hostname.hostname)),
    )
  }

  const existingRelationQuery = await options.query<{
    subject_id: string
    hostname_id: string
  }>(sql`/* createTopicRecommendationLinkRelation */
    SELECT rel.subject_id, u.hostname_id
    FROM relation__topic__landing_page__url rel
    JOIN urls u ON u.id = rel.object_id
    WHERE rel.deleted_at IS NULL
      AND u.hostname_id = ANY(${hostnames.map(hostname => hostname.id)}::uuid[])
      AND rel.subject_id <> ${topic.id}
    ORDER BY u.hostname_id
    LIMIT 1
  `)
  const conflict = existingRelationQuery.rows[0]
  if (conflict) {
    const hostname = hostnames.find(candidate => candidate.id === conflict.hostname_id)
    assert(
      false,
      422,
      `Hostname ${hostname?.hostname ?? conflict.hostname_id} is already associated with another topic`,
    )
  }

  const urls = await addUrls(
    currentUser.id,
    hostnames.map(hostname => `https://${hostname.hostname}/`),
    { query: options.query, skipCreatedEvents: true },
  )
  const urlsByHostname = new Map(
    urls.map(url => [normalizeUrlHostname(url.hostname.hostname), url]),
  )
  const pairs = hostnames.flatMap(hostname => {
    const url = urlsByHostname.get(normalizeUrlHostname(hostname.hostname))
    return url ? [{ subject: topic, object: url }] : []
  })
  const relations = await writeEntityRelations(landingPageRelation, currentUser, pairs, {
    query: options.query,
    vote: false,
    skipBlockedHostnameGuard: true,
    skipHostnameOwnershipLock: true,
  })
  const relationsByObject = new Map(relations.map(relation => [relation.object_id, relation]))
  return hostnames.map(hostname => {
    const url = urlsByHostname.get(normalizeUrlHostname(hostname.hostname)) ?? null
    return {
      relation: url ? (relationsByObject.get(url.id) ?? null) : null,
      urlId: url?.id ?? null,
    }
  })
}

export async function createTopicRecommendationLinkRelation(
  currentUser: PrivateUser,
  topic: Topic,
  hostname: { id: string; hostname: string },
  options: TopicRecommendationRelationWriteOptions,
): Promise<LinkResult> {
  const [result] = await createTopicRecommendationLinkRelations(
    currentUser,
    topic,
    [hostname],
    options,
  )
  return result ?? { relation: null, urlId: null }
}
