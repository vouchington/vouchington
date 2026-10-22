import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { assessUrls } from '@services/urls/upsert'
import { persistAssessedUrls, type AssessedUrls } from '@services/urls/upsert-persist'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import type { EntityRelation } from '@services/entity-relations/upsert-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import {
  lockHostnameOwnership,
  lockTopicHostnameMutations,
} from '@services/urls-hostnames/ownership-lock'
import { normalizeUrlForUrlTable } from '@modules/utils/urls'
import type { Topic } from '@services/topics/types'
import type { PrivateUser } from '@voucha/types/entities/user'
import assert from 'http-assert'
import sql from 'sql-template-strings'

const landingPageRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'topic',
  objectType: 'url',
  predicate: 'landing_page',
})

export type TopicRecommendationRelationWriteOptions = Omit<QueryOptions, 'query'> & {
  query: TransactionQuery
  assessedUrls?: AssessedUrls
}

type LinkResult = { relation: EntityRelation | null; urlId: string | null }

export async function createTopicRecommendationRelations(
  currentUser: PrivateUser,
  topic: Topic,
  hostnames: ReadonlyArray<{ id: string; hostname: string }>,
  options: TopicRecommendationRelationWriteOptions,
  typedUrls: readonly string[] = [],
): Promise<LinkResult[]> {
  assert(options.query, 500, 'Query options are required')
  const hrefs = [...hostnames.map(hostname => `https://${hostname.hostname}/`), ...typedUrls]
  if (hrefs.length === 0) return []
  const assessed = options.assessedUrls ?? (await assessUrls(hrefs))
  // ast-grep-ignore: no-three-sequential-awaits -- topic ownership precedes resolving transaction-private hostname ids, then the resolved hostname ownership set is locked.
  await lockTopicHostnameMutations(options.query, [topic.id])
  const resolved = await upsertUrlHostnames(currentUser.id, hrefs, options, 'private_email')
  await lockHostnameOwnership(options.query, [
    ...hostnames.map(hostname => hostname.id),
    ...resolved.values(),
  ])

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

  const urls = await persistAssessedUrls(currentUser.id, assessed, {
    query: options.query,
    skipCreatedEvents: true,
  })
  const urlsByHref = new Map(urls.map(url => [url.url, url]))
  const pairs = urls.map(url => ({ subject: topic, object: url }))
  const relations = await writeEntityRelations(landingPageRelation, currentUser, pairs, {
    query: options.query,
    vote: false,
    skipBlockedHostnameGuard: true,
  })
  const relationsByObject = new Map(relations.map(relation => [relation.object_id, relation]))
  return hrefs.map(href => {
    const url = urlsByHref.get(normalizeUrlForUrlTable(href).toString()) ?? null
    return {
      relation: url ? (relationsByObject.get(url.id) ?? null) : null,
      urlId: url?.id ?? null,
    }
  })
}
