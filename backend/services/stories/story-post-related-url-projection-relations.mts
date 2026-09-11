import { beginTransaction, write } from '@data-stores/psql'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { assertPostRelatedUrlsAllowed } from '@services/entity-relations/assert-post-related-urls-allowed'
import { maintainBookmarkBloomForRelations } from '@services/entity-relations/bookmark-bloom-maintenance'
import { enqueueNotificationReconcileForRelations } from '@services/entity-relations/notification-reconcile'
import { recordPostRelatedUrlPublicationChanges } from '@services/entity-relations/post-topic-publication'
import { handleElectionVotes } from '@services/entity-relations/upsert-helpers'
import { insertPrevalidatedPostRelatedUrlEntityRelationsInTransaction } from '@services/entity-relations/write-relations'
import '@services/elections-votes/entity-relation/register-election-vote-handler'
import '@services/posts/register-post-related-urls-guard'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { getSystemUserByUsername } from '@services/users/system-users'
import { containsReferralLinks } from '@services/referral-program-link-validations/contains-referral-links'
import { markStoryPostRelatedUrlProjectionInvalidationRequired } from './story-post-related-url-projection-invalidation.mts'
import {
  lockPostScopeAndCheckProjectionWork,
  lockProjectionEligibilityAndFindBlockedUrls,
  recordProjectionCrawlRequirements,
} from './story-post-related-url-projection-relation-safety.mts'
import type { ProjectionWork, SourceRow } from './story-post-related-url-projection-types.mts'
import { isStoryPostRelatedUrlProjectionWorkCurrent } from './story-post-related-url-projection-work.mts'

export type StoryPostRelatedUrlProjectionRelationDependencies = {
  enqueueBulkCrawlUrls?: (entries: Parameters<typeof enqueueBulkCrawlUrls>[0]) => Promise<unknown>
}

export async function writeStoryPostRelatedUrlProjectionRelations(
  work: ProjectionWork,
  rows: SourceRow[],
  dependencies: StoryPostRelatedUrlProjectionRelationDependencies = {},
): Promise<boolean> {
  const { rows: pendingRows } = await write<{
    url_id: string
    relation_written_at: Date | null
    crawl_required: boolean | null
    effects_dispatched_at: Date | null
  }>(
    `/* storyPostRelatedUrlProjectionPendingRelationEffects */
      SELECT url_id, relation_written_at, crawl_required, effects_dispatched_at
      FROM story_post_related_url_projection_receipts
      WHERE post_id = $1 AND generation = $2 AND eligible = TRUE
        AND url_id = ANY($3::uuid[])
        AND (
          relation_written_at IS NULL OR
          (crawl_required = TRUE AND effects_dispatched_at IS NULL)
        )`,
    [work.post_id, work.generation, sourceRowUrlIds(rows)],
  )
  if (pendingRows.length === 0) return isStoryPostRelatedUrlProjectionWorkCurrent(work)
  const pendingRelationIds = new Set<string>()
  for (const row of pendingRows) {
    if (row.relation_written_at === null) pendingRelationIds.add(row.url_id)
  }
  const relationRows: SourceRow[] = []
  for (const row of rows) {
    if (pendingRelationIds.has(row.url_id)) relationRows.push(row)
  }
  if (relationRows.length > 0 && !(await writePendingRelations(work, relationRows))) return false

  const { rows: pendingEffects } = await write<{ url_id: string }>(
    `/* storyPostRelatedUrlProjectionPendingCrawlEffects */
      SELECT url_id
      FROM story_post_related_url_projection_receipts
      WHERE post_id = $1 AND generation = $2 AND eligible = TRUE
        AND url_id = ANY($3::uuid[]) AND crawl_required = TRUE
        AND effects_dispatched_at IS NULL`,
    [work.post_id, work.generation, sourceRowUrlIds(rows)],
  )
  const pendingEffectIds: string[] = []
  for (const row of pendingEffects) pendingEffectIds.push(row.url_id)
  if (pendingEffectIds.length > 0) {
    await (dependencies.enqueueBulkCrawlUrls ?? enqueueBulkCrawlUrls)(
      crawlEntriesForUrlIds(pendingEffectIds),
    )
    const { rowCount } = await write(
      `/* markStoryPostRelatedUrlProjectionEffectsDispatched */
        UPDATE story_post_related_url_projection_receipts SET effects_dispatched_at = CURRENT_TIMESTAMP
        WHERE post_id = $1 AND generation = $2 AND url_id = ANY($3::uuid[])
          AND crawl_required = TRUE
          AND EXISTS (
            SELECT 1 FROM story_post_related_url_projection_jobs work
            WHERE work.post_id = $1 AND work.generation = $2 AND work.lease_token = $4
              AND work.lease_expires_at > clock_timestamp()
          )`,
      [work.post_id, work.generation, pendingEffectIds, work.lease_token],
    )
    if (rowCount !== pendingEffectIds.length) return false
  }
  return true
}

