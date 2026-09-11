import assert from 'http-assert'
import onError from '@modules/on-error'
import { write, read, beginTransaction } from '@data-stores/psql'
import { createUserWarningNotification } from '@services/notifications/create-user-warning-notification'
import { recordModeratorAction } from '@services/moderator-actions'
import { openOrGetOpenCase, maybeResolveCase } from '@services/moderation-cases'
import sql from 'sql-template-strings'
import type { UserWarning } from './config.mts'
import type { CreateUserWarningInput } from './parse.mts'

export async function createUserWarning(
  currentUserId: string,
  input: CreateUserWarningInput,
  options: { returnExistingForReport?: boolean } = {},
): Promise<UserWarning> {
  let caseId: string
  if (input.reportId) {
    const { rows: caseRows } = await read<{ case_id: string }>(
      sql`/* createUserWarning:caseId */ SELECT case_id FROM moderation_reports WHERE id = ${input.reportId}::uuid LIMIT 1`,
    )
    caseId =
      caseRows[0]?.case_id ??
      (await openOrGetOpenCase({ entityType: 'user', entityId: input.userId }))
  } else {
    const { rows: userCheck } = await read<{ id: string }>(
      sql`/* createUserWarning:checkUser */ SELECT id FROM users WHERE id = ${input.userId}::uuid AND deleted_at IS NULL LIMIT 1`,
    )
    assert(userCheck[0], 404, 'User not found')
    caseId = await openOrGetOpenCase({ entityType: 'user', entityId: input.userId })
  }
  let warning: UserWarning
  try {
    warning = await createWarningInTransaction(currentUserId, input, caseId)
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === '23503') {
      assert(false, 422, 'Community not found')
    }
    if (code === '23505') {
      if (options.returnExistingForReport && input.reportId) {
        const { rows: existingRows } = await read(
          sql`/* createUserWarning:existingForReport */
            SELECT * FROM user_warnings
            WHERE report_id = ${input.reportId}::uuid
            AND user_id = ${input.userId}::uuid
            LIMIT 1
          `,
        )
        if (existingRows[0]) return existingRows[0] as UserWarning
      }
      assert(false, 409, 'A warning has already been issued for this report')
    }
    throw err
  }
  // Fire-and-forget: the warning row is already committed; notification delivery is best-effort.
  createUserWarningNotification(input.userId, warning.id, input.publicMessage).catch(onError)
  return warning
}

async function createWarningInTransaction(
  currentUserId: string,
  input: CreateUserWarningInput,
  caseId: string,
): Promise<UserWarning> {
  await using query = await beginTransaction()
  const { rows } = await write(
    sql`/* createUserWarning */
          WITH target_check AS (
            SELECT id FROM users
            WHERE id = ${input.userId}::uuid
              AND deleted_at IS NULL
            LIMIT 1
          )
          INSERT INTO user_warnings (
            user_id,
            community_id,
            issued_by_id,
            reason,
            public_message,
            report_id,
            case_id
          )
          SELECT
            ${input.userId}::uuid,
            ${input.communityId ?? null}::uuid,
            ${currentUserId}::uuid,
            ${input.reason},
            ${input.publicMessage ?? null},
            ${input.reportId ?? null}::uuid,
            ${caseId}
          FROM target_check
          RETURNING *
        `,
    { query },
  )
  const created = rows[0] as UserWarning | undefined
  assert(created, 404, 'User not found')

  // Derive community from the report target when not explicitly provided
  // (global admin warnings issued against community reports have no communityId in input)
  let communityId = input.communityId ?? null
  if (!communityId && input.reportId) {
    const { rows: reportRows } = await read<{ community_id: string | null }>(
      sql`/* createUserWarning:communityId */
            SELECT COALESCE(tp.community_id, rp.community_id) AS community_id
            FROM moderation_reports r
            LEFT JOIN posts tp ON r.post_id IS NOT NULL AND tp.id = r.post_id
            LEFT JOIN posts rp ON r.post_id IS NOT NULL AND tp.post_type = 'comment' AND rp.id = tp.root_id
            WHERE r.id = ${input.reportId}
            LIMIT 1
          `,
      { query },
    )
    communityId = reportRows[0]?.community_id ?? null
  }
  await Promise.all([
    recordModeratorAction(
      currentUserId,
      {
        actionType: 'warn',
        targetUserId: input.userId,
        communityId,
        reportId: input.reportId ?? null,
        reason: input.reason,
      },
      { query },
    ),
    maybeResolveCase(caseId, currentUserId, { query }),
  ])
  await query.commit()
  return created
}
