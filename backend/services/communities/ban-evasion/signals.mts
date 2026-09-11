import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import onError from '@modules/on-error'
import { getMaxUUIDv7ForDate } from '@modules/utils/ids'
import {
  BAN_EVASION_BAN_LOOKBACK_DAYS,
  BAN_EVASION_EMBEDDING_SIMILARITY_THRESHOLD,
} from './config.mts'
import type { BanEvasionSignalResult } from './types.mts'

function getBanLookbackId(): string {
  return getMaxUUIDv7ForDate(
    new Date(Date.now() - BAN_EVASION_BAN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
  )
}

export async function checkEmbeddingSimilarityToBannedPosts(
  communityId: string,
  candidateUserId: string,
  triggeringPostId?: string,
): Promise<BanEvasionSignalResult> {
  try {
    const query = sql`
      /* checkEmbeddingSimilarityToBannedPosts */
      SELECT
        banned_posts.created_by_id AS source_user_id,
        MAX(1 - (candidate_posts.bedrock_nova_multimodal_v1_embedding <=> banned_posts.bedrock_nova_multimodal_v1_embedding)) AS similarity
      FROM posts candidate_posts
      JOIN community_bans cb
        ON cb.community_id = ${communityId}
        AND cb.lifted_at IS NULL
        AND (cb.expires_at IS NULL OR cb.expires_at > NOW())
        AND cb.id > ${getBanLookbackId()}::uuid
      JOIN posts banned_posts
        ON banned_posts.created_by_id = cb.user_id
        AND banned_posts.community_id = ${communityId}
        AND banned_posts.bedrock_nova_multimodal_v1_embedding IS NOT NULL
        AND banned_posts.deleted_at IS NULL
      WHERE candidate_posts.created_by_id = ${candidateUserId}
        AND candidate_posts.bedrock_nova_multimodal_v1_embedding IS NOT NULL
        AND candidate_posts.deleted_at IS NULL
        AND candidate_posts.community_id = ${communityId}`
    if (triggeringPostId) {
      query.append(sql` AND candidate_posts.id = ${triggeringPostId}`)
    }
    query.append(sql`
      GROUP BY banned_posts.created_by_id
      ORDER BY similarity DESC
      LIMIT 1
    `)
    const { rows } = await read<{ source_user_id: string; similarity: number }>(query)

    if (rows.length === 0 || rows[0]!.similarity < BAN_EVASION_EMBEDDING_SIMILARITY_THRESHOLD) {
      return { matched: false, score: 0 }
    }

    return {
      matched: true,
      score: rows[0]!.similarity,
      sourceUserId: rows[0]!.source_user_id,
    }
  } catch (err) {
    // pgvector or embedding column may be unavailable — log and treat as no match so
    // the other two signals can still contribute to the combined score.
    onError(err instanceof Error ? err : new Error(String(err)))
    return { matched: false, score: 0 }
  }
}

export async function checkContentHashMatchToBannedPosts(
  communityId: string,
  candidateUserId: string,
  triggeringPostId?: string,
): Promise<BanEvasionSignalResult> {
  const query = sql`
    /* checkContentHashMatchToBannedPosts */
    SELECT banned_posts.created_by_id AS source_user_id
    FROM posts candidate_posts
    JOIN community_bans cb
      ON cb.community_id = ${communityId}
      AND cb.lifted_at IS NULL
      AND (cb.expires_at IS NULL OR cb.expires_at > NOW())
      AND cb.id > ${getBanLookbackId()}::uuid
    JOIN posts banned_posts
      ON banned_posts.created_by_id = cb.user_id
      AND banned_posts.community_id = ${communityId}
      AND banned_posts.openai_omni_moderation_content_sha256 IS NOT NULL
      AND banned_posts.openai_omni_moderation_content_sha256 = candidate_posts.openai_omni_moderation_content_sha256
      AND banned_posts.deleted_at IS NULL
    WHERE candidate_posts.created_by_id = ${candidateUserId}
      AND candidate_posts.openai_omni_moderation_content_sha256 IS NOT NULL
      AND candidate_posts.deleted_at IS NULL
      AND candidate_posts.community_id = ${communityId}`
  if (triggeringPostId) {
    query.append(sql` AND candidate_posts.id = ${triggeringPostId}`)
  }
  query.append(sql`
    LIMIT 1
  `)
  const { rows } = await read<{ source_user_id: string }>(query)

  if (rows.length === 0) {
    return { matched: false, score: 0 }
  }

  return {
    matched: true,
    score: 1.0,
    sourceUserId: rows[0]!.source_user_id,
  }
}

export async function checkReferralLinksToBannedPosts(
  communityId: string,
  candidateUserId: string,
): Promise<BanEvasionSignalResult> {
  // Check if the candidate user shares referral program links with banned community members
  const { rows } = await read<{ source_user_id: string }>(sql`
    /* checkReferralLinksToBannedPosts */
    SELECT DISTINCT cb.user_id AS source_user_id
    FROM community_bans cb
    JOIN user_referral_program_links candidate_links
      ON candidate_links.user_id = ${candidateUserId}
      AND candidate_links.activated_at IS NOT NULL
      AND candidate_links.deactivated_at IS NULL
      AND candidate_links.deleted_at IS NULL
    JOIN user_referral_program_links banned_links
      ON banned_links.user_id = cb.user_id
      AND banned_links.referral_program_id = candidate_links.referral_program_id
      AND banned_links.url_id = candidate_links.url_id
      AND banned_links.activated_at IS NOT NULL
      AND banned_links.deactivated_at IS NULL
      AND banned_links.deleted_at IS NULL
    WHERE cb.community_id = ${communityId}
      AND cb.lifted_at IS NULL
      AND (cb.expires_at IS NULL OR cb.expires_at > NOW())
      AND cb.id > ${getBanLookbackId()}::uuid
    LIMIT 1
  `)

  if (rows.length === 0) {
    return { matched: false, score: 0 }
  }

  return {
    matched: true,
    score: 1.0,
    sourceUserId: rows[0]!.source_user_id,
  }
}
