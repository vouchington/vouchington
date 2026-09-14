import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ClusterRow, PostIndicatorsById } from './clustered-types.mts'
import { appendUuidList } from './clustered-utils.mts'

type PostIndicatorRow = {
  id: string
  content_hash_duplicate: boolean
  embeddings_similarity: boolean
  velocity_spike: boolean
  content_hash_hex: string | null
}

export async function selectPostIndicators(clusters: ClusterRow[]): Promise<PostIndicatorsById> {
  const postIds = clusters.flatMap(cluster =>
    cluster.entity_type === 'post' ? [cluster.entity_id] : [],
  )
  if (postIds.length === 0) return new Map()
  const query = sql`/* listClusteredModerationReports:postIndicators */
    SELECT
      p.id,
      EXISTS (
        SELECT 1
        FROM post_moderation_versions version
        JOIN LATERAL (
          SELECT evidence
          FROM post_moderation_dispositions
          WHERE version_id = version.id
            AND source = 'spam_detection'
          ORDER BY id DESC
          LIMIT 1
        ) disposition ON true
        CROSS JOIN LATERAL jsonb_array_elements(
          COALESCE(disposition.evidence->'signals', '[]'::jsonb)
        ) signal
        WHERE version.post_id = p.id
          AND version.content_sha256 = p.llm_moderation_content_sha256
          AND version.policy_revision = '2026-09-09.1'
          AND signal->>'signal' = 'content_hash_duplicate'
          AND signal->>'flagged' = 'true'
      ) AS content_hash_duplicate,
      EXISTS (
        SELECT 1
        FROM post_moderation_versions version
        JOIN LATERAL (
          SELECT evidence
          FROM post_moderation_dispositions
          WHERE version_id = version.id
            AND source = 'spam_detection'
          ORDER BY id DESC
          LIMIT 1
        ) disposition ON true
        CROSS JOIN LATERAL jsonb_array_elements(
          COALESCE(disposition.evidence->'signals', '[]'::jsonb)
        ) signal
        WHERE version.post_id = p.id
          AND version.content_sha256 = p.llm_moderation_content_sha256
          AND version.policy_revision = '2026-09-09.1'
          AND signal->>'signal' = 'embeddings_similarity'
          AND signal->>'flagged' = 'true'
      ) AS embeddings_similarity,
      EXISTS (
        SELECT 1
        FROM vote_integrity_flags vif
        WHERE vif.post_id = p.id
          AND vif.flag_type = 'velocity_spike'
          AND vif.resolved_at IS NULL
      ) AS velocity_spike,
      encode(p.llm_moderation_content_sha256, 'hex') AS content_hash_hex
    FROM posts p
    WHERE p.id IN (`
  appendUuidList(query, postIds)
  query.append(sql`)
      AND p.deleted_at IS NULL`)

  const { rows } = await read<PostIndicatorRow>(query)
  return new Map(
    rows.map(row => [
      row.id,
      {
        indicators: {
          content_hash_duplicate: row.content_hash_duplicate,
          embeddings_similarity: row.embeddings_similarity,
          velocity_spike: row.velocity_spike,
        },
        contentHashHex: row.content_hash_hex,
      },
    ]),
  )
}
