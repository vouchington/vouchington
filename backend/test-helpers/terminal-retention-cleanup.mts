import { withCommittedPostgresTransactionForTest } from './postgres-transaction.mts'

/** Remove only this fixture's exact remote identity and optional local target in FK-safe order. */
export async function deleteTerminalRetentionFixtureForTest(input: {
  actorId: string
  actorUri: string
  userId: string | null
  activityIds: readonly string[]
}): Promise<void> {
  await withCommittedPostgresTransactionForTest(async query => {
    await query(
      `/* deleteTerminalRetentionFixtureRelationForTest */
       DELETE FROM relation__remote_actor__follow__user
       WHERE subject_id = $1::uuid AND object_id = $2::uuid`,
      [input.actorId, input.userId],
    )
    await query(
      `/* deleteTerminalRetentionFixtureActivitiesForTest */
       DELETE FROM activitypub_remote_follow_activities
       WHERE remote_actor_id = $1::uuid AND activity_id = ANY($2::text[])`,
      [input.actorId, input.activityIds],
    )
    await query(
      `/* deleteTerminalRetentionFixtureInboxForTest */
       DELETE FROM activitypub_inbox_activities
       WHERE actor_uri = $1 AND activity_id = ANY($2::text[])`,
      [input.actorUri, input.activityIds],
    )
    await query(
      `/* deleteTerminalRetentionFixtureActorForTest */
       DELETE FROM remote_actors WHERE id = $1::uuid`,
      [input.actorId],
    )
    await query(
      `/* deleteTerminalRetentionFixtureUserForTest */
       DELETE FROM users WHERE id = $1::uuid`,
      [input.userId],
    )
  })
}
