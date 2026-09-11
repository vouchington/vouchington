import { write } from '@data-stores/psql'
import type { ProjectionWork } from './story-post-related-url-projection-types.mts'

export async function cleanupStaleStoryPostRelatedUrlProjectionReceipts(
  work: ProjectionWork,
  limit: number,
): Promise<number> {
  const { rowCount } = await write(
    `/* cleanupStaleStoryPostRelatedUrlProjectionReceipts */
      WITH stale AS (
        SELECT receipt.post_id, receipt.generation, receipt.url_id
        FROM story_post_related_url_projection_receipts receipt
        WHERE receipt.post_id = $1 AND receipt.generation < $2
          AND NOT (
            receipt.crawl_required IS TRUE AND receipt.effects_dispatched_at IS NULL
          )
        ORDER BY receipt.generation, receipt.url_id
        LIMIT $3
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM story_post_related_url_projection_receipts receipt
      USING stale
      WHERE receipt.post_id = stale.post_id
        AND receipt.generation = stale.generation
        AND receipt.url_id = stale.url_id
        AND EXISTS (
          SELECT 1 FROM story_post_related_url_projection_jobs work
          WHERE work.post_id = $1 AND work.generation = $2 AND work.lease_token = $4
            AND work.lease_expires_at > clock_timestamp()
        )`,
    [work.post_id, work.generation, limit, work.lease_token],
  )
  return rowCount ?? 0
}

export async function cleanupStaleStoryPostRelatedUrlProjectionRelationMutations(
  work: ProjectionWork,
  limit: number,
): Promise<number> {
  const { rowCount } = await write(
    `/* cleanupStaleStoryPostRelatedUrlProjectionRelationMutations */
      WITH stale AS (
        SELECT mutation.post_id, mutation.generation, mutation.relation_id
        FROM story_post_related_url_projection_relation_mutations mutation
        WHERE mutation.post_id = $1 AND mutation.generation < $2
        ORDER BY mutation.generation, mutation.relation_id
        LIMIT $3
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM story_post_related_url_projection_relation_mutations mutation
      USING stale
      WHERE mutation.post_id = stale.post_id
        AND mutation.generation = stale.generation
        AND mutation.relation_id = stale.relation_id
        AND EXISTS (
          SELECT 1 FROM story_post_related_url_projection_jobs work
          WHERE work.post_id = $1 AND work.generation = $2 AND work.lease_token = $4
            AND work.lease_expires_at > clock_timestamp()
        )`,
    [work.post_id, work.generation, limit, work.lease_token],
  )
  return rowCount ?? 0
}

export async function hasStaleStoryPostRelatedUrlProjectionState(
  work: ProjectionWork,
): Promise<boolean> {
  const { rows } = await write(
    `/* hasStaleStoryPostRelatedUrlProjectionState */
      SELECT 1
      FROM (
        SELECT generation FROM story_post_related_url_projection_receipts
        WHERE post_id = $1 AND generation < $2
        UNION ALL
        SELECT generation FROM story_post_related_url_projection_relation_mutations
        WHERE post_id = $1 AND generation < $2
      ) stale
      LIMIT 1`,
    [work.post_id, work.generation],
  )
  return rows.length > 0
}
