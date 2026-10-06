import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

export type TestDelegatedCreateReservation = {
  id: string
  route: string
  state: string
  response: Record<string, unknown> | null
}

/** The admission ledger rows of the creates that make no post, which the credential owner holds. */
export async function listTestDelegatedCreateReservations(
  userId: string,
): Promise<TestDelegatedCreateReservation[]> {
  const { rows } = await read<TestDelegatedCreateReservation>(
    sql`/* listTestDelegatedCreateReservations */
    SELECT id, route, state, response
    FROM post_admission_reservations
    WHERE actor_user_id = ${userId} AND post_type IS NULL
    ORDER BY id`,
  )
  return rows
}

/**
 * Row-locks an actor's admission reservation, so a claim for the same key waits on the lock.
 * `deleteAndRelease` frees the key as a failed create does, so the waiting claim finds it gone.
 */
export async function holdTestAdmissionReservationLock(actorId: string, idempotencyKey: string) {
  const query = await beginTransaction()
  try {
    await query(sql`/* holdTestAdmissionReservationLock */
      SELECT id FROM post_admission_reservations
      WHERE actor_user_id = ${actorId} AND idempotency_key = ${idempotencyKey} FOR UPDATE`)
    const processId = await getTestPostgresBackendProcessId(query)
    return {
      processId,
      async deleteAndRelease() {
        await query(sql`/* holdTestAdmissionReservationLock.delete */
          DELETE FROM post_admission_reservations
          WHERE actor_user_id = ${actorId} AND idempotency_key = ${idempotencyKey}`)
        await query.commit()
      },
      async [Symbol.asyncDispose]() {
        await query[Symbol.asyncDispose]()
      },
    }
  } catch (err) {
    await query[Symbol.asyncDispose]()
    throw err
  }
}

export type TestCommunitySettings = {
  member_roster_visibility: string
  member_invites_allowed: boolean
  post_approval_required: boolean
  should_allow_review_posts: boolean
  should_allow_data_point_posts: boolean
  default_language: string | null
}

/** The community settings a create call can set, read back from the row. */
export async function readTestCommunitySettings(
  communityId: string,
): Promise<TestCommunitySettings> {
  const { rows } = await read<TestCommunitySettings>(sql`/* readTestCommunitySettings */
    SELECT member_roster_visibility,
      member_invites_allowed_at IS NOT NULL AS member_invites_allowed,
      post_approval_required_at IS NOT NULL AS post_approval_required,
      should_allow_review_posts, should_allow_data_point_posts, default_language
    FROM communities WHERE id = ${communityId}`)
  return rows[0]!
}

/** How many moderation reports the user filed, for asserting a refused call wrote nothing. */
export async function countTestModerationReportsByReporter(userId: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* countTestModerationReportsByReporter */
    SELECT count(*)::TEXT AS count FROM moderation_reports WHERE reporter_user_id = ${userId}`)
  return Number(rows[0]?.count)
}

/** How many communities the user created, for asserting a refused call wrote nothing. */
export async function countTestCommunitiesCreatedBy(userId: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* countTestCommunitiesCreatedBy */
    SELECT count(*)::TEXT AS count FROM communities WHERE created_by_id = ${userId}`)
  return Number(rows[0]?.count)
}

/** How many community applications the user filed, for asserting a refused call wrote nothing. */
export async function countTestCommunityApplicationsByUser(userId: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* countTestCommunityApplicationsByUser */
    SELECT count(*)::TEXT AS count FROM community_applications WHERE user_id = ${userId}`)
  return Number(rows[0]?.count)
}

/** How many review disputes the user filed, for asserting a refused call wrote nothing. */
export async function countTestReviewDisputesByDisputant(userId: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* countTestReviewDisputesByDisputant */
    SELECT count(*)::TEXT AS count FROM review_disputes WHERE disputant_user_id = ${userId}`)
  return Number(rows[0]?.count)
}

/** How many moderation appeals the user filed, for asserting a refused call wrote nothing. */
export async function countTestModerationAppealsByAppellant(userId: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* countTestModerationAppealsByAppellant */
    SELECT count(*)::TEXT AS count FROM moderation_appeals WHERE appellant_user_id = ${userId}`)
  return Number(rows[0]?.count)
}