async function writePendingRelations(work: ProjectionWork, rows: SourceRow[]): Promise<boolean> {
  const storyTeller = await getSystemUserByUsername('story-teller')
  if (!storyTeller)
    throw new Error('story post URL projection: @story-teller system user not found')
  const relation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'url',
    predicate: 'related',
  })
  const creator = {
    __entity_type: 'user' as const,
    id: storyTeller.id,
    username: storyTeller.username,
    roles: [],
    use_display_name_from: storyTeller.use_display_name_from,
  } as never
  const objects: Array<{ id: string }> = []
  for (const row of rows) objects.push({ id: row.url_id })
  await assertPostRelatedUrlsAllowed(creator, relation, { id: work.post_id }, objects)
  await using transactionQuery = await beginTransaction()
  await transactionQuery(
    `/* markStoryPostRelatedUrlProjectionRelationWrite */
        SELECT set_config('voucha.story_post_related_url_projection_write', 'true', true)`,
  )
  const blockedUrlIds = await lockProjectionEligibilityAndFindBlockedUrls(
    transactionQuery,
    sourceRowUrlIds(rows),
  )
  if (!(await lockPostScopeAndCheckProjectionWork(transactionQuery, work))) return false
  const sourceUrls: string[] = []
  for (const row of rows) sourceUrls.push(row.url)
  const { matched_urls: referralMatches } = await containsReferralLinks(sourceUrls, {
    query: transactionQuery,
  })
  const referralUrls = new Set<string>()
  for (const match of referralMatches) referralUrls.add(match.url)
  const ineligibleUrlIds = new Set(blockedUrlIds)
  for (const row of rows) {
    if (referralUrls.has(row.url)) ineligibleUrlIds.add(row.url_id)
  }
  const allowedUrlIds: string[] = []
  for (const object of objects) {
    if (!ineligibleUrlIds.has(object.id)) allowedUrlIds.push(object.id)
  }
  const internalRelations = await insertPrevalidatedPostRelatedUrlEntityRelationsInTransaction(
    transactionQuery,
    creator,
    work.post_id,
    allowedUrlIds,
  )
  const newlyActiveSubjectIds: string[] = []
  for (const row of internalRelations) {
    if (row.newly_active !== false) newlyActiveSubjectIds.push(row.subject_id)
  }
  await handleElectionVotes(creator, relation, internalRelations, { query: transactionQuery })
  await recordPostRelatedUrlPublicationChanges(transactionQuery, newlyActiveSubjectIds)
  if (newlyActiveSubjectIds.length > 0)
    await markStoryPostRelatedUrlProjectionInvalidationRequired(transactionQuery, work)
  await recordProjectionCrawlRequirements(
    transactionQuery,
    work,
    internalRelations,
    ineligibleUrlIds,
  )
  await transactionQuery.commit()
  await Promise.all([
    maintainBookmarkBloomForRelations(relation, internalRelations),
    enqueueNotificationReconcileForRelations(relation, internalRelations),
  ])
  const { rowCount } = await write(
    `/* markStoryPostRelatedUrlProjectionRelationsWritten */
      UPDATE story_post_related_url_projection_receipts SET relation_written_at = CURRENT_TIMESTAMP
      WHERE post_id = $1 AND generation = $2 AND url_id = ANY($3::uuid[])
        AND EXISTS (
          SELECT 1 FROM story_post_related_url_projection_jobs work
          WHERE work.post_id = $1 AND work.generation = $2 AND work.lease_token = $4
            AND work.lease_expires_at > clock_timestamp()
        )`,
    [work.post_id, work.generation, sourceRowUrlIds(rows), work.lease_token],
  )
  return rowCount === rows.length
}

function sourceRowUrlIds(rows: SourceRow[]): string[] {
  const urlIds: string[] = []
  for (const row of rows) urlIds.push(row.url_id)
  return urlIds
}

function crawlEntriesForUrlIds(urlIds: string[]): Array<{ urlId: string }> {
  const entries: Array<{ urlId: string }> = []
  for (const urlId of urlIds) entries.push({ urlId })
  return entries
}
