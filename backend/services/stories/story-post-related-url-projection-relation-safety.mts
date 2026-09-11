import { write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { lockReferralLinkEligibility } from '@services/entity-relations/referral-link-eligibility-lock'
import type { EntityRelation } from '@services/entity-relations/upsert-helpers'
import { lockPostPublicationPostScopes } from '@services/post-publication'
import type { ProjectionWork } from './story-post-related-url-projection-types.mts'
import { isStoryPostRelatedUrlProjectionWorkCurrent } from './story-post-related-url-projection-work.mts'

const CRAWL_EFFECT_PAGE_SIZE = 100

export async function drainPendingStoryPostRelatedUrlProjectionCrawlEffects(
  work: ProjectionWork,
  enqueue: (
    entries: Parameters<typeof enqueueBulkCrawlUrls>[0],
  ) => Promise<unknown> = enqueueBulkCrawlUrls,
): Promise<number | null> {
  const { rows } = await write<{ generation: string; url_id: string }>(
    `/* getPendingStoryPostRelatedUrlProjectionCrawlEffects */
      SELECT generation, url_id
      FROM story_post_related_url_projection_receipts
      WHERE post_id = $1 AND generation < $2
        AND crawl_required = TRUE AND effects_dispatched_at IS NULL
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
  await enqueue(crawlEntries)
  const { rowCount } = await write(
    `/* markRecoveredStoryPostRelatedUrlProjectionCrawlEffectsDispatched */
      UPDATE story_post_related_url_projection_receipts receipt
      SET effects_dispatched_at = CURRENT_TIMESTAMP
      FROM unnest($2::bigint[], $3::uuid[]) AS input(generation, url_id)
      WHERE receipt.post_id = $1
        AND receipt.generation = input.generation AND receipt.url_id = input.url_id
        AND receipt.crawl_required = TRUE AND receipt.effects_dispatched_at IS NULL
        AND EXISTS (
          SELECT 1 FROM story_post_related_url_projection_jobs work
          WHERE work.post_id = $1 AND work.generation = $4 AND work.lease_token = $5
            AND work.lease_expires_at > clock_timestamp()
        )`,
    [work.post_id, generations, urlIds, work.generation, work.lease_token],
  )
  return rowCount === rows.length ? rows.length : null
}

export async function lockProjectionEligibilityAndFindBlockedUrls(
  query: TransactionQuery,
  urlIds: readonly string[],
): Promise<Set<string>> {
  await lockReferralLinkEligibility(query, 'shared')
  return lockAndFindBlockedProjectionUrlIds(query, urlIds)
}

export async function lockPostScopeAndCheckProjectionWork(
  query: TransactionQuery,
  work: ProjectionWork,
): Promise<boolean> {
  await lockPostPublicationPostScopes(query, [work.post_id])
  return isStoryPostRelatedUrlProjectionWorkCurrent(work, query, true)
}

export async function lockAndFindBlockedProjectionUrlIds(
  query: TransactionQuery,
  urlIds: readonly string[],
): Promise<Set<string>> {
  await query(
    `/* lockStoryPostRelatedUrlProjectionHostnameBlocks */
      WITH RECURSIVE url_targets AS (
        SELECT DISTINCT hostname.hostname
        FROM urls url
        JOIN url_hostnames hostname ON hostname.id = url.hostname_id
        WHERE url.id = ANY($1::uuid[])
      ), hostname_suffixes AS (
        SELECT hostname FROM url_targets
        UNION ALL
        SELECT substring(hostname FROM position('.' IN hostname) + 1)
        FROM hostname_suffixes
        WHERE position('.' IN hostname) > 0
      ), candidates AS (
        SELECT DISTINCT candidate.id
        FROM url_hostnames candidate
        JOIN hostname_suffixes suffix ON suffix.hostname = candidate.hostname
      )
      SELECT pg_advisory_xact_lock(hashtextextended(id::text, 0))
      FROM candidates
      ORDER BY id`,
    [urlIds],
  )
  const { rows } = await query<{ url_id: string }>(
    `/* findBlockedStoryPostRelatedUrlProjectionUrls */
      WITH RECURSIVE url_targets AS (
        SELECT url.id AS url_id, hostname.hostname
        FROM urls url
        JOIN url_hostnames hostname ON hostname.id = url.hostname_id
        WHERE url.id = ANY($1::uuid[])
      ), hostname_suffixes AS (
        SELECT url_id, hostname FROM url_targets
        UNION ALL
        SELECT url_id, substring(hostname FROM position('.' IN hostname) + 1)
        FROM hostname_suffixes
        WHERE position('.' IN hostname) > 0
      )
      SELECT DISTINCT suffix.url_id
      FROM hostname_suffixes suffix
      JOIN url_hostnames candidate ON candidate.hostname = suffix.hostname
      WHERE candidate.blocked = TRUE`,
    [urlIds],
  )
  const blockedUrlIds = new Set<string>()
  for (const row of rows) blockedUrlIds.add(row.url_id)
  return blockedUrlIds
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
        eligible = CASE WHEN input.blocked THEN FALSE ELSE receipt.eligible END,
        crawl_required = COALESCE(receipt.crawl_required, input.crawl_required),
        relation_written_at = CASE
          WHEN input.blocked THEN CURRENT_TIMESTAMP
          ELSE receipt.relation_written_at
        END,
        effects_dispatched_at = CASE
          WHEN input.blocked THEN CURRENT_TIMESTAMP
          ELSE receipt.effects_dispatched_at
        END
      FROM unnest($3::uuid[], $4::boolean[], $5::boolean[])
        AS input(url_id, crawl_required, blocked)
      WHERE receipt.post_id = $1 AND receipt.generation = $2
        AND receipt.url_id = input.url_id`,
    [work.post_id, work.generation, urlIds, crawlRequired, blocked],
  )
}
