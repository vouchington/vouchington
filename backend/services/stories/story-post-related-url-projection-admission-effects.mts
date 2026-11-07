import { write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { maintainBookmarkBloomForRelations } from '@services/entity-relations/bookmark-bloom-maintenance'
import { enqueueNotificationReconcileForRelations } from '@services/entity-relations/notification-reconcile'
import type { EntityRelation } from '@services/entity-relations/upsert-helpers'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { getSystemUserByUsername } from '@services/users/system-users'
import type {
  ProjectionWork,
  SourceDecision,
  SourceRow,
} from './story-post-related-url-projection-types.mts'

type StoryTeller = NonNullable<Awaited<ReturnType<typeof getSystemUserByUsername>>>

type AdmissionEffects = {
  relation: ReturnType<typeof getEntityRelationMetadataOrThrow>
  internalRelations: EntityRelation[]
}

export async function markRelationReceiptsWritten(
  transaction: TransactionQuery,
  work: ProjectionWork,
  decisions: SourceDecision[],
): Promise<boolean> {
  const urlIds: string[] = []
  for (const decision of decisions) urlIds.push(decision.url_id)
  if (urlIds.length === 0) return true
  const { rowCount } = await transaction(
    `/* markStoryPostRelatedUrlProjectionRelationsWritten */
      UPDATE story_post_related_url_projection_receipts
      SET relation_written_at = COALESCE(relation_written_at, CURRENT_TIMESTAMP)
      WHERE post_id = $1 AND generation = $2 AND url_id = ANY($3::uuid[])
        AND EXISTS (
          SELECT 1 FROM story_post_related_url_projection_jobs job
          WHERE job.post_id = $1 AND job.generation = $2 AND job.lease_token = $4
            AND job.lease_expires_at > clock_timestamp()
        )`,
    [work.post_id, work.generation, urlIds, work.lease_token],
  )
  return rowCount === urlIds.length
}

export async function publishAdmissionEffects(admitted: AdmissionEffects): Promise<void> {
  if (admitted.internalRelations.length === 0) return
  await Promise.all([
    maintainBookmarkBloomForRelations(admitted.relation, admitted.internalRelations),
    enqueueNotificationReconcileForRelations(admitted.relation, admitted.internalRelations),
  ])
}

export async function dispatchPendingCrawls(
  work: ProjectionWork,
  rows: readonly SourceRow[],
): Promise<boolean> {
  const { rows: pendingEffects } = await write<{ url_id: string }>(
    `/* storyPostRelatedUrlProjectionPendingCrawlEffects */
      SELECT url_id
      FROM story_post_related_url_projection_receipts
      WHERE post_id = $1 AND generation = $2 AND is_eligible = TRUE
        AND url_id = ANY($3::uuid[]) AND should_crawl = TRUE
        AND effects_dispatched_at IS NULL`,
    [work.post_id, work.generation, uniqueUrlIds(rows)],
  )
  const pendingEffectIds: string[] = []
  for (const row of pendingEffects) pendingEffectIds.push(row.url_id)
  if (pendingEffectIds.length === 0) return true
  await enqueueBulkCrawlUrls(pendingEffectIds.map(urlId => ({ urlId })))
  const { rowCount } = await write(
    `/* markStoryPostRelatedUrlProjectionEffectsDispatched */
      UPDATE story_post_related_url_projection_receipts SET effects_dispatched_at = CURRENT_TIMESTAMP
      WHERE post_id = $1 AND generation = $2 AND url_id = ANY($3::uuid[])
        AND should_crawl = TRUE
        AND EXISTS (
          SELECT 1 FROM story_post_related_url_projection_jobs work
          WHERE work.post_id = $1 AND work.generation = $2 AND work.lease_token = $4
            AND work.lease_expires_at > clock_timestamp()
        )`,
    [work.post_id, work.generation, pendingEffectIds, work.lease_token],
  )
  return rowCount === pendingEffectIds.length
}

export async function markProjectionWrite(query: TransactionQuery): Promise<void> {
  await query(
    `/* markStoryPostRelatedUrlProjectionRelationWrite */
      SELECT set_config('voucha.story_post_related_url_projection_write', 'true', true)`,
  )
}

export async function requireStoryTeller(): Promise<StoryTeller> {
  const storyTeller = await getSystemUserByUsername('story-teller')
  if (!storyTeller)
    throw new Error('story post URL projection: @story-teller system user not found')
  return storyTeller
}

export function uniqueUrls(rows: readonly SourceRow[]): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.url)) continue
    seen.add(row.url)
    urls.push(row.url)
  }
  return urls
}

export function uniqueUrlIds(rows: readonly SourceRow[]): string[] {
  const urlIds: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.url_id)) continue
    seen.add(row.url_id)
    urlIds.push(row.url_id)
  }
  return urlIds
}

export function admittedUrlIds(decisions: SourceDecision[]): string[] {
  const urlIds: string[] = []
  for (const decision of decisions) {
    if (decision.is_eligible) urlIds.push(decision.url_id)
  }
  return urlIds
}
