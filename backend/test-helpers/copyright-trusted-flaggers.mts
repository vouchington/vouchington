import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PrivateUser } from '../services/users/types.mts'
import {
  createCopyrightTrustedFlagger,
  type CopyrightTrustedFlagger,
  type CreateCopyrightTrustedFlaggerInput,
} from '../services/copyright-notices/trusted-flaggers.mts'
import {
  inAreaTrustedFlaggerMatchSql,
  recordCopyrightTrustedFlaggerMatch,
} from '../services/copyright-notices/trusted-flagger-match.mts'

/** A fresh entry with an award predating today's test receipt. */
export async function createTestCopyrightTrustedFlagger(
  administrator: PrivateUser,
  userId: string,
  areaOfExpertise: 'intellectual_property' | 'other' = 'intellectual_property',
  overrides: Partial<CreateCopyrightTrustedFlaggerInput> = {},
): Promise<CopyrightTrustedFlagger> {
  const suffix = crypto.randomUUID()
  const awardedAt = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  return createCopyrightTrustedFlagger(administrator, {
    name: `Flagger ${suffix}`,
    userId,
    awardingCoordinatorName: `Coordinator ${suffix}`,
    awardingMemberState: 'DE',
    awardedAt,
    areaOfExpertise,
    areaDescription: `Designation ${suffix}`,
    awardReference: `https://example.test/awards/${suffix}`,
    ...overrides,
  })
}

export async function readTestCopyrightTrustedFlaggerMatch(
  noticeId: string,
): Promise<{ flaggerId: string; inArea: boolean } | null> {
  const statement = sql`/* readTestCopyrightTrustedFlaggerMatch */
    SELECT match.copyright_trusted_flagger_id AS flagger_id, `
  statement.append(inAreaTrustedFlaggerMatchSql(sql`${noticeId}`))
  statement.append(sql` AS in_area
    FROM copyright_trusted_flagger_matches match
    WHERE match.copyright_notice_id = ${noticeId} LIMIT 1
  `)
  const { rows } = await read<{ flagger_id: string; in_area: boolean }>(statement)
  return rows[0] ? { flaggerId: rows[0].flagger_id, inArea: rows[0].in_area } : null
}

export async function replayTestCopyrightTrustedFlaggerMatch(noticeId: string): Promise<void> {
  await using transaction = await beginTransaction()
  await recordCopyrightTrustedFlaggerMatch(noticeId, transaction)
  await recordCopyrightTrustedFlaggerMatch(noticeId, transaction)
  await transaction.commit()
}

export async function readTestTrustedFlaggerNoticeEffects(noticeId: string): Promise<{
  hasDecision: boolean
  hasRestriction: boolean
}> {
  const { rows } = await read<{ has_decision: boolean; has_restriction: boolean }>(sql`
    /* readTestTrustedFlaggerNoticeEffects */
    SELECT EXISTS (
      SELECT 1 FROM copyright_territorial_decisions WHERE copyright_notice_id = ${noticeId}
    ) AS has_decision,
    EXISTS (
      SELECT 1 FROM copyright_restrictions restriction
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE target.copyright_notice_id = ${noticeId}
    ) AS has_restriction
  `)
  return {
    hasDecision: rows[0]?.has_decision ?? false,
    hasRestriction: rows[0]?.has_restriction ?? false,
  }
}

export async function countTestCopyrightTrustedFlaggerChanges(flaggerId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`
    /* countTestCopyrightTrustedFlaggerChanges */
    SELECT count(*)::integer AS count FROM copyright_trusted_flagger_changes
    WHERE copyright_trusted_flagger_id = ${flaggerId}
  `)
  return rows[0]?.count ?? 0
}
