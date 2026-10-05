import { read, write } from '@data-stores/psql'

/**
 * Package-local fixtures for the moderation and admission joined-id relations. They use raw SQL
 * because @data-stores/psql tests cannot depend on @voucha/test-helpers (workspace cycle).
 */

const COUNT_QUERIES = {
  flagReporters:
    '/* countTestFlagReporters */ SELECT count(*)::int AS n FROM report_integrity_flag_reporters WHERE flag_id = $1',
  actionRestrictions:
    '/* countTestActionRestrictions */ SELECT count(*)::int AS n FROM moderator_action_community_restrictions WHERE moderator_action_id = $1',
  consumptions:
    '/* countTestReservationConsumptions */ SELECT count(*)::int AS n FROM post_admission_quota_consumptions WHERE reservation_id = $1',
} as const

export async function countTestRelationRows(
  relation: keyof typeof COUNT_QUERIES,
  ownerId: string,
): Promise<number> {
  const { rows } = await read<{ n: number }>(COUNT_QUERIES[relation], [ownerId])
  return rows[0]!.n
}

export async function rejectionCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run()
  } catch (err) {
    return (err as { code?: string }).code
  }
  return undefined
}

export async function createRelationTestCommunity(createdById: string): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* createRelationTestCommunity */ INSERT INTO communities (created_via, name, slug, created_by_id)
      VALUES ('system', 'Relation test', 'relation-' || replace(uuidv7()::text, '-', ''), $1) RETURNING id`,
    [createdById],
  )
  return rows[0]!.id
}

export async function createRelationTestModeratorAction(
  actorId: string,
  communityId: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* createRelationTestModeratorAction */ INSERT INTO moderator_actions
      (actor_user_id, action_type, community_id)
      VALUES ($1, 'activate_restriction', $2) RETURNING id`,
    [actorId, communityId],
  )
  return rows[0]!.id
}

export async function linkTestModeratorActionRestriction(
  moderatorActionId: string,
  communityRestrictionId: string,
): Promise<void> {
  await write(
    `/* linkTestModeratorActionRestriction */ INSERT INTO moderator_action_community_restrictions
      (moderator_action_id, community_restriction_id) VALUES ($1, $2)`,
    [moderatorActionId, communityRestrictionId],
  )
}

export async function insertTestFlagReporter(flagId: string, userId: string): Promise<void> {
  await write(
    `/* insertTestFlagReporter */ INSERT INTO report_integrity_flag_reporters (flag_id, user_id)
      VALUES ($1, $2)`,
    [flagId, userId],
  )
}

export async function insertTestFlagWithStoredReporterIds(reportedUserId: string): Promise<void> {
  await write(
    `/* insertTestFlagWithStoredReporterIds */ INSERT INTO report_integrity_flags
      (reported_user_id, reporter_count, new_account_reporter_percent, details)
      VALUES ($1, 1, 0.5, '{"reporter_user_ids": []}'::jsonb)`,
    [reportedUserId],
  )
}

export async function insertTestAdmissionConsumption(
  reservationId: string,
  actorId: string,
): Promise<void> {
  await write(
    `/* insertTestAdmissionConsumption */ INSERT INTO post_admission_quota_consumptions
      (reservation_id, actor_user_id, source) VALUES ($1, $2, 'discussion')`,
    [reservationId, actorId],
  )
}

export async function deleteTestRetainedPostIdentity(postId: string): Promise<void> {
  await write(
    '/* deleteTestRetainedPostIdentity */ DELETE FROM retained_post_identities WHERE id = $1',
    [postId],
  )
}

export async function deleteTestUser(userId: string): Promise<void> {
  await write('/* deleteTestUser */ DELETE FROM users WHERE id = $1', [userId])
}

export async function deleteTestModeratorAction(moderatorActionId: string): Promise<void> {
  await write('/* deleteTestModeratorAction */ DELETE FROM moderator_actions WHERE id = $1', [
    moderatorActionId,
  ])
}

export async function deleteTestReportIntegrityFlag(flagId: string): Promise<void> {
  await write(
    '/* deleteTestReportIntegrityFlag */ DELETE FROM report_integrity_flags WHERE id = $1',
    [flagId],
  )
}
