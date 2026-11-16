import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import type { PrivateUser } from '../services/users/types.mts'
import {
  createCopyrightTrustedFlagger,
  type CreateCopyrightTrustedFlaggerInput,
} from '../services/copyright-notices/trusted-flaggers.mts'
import {
  inAreaTrustedFlaggerMatchSql,
  recordCopyrightTrustedFlaggerMatch,
} from '../services/copyright-notices/trusted-flagger-match.mts'

type CopyrightTrustedFlagger = Awaited<ReturnType<typeof createCopyrightTrustedFlagger>>

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

/** Attempt a real insert with an explicitly selected predecessor, including invalid cross-entry links. */
export async function insertTestCopyrightTrustedFlaggerChange(
  administrator: PrivateUser,
  flaggerId: string,
  previousChangeId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* insertTestCopyrightTrustedFlaggerChange */
    INSERT INTO copyright_trusted_flagger_changes (
      copyright_trusted_flagger_id, previous_copyright_trusted_flagger_change_id,
      change_type, changed_by_id, reason
    ) VALUES (${flaggerId}, ${previousChangeId}, 'revoked', ${administrator.id}, 'Test predecessor')
  `)
  await transaction.commit()
}

/** Model a backend clock moving backwards while the immutable predecessor relation advances. */
export async function reinstateTestCopyrightTrustedFlaggerWithEarlierId(
  administrator: PrivateUser,
  flaggerId: string,
  predecessor: { id: string; created_at: Date },
): Promise<string> {
  const id = uuidv7({ msecs: predecessor.created_at.getTime() - 1000 })
  await using transaction = await beginTransaction()
  await transaction(sql`/* reinstateTestCopyrightTrustedFlaggerWithEarlierId */
    INSERT INTO copyright_trusted_flagger_changes (
      id, copyright_trusted_flagger_id, previous_copyright_trusted_flagger_change_id,
      change_type, changed_by_id, reason
    ) VALUES (${id}, ${flaggerId}, ${predecessor.id}, 'reinstated', ${administrator.id}, 'Clock regression reinstatement')
  `)
  await transaction.commit()
  return id
}

/** Four valid one-row appends whose clock readings split the receipt-eligible chain. */
export async function seedTestCopyrightTrustedFlaggerCutoffComponents(
  administrator: PrivateUser,
  flaggerId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ created_at: Date }>(sql`
    /* seedTestCopyrightTrustedFlaggerCutoffComponents:anchor */
    SELECT created_at FROM copyright_trusted_flaggers WHERE id = ${flaggerId}
  `)
  const anchor = rows[0]
  if (!anchor) throw new Error('Missing owned designation')
  const events = [
    { changeType: 'suspended', shift: -4000 },
    { changeType: 'reinstated', shift: 86_400_000 },
    { changeType: 'suspended', shift: -6000 },
    { changeType: 'reinstated', shift: -5000 },
  ] as const
  let previousId: string | null = null
  for (const event of events) {
    const id = uuidv7({ msecs: anchor.created_at.getTime() + event.shift })
    await transaction(sql`/* seedTestCopyrightTrustedFlaggerCutoffComponents:append */
      INSERT INTO copyright_trusted_flagger_changes (
        id, copyright_trusted_flagger_id, previous_copyright_trusted_flagger_change_id,
        change_type, changed_by_id, reason
      ) VALUES (${id}, ${flaggerId}, ${previousId}, ${event.changeType}, ${administrator.id}, 'Cutoff component clock regression')
    `)
    previousId = id
  }
  await transaction.commit()
}
