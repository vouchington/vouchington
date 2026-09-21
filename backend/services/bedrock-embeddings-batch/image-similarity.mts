import { read } from '@data-stores/psql'

const DEFAULT_CANDIDATE_LIMIT = 20
const MAX_CANDIDATE_LIMIT = 50

export type CopyrightImageSimilarityCandidate = {
  placementId: string
  placementRevision: number
  imageId: string
  postId: string
  similarity: number
}

export type CopyrightImageSimilarityCandidates =
  | {
      availability: 'available'
      candidates: CopyrightImageSimilarityCandidate[]
      sourceImageId: string
    }
  | {
      availability: 'unavailable'
      candidates: []
      sourceImageId: string | null
    }

/**
 * Returns staff-only advisory placement candidates for one exact notice target.
 * The source embedding never leaves PostgreSQL or this service boundary.
 */
export async function findCopyrightImageSimilarityCandidates(input: {
  noticeId: string
  targetId: string
  limit?: number
}): Promise<CopyrightImageSimilarityCandidates> {
  const limit = normalizeCandidateLimit(input.limit)
  const source = await getSourceImageEmbeddingState(input.noticeId, input.targetId)
  if (!source?.has_embedding) {
    return {
      availability: 'unavailable',
      candidates: [],
      sourceImageId: source?.image_id ?? null,
    }
  }

  const { rows } = await read<CandidateRow>(
    `/* findCopyrightImageSimilarityCandidates */
    WITH source AS (
      SELECT target.placement_key, image.bedrock_nova_multimodal_v1_embedding AS embedding
      FROM copyright_notice_targets target
      JOIN copyright_notice_target_images target_image
        ON target_image.copyright_notice_target_id = target.id
      JOIN images image ON image.id = target_image.image_id
      WHERE target.id = $1
        AND target.copyright_notice_id = $2
        AND image.bedrock_nova_multimodal_v1_embedding IS NOT NULL
    )
    SELECT placement.id AS placement_id,
      placement.revision AS placement_revision,
      image_placement.image_id,
      image_placement.post_id,
      1 - (image.bedrock_nova_multimodal_v1_embedding <=> source.embedding) AS similarity
    FROM source
    CROSS JOIN media_placements placement
    JOIN image_placements image_placement ON image_placement.placement_id = placement.id
    JOIN images image ON image.id = image_placement.image_id
    JOIN posts post ON post.id = image_placement.post_id
    WHERE placement.placement_kind = 'image'
      AND placement.retired_at IS NULL
      AND placement.copyright_withheld_at IS NULL
      AND concat('image-placement:', placement.id) <> source.placement_key
      AND image.deleted_at IS NULL
      AND image.upload_completed_at IS NOT NULL
      AND image.quarantine_pending_at IS NULL
      AND image.quarantined_at IS NULL
      AND image.openai_omni_moderation_flagged IS FALSE
      AND image.bedrock_nova_multimodal_v1_embedding IS NOT NULL
      AND post.deleted_at IS NULL
    ORDER BY similarity DESC, placement.id ASC
    LIMIT $3`,
    [input.targetId, input.noticeId, limit],
  )
  return {
    availability: 'available',
    sourceImageId: source.image_id,
    candidates: rows.map(row => ({
      placementId: row.placement_id,
      placementRevision: row.placement_revision,
      imageId: row.image_id,
      postId: row.post_id,
      similarity: Number(row.similarity),
    })),
  }
}

type SourceImageEmbeddingState = {
  image_id: string
  has_embedding: boolean
}

type CandidateRow = {
  placement_id: string
  placement_revision: number
  image_id: string
  post_id: string
  similarity: number | string
}

async function getSourceImageEmbeddingState(
  noticeId: string,
  targetId: string,
): Promise<SourceImageEmbeddingState | null> {
  const { rows } = await read<SourceImageEmbeddingState>(
    `/* getCopyrightImageSimilaritySource */
    SELECT image.id AS image_id,
      image.bedrock_nova_multimodal_v1_embedding IS NOT NULL AS has_embedding
    FROM copyright_notice_targets target
    JOIN copyright_notice_target_images target_image
      ON target_image.copyright_notice_target_id = target.id
    JOIN images image ON image.id = target_image.image_id
    WHERE target.id = $1 AND target.copyright_notice_id = $2`,
    [targetId, noticeId],
  )
  return rows[0] ?? null
}

function normalizeCandidateLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_CANDIDATE_LIMIT
  return Math.min(Math.max(Math.floor(limit), 1), MAX_CANDIDATE_LIMIT)
}
