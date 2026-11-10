import assert from 'node:assert/strict'
import { getStoriesWorkLimit } from './work-limits.mts'
import { write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { relationLimitsMaxValues } from '@services/entity-relations/relation-limits-config'
import type { EntityRelation } from '@services/entity-relations/upsert-helpers'
import { lockPostPublicationPostScopes } from '@services/post-publication'
import type { ProjectionWork } from './story-post-related-url-projection-types.mts'
import { isStoryPostRelatedUrlProjectionWorkCurrent } from './story-post-related-url-projection-work.mts'

export async function drainPendingStoryPostRelatedUrlProjectionCrawlEffects(
  work: ProjectionWork,
): Promise<number | null> {
  const CRAWL_EFFECT_PAGE_SIZE = getStoriesWorkLimit('crawl_effect_page_size')
  const { rows } = await write<{ generation: string; url_id: string }>(
    `/* getPendingStoryPostRelatedUrlProjectionCrawlEffects */
      SELECT generation, url_id
      FROM story_post_related_url_projection_receipts
      WHERE post_id = $1 AND generation < $2
        AND should_crawl = TRUE AND effects_dispatched_at IS NULL
      ORDER BY generation, url_id
      LIMIT $3`,
    [work.post_id, work.generation, CRAWL_EFFECT_PAGE_SIZE],
  )
  if (rows.length === 0) return 0
  const crawlEntries: Array<{ urlId: string }> = []
  const generations: string[] = []
  const urlIds: string[] = []
  for (const row of rows) {
    crawlEntries.push({ urlId: row.url_id })
    generations.push(row.generation)
    urlIds.push(row.url_id)
  }
  await enqueueBulkCrawlUrls(crawlEntries)
  const { rowCount } = await write(
    `/* markRecoveredStoryPostRelatedUrlProjectionCrawlEffectsDispatched */
      UPDATE story_post_related_url_projection_receipts receipt
      SET effects_dispatched_at = CURRENT_TIMESTAMP
      FROM unnest($2::bigint[], $3::uuid[]) AS input(generation, url_id)
      WHERE receipt.post_id = $1
        AND receipt.generation = input.generation AND receipt.url_id = input.url_id
        AND receipt.should_crawl = TRUE AND receipt.effects_dispatched_at IS NULL
        AND EXISTS (
          SELECT 1 FROM story_post_related_url_projection_jobs work
          WHERE work.post_id = $1 AND work.generation = $4 AND work.lease_token = $5
            AND work.lease_expires_at > clock_timestamp()
        )`,
    [work.post_id, generations, urlIds, work.generation, work.lease_token],
  )
  return rowCount === rows.length ? rows.length : null
}

export async function lockPostScopeAndCheckProjectionWork(
  query: TransactionQuery,
  work: ProjectionWork,
): Promise<boolean> {
  await lockPostPublicationPostScopes(query, [work.post_id])
  return isStoryPostRelatedUrlProjectionWorkCurrent(work, query, true)
}

export async function lockStoryPostRelatedUrlProjectionHostnameBlocks(
  _query: TransactionQuery,
  urlIds: readonly string[],
): Promise<void> {
  assertPostRelatedUrlPrefix(urlIds.length)
}

export async function readStoryPostRelatedUrlProjectionActiveRelations(
  query: TransactionQuery,
  postId: string,
  createdById: string,
  urlIds: readonly string[],
): Promise<Array<{ id: string; object_id: string }>> {
  // A generic = ANY plan index-scans (subject_id, id) and then filters deleted rows.
  const { rows } = await query<{ id: string; object_id: string }>(
    `/* storyPostRelatedUrlProjectionActiveRelationIds */
      SELECT relation.id, relation.object_id
      FROM (SELECT DISTINCT input.id FROM unnest($3::uuid[]) AS input(id)) requested
      JOIN relation__post__related__url relation
        ON relation.subject_id = $1
       AND relation.created_by_id = $2
       AND relation.object_id = requested.id
       AND relation.deleted_at IS NULL
      ORDER BY relation.object_id
      LIMIT $4`,
    [postId, createdById, urlIds, relationLimitsMaxValues.post_related_url],
  )
  return rows
}

function assertPostRelatedUrlPrefix(count: number): void {
  assert.ok(
    count <= relationLimitsMaxValues.post_related_url,
    `post_related_url prefix has ${count} URL ids; relationLimitsMaxValues.post_related_url is ${relationLimitsMaxValues.post_related_url}`,
  )
}

export async function recordProjectionCrawlRequirements(
  query: TransactionQuery,
  work: ProjectionWork,
  relations: EntityRelation[],
  ineligibleUrlIds: ReadonlySet<string>,
): Promise<void> {
  const relationByUrlId = new Map<string, EntityRelation>()
  for (const relation of relations) relationByUrlId.set(relation.object_id, relation)
  const urlIds = [...relationByUrlId.keys(), ...ineligibleUrlIds]
  if (urlIds.length === 0) return
  const crawlRequired: boolean[] = []
  const blocked: boolean[] = []
  for (const urlId of urlIds) {
    const isBlocked = ineligibleUrlIds.has(urlId)
    blocked.push(isBlocked)
    crawlRequired.push(!isBlocked && relationByUrlId.get(urlId)?.newly_active !== false)
  }
  await query(
    `/* recordStoryPostRelatedUrlProjectionCrawlRequirements */
      UPDATE story_post_related_url_projection_receipts receipt
      SET
        is_eligible = CASE WHEN input.blocked THEN FALSE ELSE receipt.is_eligible END,
        should_crawl = COALESCE(receipt.should_crawl, input.should_crawl),
        relation_written_at = CASE
          WHEN input.blocked THEN CURRENT_TIMESTAMP
          ELSE receipt.relation_written_at
        END,
        effects_dispatched_at = CASE
          WHEN input.blocked THEN CURRENT_TIMESTAMP
          ELSE receipt.effects_dispatched_at
        END
      FROM unnest($3::uuid[], $4::boolean[], $5::boolean[])
        AS input(url_id, should_crawl, blocked)
      WHERE receipt.post_id = $1 AND receipt.generation = $2
        AND receipt.url_id = input.url_id
      RETURNING receipt.url_id`,
    [work.post_id, work.generation, urlIds, crawlRequired, blocked],
  )
}
