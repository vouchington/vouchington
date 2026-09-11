import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  STORY_WINDOW_DAYS,
  STORY_DISTANCE_THRESHOLD,
  STORY_CLUSTER_CANDIDATE_LIMIT,
} from '@voucha/config'
import { itemHasDiscoverableSourceSql } from '@services/rss-feeds/discoverability-sql'
import type { ClusterItemRow } from './cluster-fetch.mts'

// Canonical definition lives in @voucha/types/entities/story (avoids a
// @agents/story-clustering <-> @services/stories workspace cycle: the agent
// needs the candidate row shape but must not reach into services/stories).
import type { StoryClusterCandidateRow as CandidateRow } from '@voucha/types/entities/story'

export type { CandidateRow }

/**
 * Find up to STORY_CLUSTER_CANDIDATE_LIMIT nearest embedding neighbors within the clustering window.
 *
 * Time window is asymmetric:
 * - Candidates WITHOUT a story: symmetric ±STORY_WINDOW_DAYS from item.published_at
 * - Candidates WITH a story that has published_at: forward-only from story.published_at
 *   (item must fall within [story.published_at, story.published_at + STORY_WINDOW_DAYS])
 * - Candidates WITH a story but story has no published_at: fall back to symmetric window
 *
 * Candidates whose every source feed is clustering-suppressed (by admin flag or because
 * the owning topic score falls below the configured minimum) are excluded.
 */
export async function findClusterCandidates(
  item: ClusterItemRow,
  options: QueryOptions = {},
): Promise<CandidateRow[]> {
  const clusterEligibleFilter = itemHasDiscoverableSourceSql('c.id')

  const query = sql`/* clusterRssFeedItem */
    SELECT
      candidate.id,
      candidate.story_id,
      candidate.story_published_at,
      candidate.distance
    FROM (
      SELECT bedrock_nova_multimodal_v1_embedding AS embedding
      FROM rss_feed_items
      WHERE id = ${item.id}
      LIMIT 1
    ) source,
    LATERAL (
      SELECT
        c.id,
        c.story_id,
        s.published_at AS story_published_at,
        (c.bedrock_nova_multimodal_v1_embedding <=> source.embedding) AS distance
      FROM rss_feed_items c
      LEFT JOIN stories s ON s.id = c.story_id AND s.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
        AND c.story_locked_at IS NULL
        AND c.bedrock_nova_multimodal_v1_embedding IS NOT NULL
        AND c.id != ${item.id}
        AND `

  query.append(clusterEligibleFilter)

  query.append(sql`
        AND (
          -- Candidates without a story: symmetric ±WINDOW from item.published_at
          (c.story_id IS NULL AND c.published_at BETWEEN
            ${item.published_at}::timestamptz - (${STORY_WINDOW_DAYS} * INTERVAL '1 day')
            AND ${item.published_at}::timestamptz + (${STORY_WINDOW_DAYS} * INTERVAL '1 day')
          )
          OR
          -- Candidates with a story with published_at: forward-only window
          (c.story_id IS NOT NULL AND s.published_at IS NOT NULL AND
            ${item.published_at}::timestamptz >= s.published_at
            AND ${item.published_at}::timestamptz <= s.published_at + (${STORY_WINDOW_DAYS} * INTERVAL '1 day')
          )
          OR
          -- Candidates with a story but no story published_at: symmetric fallback
          (c.story_id IS NOT NULL AND s.published_at IS NULL AND c.published_at BETWEEN
            ${item.published_at}::timestamptz - (${STORY_WINDOW_DAYS} * INTERVAL '1 day')
            AND ${item.published_at}::timestamptz + (${STORY_WINDOW_DAYS} * INTERVAL '1 day')
          )
        )
      ORDER BY distance ASC
      LIMIT ${STORY_CLUSTER_CANDIDATE_LIMIT}
    ) candidate
    WHERE candidate.distance < ${STORY_DISTANCE_THRESHOLD}
    ORDER BY candidate.distance ASC
  `)

  const { rows } = await read(query, options)
  return rows as CandidateRow[]
}
