import { beginTransaction } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import { planAliasMerge } from '@vouchington/typed-entities'
import assert from 'http-assert'
import { currentUserCanMergeTopic } from './authorization.mts'
import {
  createTopicAliasMergeRevisions,
  getTopicAliasesForMergeRevision,
} from './merge-alias-revisions.mts'
import type { Topic } from './types.mts'
import { recordTopicAliasPublicationChanges } from './publication-change.mts'
import { recordTopicMergePublicationChanges } from '@services/post-publication'
import { lockTopicRssFeedAttachmentLifecycle } from '@services/post-publication/lock'
import { lockTopicMergeAliasPublicationScopes } from './alias-publication-locks.mts'
import { prepublishImageSurfaceDenial } from '@services/media-delivery-safety'
import { finalizeTopicAliasMerge } from './merge-aliases-finalize.mts'
type MergeRow = Pick<Topic, 'id' | 'slug'> & Record<'is_deleted' | 'is_merged', boolean>
export async function mergeTopicAliases(
  merger: PrivateUser,
  sourceTopic: Topic,
  destinationTopic: Topic,
) {
  assert(currentUserCanMergeTopic(merger), 403, 'Forbidden')
  assert(sourceTopic.id !== destinationTopic.id, 409, 'Cannot merge a topic into itself')
  await using query = await beginTransaction()
  // ast-grep-ignore: no-three-sequential-awaits -- alias publication, attachment lifecycle, and merge capture locks share one global order.
  const aliasScopes = await lockTopicMergeAliasPublicationScopes(
    query,
    sourceTopic.id,
    sourceTopic.slug,
  )
  await lockTopicRssFeedAttachmentLifecycle(query, sourceTopic.id)
  await recordTopicMergePublicationChanges(query, sourceTopic.id, aliasScopes.lockedAliasIds)
  await prepublishImageSurfaceDenial(
    { surfaceKind: 'topic-logo-image', topicId: sourceTopic.id },
    query,
  )
  await prepublishImageSurfaceDenial(
    { surfaceKind: 'topic-hero-image', topicId: sourceTopic.id },
    query,
  )
  // no-mistakes-disable-next-line postgres-required-predicates: lifecycle output enables precise 404/409 assertions below
  const { rows: topicRows } = await query<MergeRow>(
    `/* mergeTopicAliases lockTopics */ SELECT id, slug, deleted_at IS NOT NULL AS is_deleted, merged_into_topic_id IS NOT NULL AS is_merged FROM topics WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [[sourceTopic.id, destinationTopic.id]],
  )
  const sourceRow = topicRows.find(row => row.id === sourceTopic.id)
  const destinationRow = topicRows.find(row => row.id === destinationTopic.id)
  assert(sourceRow && !sourceRow.is_deleted, 404, 'Source topic not found')
  assert(destinationRow && !destinationRow.is_deleted, 404, 'Destination topic not found')
  assert(!sourceRow.is_merged, 409, 'Source topic has already been merged')
  assert(!destinationRow.is_merged, 409, 'Destination topic has already been merged')
  // no-mistakes-disable-next-line postgres-required-predicates: inverse lookup for topics already merged into the source
  const { rows: inboundMergeRows } = await query<{ id: string }>(
    `/* mergeTopicAliases inboundMerges */ SELECT id FROM topics WHERE merged_into_topic_id = $1 AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
    [sourceTopic.id],
  )
  assert(
    inboundMergeRows.length === 0,
    409,
    'Source topic already has merged aliases and cannot be merged again',
  )
  const { rows: sourceAliasRows } = await query<{
    id: string
    alias: string
    topic_id: string | null
  }>(
    `/* mergeTopicAliases sourceAliases */
      SELECT id, alias, topic_id
      FROM topic_aliases
      WHERE topic_id = $1 OR alias = $2
      ORDER BY alias
    `,
    [sourceTopic.id, sourceRow.slug],
  )
  assert(
    sourceAliasRows.every(alias => aliasScopes.sourceAliasIds.has(alias.id)),
    409,
    'Topic aliases changed while acquiring publication scopes; retry the request',
  )
  const sourceAliases = sourceAliasRows.map(row => row.alias)
  const candidateAliases = [sourceRow.slug, ...sourceAliases]
  const destinationAliasesBefore = await getTopicAliasesForMergeRevision(query, destinationTopic.id)
  const { rows: conflictingAliasRows } = await query<{ alias: string; topic_id: string }>(
    `/* mergeTopicAliases conflictingAliases */
      SELECT alias, topic_id
      FROM topic_aliases
      WHERE alias = ANY($1::text[])
        AND topic_id IS NOT NULL
        AND topic_id <> ALL($2::uuid[])
    `,
    [candidateAliases, [sourceTopic.id, destinationTopic.id]],
  )
  assert(
    conflictingAliasRows.length === 0,
    409,
    `Alias already belongs to another topic: ${conflictingAliasRows[0]?.alias}`,
  )
  const aliasesToMove = planAliasMerge({
    destinationId: destinationTopic.id,
    owners: [],
    sourceAliases,
    sourceId: sourceTopic.id,
    sourceSlug: sourceRow.slug,
  }).aliases.slice()
  // ast-grep-ignore: no-three-sequential-awaits -- alias mutation, publication capture, and merge writes are transactionally ordered.
  await query(
    `/* mergeTopicAliases moveAliases */
      UPDATE topic_aliases
      SET topic_id = $1, updated_by_id = $2
      WHERE topic_id = $3
    `,
    [destinationTopic.id, merger.id, sourceTopic.id],
  )
  await recordTopicAliasPublicationChanges(
    query,
    sourceAliasRows.map(alias => ({
      aliasId: alias.id,
      alias: alias.alias,
      previousTopicId: alias.topic_id,
      nextTopicId: destinationTopic.id,
    })),
  )
  await query(
    `/* mergeTopicAliases addSourceSlugAlias */
      INSERT INTO topic_aliases (topic_id, alias, created_by_id, updated_by_id)
      VALUES ($1, $2, $3, $3)
      ON CONFLICT (alias)
      DO UPDATE SET topic_id = EXCLUDED.topic_id, updated_by_id = EXCLUDED.updated_by_id
      WHERE topic_aliases.topic_id IS NULL OR topic_aliases.topic_id = $1 OR topic_aliases.topic_id = $4
    `,
    [destinationTopic.id, sourceRow.slug, merger.id, sourceTopic.id],
  )
  await query(
    `/* mergeTopicAliases markSourceMerged */
      UPDATE topics
      SET
        merged_into_topic_id = $1,
        merged_at = CURRENT_TIMESTAMP,
        merged_by_id = $2,
        updated_by_id = $2
      WHERE id = $3
    `,
    [destinationTopic.id, merger.id, sourceTopic.id],
  )
  await query(
    `/* mergeTopicAliases refreshSourceAliases */
      UPDATE topics
      SET aliases = '{}'
      WHERE id = $1
    `,
    [sourceTopic.id],
  )
  await query(
    `/* mergeTopicAliases refreshDestinationAliases */
      UPDATE topics
      SET aliases = (
        SELECT COALESCE(ARRAY_AGG(alias ORDER BY alias), '{}')
        FROM topic_aliases
        WHERE topic_id = $1
      )
      WHERE id = $1
    `,
    [destinationTopic.id],
  )
  await createTopicAliasMergeRevisions({
    query,
    revisedById: merger.id,
    sourceTopicId: sourceTopic.id,
    destinationTopicId: destinationTopic.id,
    aliasesToMove,
    destinationAliasesBefore,
  })
  const movedAliasResult = { aliases: aliasesToMove, ids: sourceAliasRows.map(row => row.id) }
  await query.commit()
  const { aliases: movedAliases, ids: movedAliasIds } = movedAliasResult
  const refreshedDestinationTopic = await finalizeTopicAliasMerge({
    merger,
    sourceTopic,
    destinationTopic,
    movedAliases,
    movedAliasIds,
  })
  return {
    source_topic_id: sourceTopic.id,
    destination_topic_id: destinationTopic.id,
    destination_topic: refreshedDestinationTopic,
    moved_aliases: movedAliases,
  }
}
