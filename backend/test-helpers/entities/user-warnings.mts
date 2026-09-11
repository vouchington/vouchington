import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { UserWarning } from '@voucha/types/entities/user-warning'
import { openOrGetOpenCase } from './_moderation-case-support.mts'

export async function getUserWarningRevokedAtForTest(
  warningId: string,
): Promise<Date | null | undefined> {
  const { rows } = await read<{ revoked_at: Date | null }>(
    sql`/* getUserWarningRevokedAtForTest */
    SELECT revoked_at FROM user_warnings WHERE id = ${warningId} LIMIT 1
  `,
  )
  return rows[0]?.revoked_at
}

export async function insertTestUserWarning(options: {
  userId: string
  issuedById: string
  reason?: string
  publicMessage?: string | null
  communityId?: string | null
  reportId?: string | null
}): Promise<UserWarning> {
  const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: options.userId })
  const { rows } = await write<UserWarning>(sql`/* insertTestUserWarning */
    INSERT INTO user_warnings (
      user_id,
      issued_by_id,
      reason,
      public_message,
      community_id,
      report_id,
      case_id
    )
    VALUES (
      ${options.userId}::uuid,
      ${options.issuedById}::uuid,
      ${options.reason ?? 'Test warning reason'},
      ${options.publicMessage === undefined ? null : options.publicMessage},
      ${options.communityId === undefined ? null : options.communityId}::uuid,
      ${options.reportId === undefined ? null : options.reportId}::uuid,
      ${caseId}
    )
    RETURNING *
  `)
  return rows[0]!
}
