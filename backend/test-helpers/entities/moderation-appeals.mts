import { write, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ModerationAppeal } from '@voucha/types/entities/moderation-appeal'
import { openOrGetOpenCase } from './_moderation-case-support.mts'

type InsertTestModerationAppealOptions =
  | {
      appellantId: string
      userWarningId: string
      userSuspensionId?: never
      communityId?: string | null
      appealReason?: string
      publicResponse?: string | null
    }
  | {
      appellantId: string
      userWarningId?: never
      userSuspensionId: string
      communityId?: string | null
      appealReason?: string
      publicResponse?: string | null
    }

export async function insertTestModerationAppeal(
  options: InsertTestModerationAppealOptions,
): Promise<ModerationAppeal> {
  const communityId = options.communityId ?? null
  const appealReason = options.appealReason ?? 'Test appeal reason'
  const publicResponse = options.publicResponse ?? null

  let caseId: string
  if (options.userWarningId) {
    const { rows: warnRows } = await read<{ case_id: string }>(
      sql`/* insertTestModerationAppeal:caseId */
      SELECT case_id FROM user_warnings WHERE id = ${options.userWarningId}::uuid LIMIT 1
    `,
    )
    caseId =
      warnRows[0]?.case_id ??
      (await openOrGetOpenCase({ entityType: 'user', entityId: options.appellantId }))
  } else {
    caseId = await openOrGetOpenCase({ entityType: 'user', entityId: options.appellantId })
  }

  const userWarningId = options.userWarningId ?? null
  const userSuspensionId = options.userSuspensionId ?? null

  // Mirror the two-step CTE from createModerationAppeal in services/moderation-appeals/create.mts,
  // omitting the AI-resolution enqueue that is only appropriate for production code paths.
  const { rows } = await write<ModerationAppeal>(sql`/* insertTestModerationAppeal */
    WITH lifecycle_id AS (
      SELECT uuidv7() AS id
    ),
    new_appeal AS (
      INSERT INTO moderation_appeals (
        appellant_id,
        user_warning_id,
        user_suspension_id,
        community_id,
        appeal_reason,
        public_response,
        case_id,
        latest_lifecycle_change_id,
        created_via
      )
      VALUES (
        ${options.appellantId}::uuid,
        ${userWarningId}::uuid,
        ${userSuspensionId}::uuid,
        ${communityId}::uuid,
        ${appealReason},
        ${publicResponse},
        ${caseId},
        (SELECT id FROM lifecycle_id),
        'system'
      )
      RETURNING *
    ),
    _lifecycle AS (
      INSERT INTO moderation_appeal_lifecycle_changes (
        id,
        moderation_appeal_id,
        change_type,
        changed_by_id,
        drafted_at,
        edited_at,
        approved_at,
        sent_at,
        resolved_at,
        resolution_action,
        metadata
      )
      SELECT
        lifecycle_id.id,
        new_appeal.id,
        'create',
        ${options.appellantId}::uuid,
        new_appeal.drafted_at,
        new_appeal.edited_at,
        new_appeal.approved_at,
        new_appeal.sent_at,
        new_appeal.resolved_at,
        new_appeal.resolution_action,
        '{}'::jsonb
      FROM new_appeal
      CROSS JOIN lifecycle_id
    )
    SELECT * FROM new_appeal
  `)

  return rows[0]!
}

export async function resolveTestModerationAppeal(options: {
  appealId: string
  resolvedAt: Date
  resolutionAction: 'accept' | 'reduce' | 'deny'
}): Promise<void> {
  await write(sql`/* resolveTestModerationAppeal */
    UPDATE moderation_appeals
    SET resolved_at = ${options.resolvedAt}, resolution_action = ${options.resolutionAction}
    WHERE id = ${options.appealId}::uuid
  `)
}

/** Clears a mutable appeal resolution to exercise trigger decrement maintenance. */
export async function clearTestModerationAppealResolution(appealId: string): Promise<void> {
  await write(sql`/* clearTestModerationAppealResolution */
    UPDATE moderation_appeals
    SET resolved_at = NULL, resolution_action = NULL
    WHERE id = ${appealId}::uuid
  `)
}

/** Deletes an appeal and its cascading lifecycle rows for trigger-maintenance coverage. */
export async function deleteTestModerationAppeal(appealId: string): Promise<void> {
  await write(sql`/* deleteTestModerationAppeal */
    DELETE FROM moderation_appeals
    WHERE id = ${appealId}::uuid
  `)
}
