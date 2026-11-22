import { write, type OwnedTransaction } from '@data-stores/psql'
import { v7 } from 'uuid'
import { openOrGetOpenCase } from './_moderation-case-support.mts'
import { insertTestCommunity } from './communities.mts'
import { createTestUserDirect } from './users-direct.mts'

export type TestSanctionKind = 'warnings' | 'suspensions' | 'bans'

const SANCTIONS = {
  warnings: { table: 'user_warnings', reference: 'user_warning_id' },
  suspensions: { table: 'user_suspensions', reference: 'user_suspension_id' },
  bans: { table: 'community_bans', reference: 'community_ban_id' },
} as const

export async function createTestRetentionSanction(kind: TestSanctionKind, occurredAt: Date) {
  const user = await createTestUserDirect()
  const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: user.id })
  const id = v7({ msecs: occurredAt.getTime() })
  if (kind === 'warnings') {
    await write(
      `/* createTestRetentionSanction.warning */
       INSERT INTO user_warnings (id, user_id, case_id, reason, revoked_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Retention test warning', $4::timestamptz)`,
      [id, user.id, caseId, occurredAt],
    )
  } else if (kind === 'suspensions') {
    await write(
      `/* createTestRetentionSanction.suspension */
       INSERT INTO user_suspensions (id, user_id, lifted_at)
       VALUES ($1::uuid, $2::uuid, $3::timestamptz)`,
      [id, user.id, occurredAt],
    )
  } else {
    const community = await insertTestCommunity({ createdById: user.id })
    await write(
      `/* createTestRetentionSanction.ban */
       INSERT INTO community_bans (id, community_id, user_id, case_id, lifted_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::timestamptz)`,
      [id, community.id, user.id, caseId, occurredAt],
    )
  }
  return { id, caseId, userId: user.id, ...SANCTIONS[kind] }
}

export async function insertTestRetentionSanctionAppeal(
  query: OwnedTransaction,
  target: Awaited<ReturnType<typeof createTestRetentionSanction>>,
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `/* insertTestRetentionSanctionAppeal */
     INSERT INTO moderation_appeals (appellant_user_id, case_id, ${target.reference}, appeal_reason, created_via)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'Retention test appeal', 'system') RETURNING id`,
    [target.userId, target.caseId, target.id],
  )
  return rows[0]!.id
}

export async function getTestRetentionSanctionAndAppeal(
  target: Awaited<ReturnType<typeof createTestRetentionSanction>>,
  appealId: string,
) {
  const { rows } = await write<{ sanction: boolean; appeal: boolean }>(
    `/* getTestRetentionSanctionAndAppeal */
     SELECT EXISTS (SELECT 1 FROM ${target.table} WHERE id = $1::uuid) AS sanction,
            EXISTS (SELECT 1 FROM moderation_appeals WHERE id = $2::uuid) AS appeal`,
    [target.id, appealId],
  )
  return rows[0]
}

export async function insertTestPendingAgentModerationVote(
  query: OwnedTransaction,
  postId: string,
  moderationId: string,
) {
  const voter = await createTestUserDirect()
  await query(
    `/* insertTestPendingAgentModerationVote */
     INSERT INTO agent_moderation_votes (post_id, agent_moderation_id, user_id, score)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 1)`,
    [postId, moderationId, voter.id],
  )
  return voter.id
}

export async function hasTestPendingAgentModerationVote(
  postId: string,
  moderationId: string,
  userId: string,
) {
  const { rows } = await write(
    `/* hasTestPendingAgentModerationVote */
     SELECT 1 FROM agent_moderation_votes
     WHERE post_id = $1::uuid AND agent_moderation_id = $2::uuid AND user_id = $3::uuid`,
    [postId, moderationId, userId],
  )
  return rows.length > 0
}

export async function insertTestRetentionReportThread(
  query: OwnedTransaction,
  reportId: string,
  communityId: string,
  resolvedAt?: Date,
) {
  const { rows } = await query<{ id: string }>(
    `/* insertTestRetentionReportThread */
     INSERT INTO conversations (channel_type, community_id, moderation_report_id, resolved_at)
     VALUES ('mod_internal', $1::uuid, $2::uuid, $3::timestamptz) RETURNING id`,
    [communityId, reportId, resolvedAt ?? null],
  )
  return rows[0]!.id
}

export async function getTestRetentionReportAndThread(reportId: string, threadId: string) {
  const { rows } = await write<{ report: boolean; thread: boolean }>(
    `/* getTestRetentionReportAndThread */
     SELECT EXISTS (SELECT 1 FROM moderation_reports WHERE id = $1::uuid) AS report,
            EXISTS (SELECT 1 FROM conversations WHERE id = $2::uuid
              AND moderation_report_id = $1::uuid AND resolved_at IS NULL AND deleted_at IS NULL) AS thread`,
    [reportId, threadId],
  )
  return rows[0]
}
