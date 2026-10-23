/** Config-driven relations run on every initialization, so the cross-file FK must reconcile. */
export function createInboundFollowActivityForeignKeySql(): string {
  return `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'relation__remote_actor__follow__user'::regclass
      AND conname = 'fk_remote_follow__inbound_follow_activity_row_id'
  ) THEN
    ALTER TABLE relation__remote_actor__follow__user
      ADD CONSTRAINT fk_remote_follow__inbound_follow_activity_row_id
      FOREIGN KEY (subject_id, object_id, inbound_follow_activity_row_id)
      REFERENCES activitypub_remote_follow_activities(remote_actor_id, target_user_id, id)
      ON DELETE SET NULL (inbound_follow_activity_row_id) NOT VALID;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'relation__remote_actor__follow__user'::regclass
      AND conname = 'fk_remote_follow__inbound_follow_activity_row_id'
      AND pg_get_constraintdef(oid, true) NOT IN (
        'FOREIGN KEY (subject_id, object_id, inbound_follow_activity_row_id) REFERENCES activitypub_remote_follow_activities(remote_actor_id, target_user_id, id) ON DELETE SET NULL (inbound_follow_activity_row_id)',
        'FOREIGN KEY (subject_id, object_id, inbound_follow_activity_row_id) REFERENCES activitypub_remote_follow_activities(remote_actor_id, target_user_id, id) ON DELETE SET NULL (inbound_follow_activity_row_id) NOT VALID'
      )
  ) THEN
    RAISE EXCEPTION 'Remote Follow activity FK has an unexpected definition';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'relation__remote_actor__follow__user'::regclass
      AND conname = 'fk_remote_follow__inbound_follow_activity_row_id'
      AND NOT convalidated
  ) THEN
    ALTER TABLE relation__remote_actor__follow__user
      VALIDATE CONSTRAINT fk_remote_follow__inbound_follow_activity_row_id;
  END IF;
END $$;
COMMENT ON COLUMN relation__remote_actor__follow__user.inbound_follow_activity_row_id IS 'Current inbound Follow activity cycle; undone identities remain in the activity table and cannot reauthorize this relation.';`
}
