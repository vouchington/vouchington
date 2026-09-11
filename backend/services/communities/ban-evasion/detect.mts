import { read, beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getPublicUserByAny } from '@services/users/get'
import { getSystemUserByUsername } from '@services/users/system-users'
import { BAN_EVASION_SYSTEM_USERNAME } from '@services/users/constants'
import { BAN_EVASION_COMBINED_SCORE_THRESHOLD, SIGNAL_WEIGHTS } from './config.mts'
import { openOrGetOpenCase } from '@services/moderation-cases'
import {
  checkContentHashMatchToBannedPosts,
  checkEmbeddingSimilarityToBannedPosts,
  checkReferralLinksToBannedPosts,
} from './signals.mts'
import type { BanEvasionDetectResult, BanEvasionSignalResult } from './types.mts'

export async function detectBanEvasionForMember(
  communityId: string,
  userId: string,
  triggeringPostId?: string,
): Promise<BanEvasionDetectResult> {
  // Check if already flagged or dismissed — skip if so (idempotent)
  const { rows: memberRows } = await read<{
    suspected_ban_evader_at: Date | null
    suspected_ban_evader_dismissed_at: Date | null
  }>(sql`/* detectBanEvasionForMember:check-existing */
    SELECT suspected_ban_evader_at, suspected_ban_evader_dismissed_at
    FROM community_members
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
      AND removed_at IS NULL
    LIMIT 1
  `)

  const member = memberRows[0]
  if (!member) {
    return { flagged: false, combinedScore: 0, sourceUserId: null }
  }

  // Already flagged or dismissed — skip
  if (
    member.suspected_ban_evader_at !== null ||
    member.suspected_ban_evader_dismissed_at !== null
  ) {
    return {
      flagged: member.suspected_ban_evader_at !== null,
      combinedScore: 0,
      sourceUserId: null,
    }
  }

  // Check if the user has any posts in this community — if not, return early
  const postExistsQuery = sql`/* detectBanEvasionForMember:check-posts */
    SELECT EXISTS (
      SELECT 1
      FROM posts
      WHERE created_by_id = ${userId}
        AND community_id = ${communityId}
        AND deleted_at IS NULL`
  if (triggeringPostId) {
    postExistsQuery.append(sql` AND id = ${triggeringPostId}`)
  }
  postExistsQuery.append(sql` LIMIT 1
    ) AS exists`)
  const { rows: postRows } = await read<{
    exists: boolean
  }>(postExistsQuery)

  if (!postRows[0]?.exists) {
    return { flagged: false, combinedScore: 0, sourceUserId: null }
  }

  // Run three signals in parallel
  const [embeddingResult, contentHashResult, referralResult] = await Promise.all([
    checkEmbeddingSimilarityToBannedPosts(communityId, userId, triggeringPostId),
    checkContentHashMatchToBannedPosts(communityId, userId, triggeringPostId),
    checkReferralLinksToBannedPosts(communityId, userId),
  ])

  // Compute combined score
  const combinedScore = Math.min(
    1.0,
    (embeddingResult.matched ? SIGNAL_WEIGHTS.embedding * embeddingResult.score : 0) +
      (contentHashResult.matched ? SIGNAL_WEIGHTS.contentHash * contentHashResult.score : 0) +
      (referralResult.matched ? SIGNAL_WEIGHTS.referralLink * referralResult.score : 0),
  )

  // Pick sourceUserId from highest-score matched signal
  const matched: Array<BanEvasionSignalResult & { weight: number }> = [
    { ...embeddingResult, weight: SIGNAL_WEIGHTS.embedding },
    { ...contentHashResult, weight: SIGNAL_WEIGHTS.contentHash },
    { ...referralResult, weight: SIGNAL_WEIGHTS.referralLink },
  ].filter(r => r.matched)

  let bestMatch: (typeof matched)[0] | undefined
  for (const item of matched) {
    if (bestMatch === undefined || item.score * item.weight > bestMatch.score * bestMatch.weight) {
      bestMatch = item
    }
  }
  const sourceUserId = bestMatch?.sourceUserId ?? null

  if (combinedScore >= BAN_EVASION_COMBINED_SCORE_THRESHOLD && sourceUserId !== null) {
    const [sourceUser, systemUser] = await Promise.all([
      getPublicUserByAny(sourceUserId),
      getSystemUserByUsername(BAN_EVASION_SYSTEM_USERNAME),
    ])
    const sourceUsername = sourceUser?.username ?? null

    if (!systemUser) {
      throw new Error(`System user '${BAN_EVASION_SYSTEM_USERNAME}' not found — run db:migrate`)
    }

    const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: userId })

    await using query = await beginTransaction()

    const options = { query }

    const { rowCount } = await write(
      sql`/* detectBanEvasionForMember:flag-member */
        UPDATE community_members
        SET suspected_ban_evader_at = CURRENT_TIMESTAMP,
            suspected_ban_evader_source_user_id = ${sourceUserId},
            suspected_ban_evader_score = ${combinedScore}
        WHERE community_id = ${communityId}
          AND user_id = ${userId}
          AND removed_at IS NULL
          AND suspected_ban_evader_at IS NULL
        `,
      options,
    )

    // Member left or was removed between signal checks and the write
    if (rowCount) {
      await write(
        sql`/* detectBanEvasionForMember:create-report */
        INSERT INTO moderation_reports (
          reporter_user_id,
          reported_user_id,
          case_id,
          reason,
          original_reason,
          moderation_transparency_community_id,
          note
        ) VALUES (
          ${systemUser.id},
          ${userId},
          ${caseId},
          'other',
          'other',
          ${communityId},
          ${`Suspected ban evasion: matches @${sourceUsername ?? sourceUserId}`}
        )
        ON CONFLICT DO NOTHING
        `,
        options,
      )
    }

    await query.commit()

    return { flagged: true, combinedScore, sourceUserId }
  }

  return { flagged: false, combinedScore, sourceUserId }
}
