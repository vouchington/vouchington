import type { QueryExecutor } from '@data-stores/psql'
import type { ClassifierRunSubject, StoryRunCandidate } from '@services/classifier-runs'
import { itemHasDiscoverableSourceSql } from '@services/rss-feeds/discoverability-sql'
import {
  STORY_CLUSTER_CANDIDATE_LIMIT,
  STORY_DISTANCE_THRESHOLD,
  STORY_WINDOW_DAYS,
} from '@voucha/config'
import sql from 'sql-template-strings'

type SubjectRow = {
  published_at: Date
  story_id: string | null
  story_locked_at: Date | null
  is_cluster_eligible: boolean
}

type NeighborRow = { id: string; story_id: string | null }

/** The classified item, only when it can still cluster: live, embedded, unlocked and unclustered. */
async function readClusterableItem(
  query: QueryExecutor,
  rssFeedItemId: string,
): Promise<SubjectRow | null> {
  const { rows } = await query<SubjectRow>(
    sql`/* readClusterableStoryClusteringItem */
    SELECT item.published_at, item.story_id, item.story_locked_at,
      (`
      .append(itemHasDiscoverableSourceSql('item.id'))
      .append(
        sql`) AS is_cluster_eligible
    FROM rss_feed_items item
    WHERE item.id = ${rssFeedItemId} AND item.deleted_at IS NULL
      AND item.bedrock_nova_multimodal_v1_embedding IS NOT NULL`,
      ),
  )
  const item = rows[0]
  if (!item || item.story_id || item.story_locked_at || !item.is_cluster_eligible) return null
  return item
}

/**
 * The nearest embedding neighbors inside the clustering window, nearest first. The window is
 * asymmetric: a standalone neighbor must fall within the window either side of the item; a neighbor
 * in a story must have the item inside the forward window from the story's own `published_at`
 * (falling back to the symmetric window for a story without one). Neighbors whose every source feed
 * is suppressed from clustering, that are story-locked, or whose story is deleted are excluded.
 */
async function findNeighbors(
  query: QueryExecutor,
  rssFeedItemId: string,
  publishedAt: Date,
): Promise<NeighborRow[]> {
  const { rows } = await query<NeighborRow>(
    sql`/* findStoryClusteringNeighbors */
    SELECT neighbor.id, neighbor.story_id
    FROM (
      SELECT bedrock_nova_multimodal_v1_embedding AS embedding
      FROM rss_feed_items
      WHERE id = ${rssFeedItemId}
      LIMIT 1
    ) source,
    LATERAL (
      SELECT
        c.id,
        c.story_id,
        (c.bedrock_nova_multimodal_v1_embedding <=> source.embedding) AS distance
      FROM rss_feed_items c
      LEFT JOIN stories s ON s.id = c.story_id AND s.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
        AND c.story_locked_at IS NULL
        AND c.bedrock_nova_multimodal_v1_embedding IS NOT NULL
        AND c.id != ${rssFeedItemId}
        AND (c.story_id IS NULL OR s.id IS NOT NULL)
        AND `
      .append(itemHasDiscoverableSourceSql('c.id'))
      .append(
        sql`
        AND (
          (c.story_id IS NULL AND c.published_at BETWEEN
            ${publishedAt}::timestamptz - (${STORY_WINDOW_DAYS} * INTERVAL '1 day')
            AND ${publishedAt}::timestamptz + (${STORY_WINDOW_DAYS} * INTERVAL '1 day'))
          OR (c.story_id IS NOT NULL AND s.published_at IS NOT NULL
            AND ${publishedAt}::timestamptz >= s.published_at
            AND ${publishedAt}::timestamptz <= s.published_at + (${STORY_WINDOW_DAYS} * INTERVAL '1 day'))
          OR (c.story_id IS NOT NULL AND s.published_at IS NULL AND c.published_at BETWEEN
            ${publishedAt}::timestamptz - (${STORY_WINDOW_DAYS} * INTERVAL '1 day')
            AND ${publishedAt}::timestamptz + (${STORY_WINDOW_DAYS} * INTERVAL '1 day'))
        )
      ORDER BY distance ASC, c.id ASC
      LIMIT ${STORY_CLUSTER_CANDIDATE_LIMIT}
    ) neighbor
    WHERE neighbor.distance < ${STORY_DISTANCE_THRESHOLD}
    ORDER BY neighbor.distance ASC, neighbor.id ASC`,
      ),
  )
  return rows
}

/**
 * Chooses what one run asks about, once, when its receipt is first reserved, before the item's row
 * lock is taken (a pure read; the reservation keeps the result only while the item's content and
 * the classifier configuration are still the ones it was chosen for): each distinct story
 * among the nearest neighbors (its nearest member stands in for the story) and each standalone
 * neighbor. Null means there is nothing to classify, so the request settles as no work and no
 * model call is made: the item is gone, already in a story, story-locked, from no discoverable
 * source, or has no neighbor inside the window.
 */
export async function captureStoryClusteringCandidates(
  query: QueryExecutor,
  subject: ClassifierRunSubject,
): Promise<readonly StoryRunCandidate[] | null> {
  if (subject.rssFeedItemId === null) return null
  const item = await readClusterableItem(query, subject.rssFeedItemId)
  if (!item) return null
  const neighbors = await findNeighbors(query, subject.rssFeedItemId, item.published_at)
  const seenStories = new Set<string>()
  const candidates: StoryRunCandidate[] = []
  for (const neighbor of neighbors) {
    if (neighbor.story_id === null) {
      candidates.push({ kind: 'rss_feed_item', rssFeedItemId: neighbor.id })
    } else if (!seenStories.has(neighbor.story_id)) {
      seenStories.add(neighbor.story_id)
      candidates.push({ kind: 'story', storyId: neighbor.story_id })
    }
  }
  return candidates.length > 0 ? candidates : null
}
