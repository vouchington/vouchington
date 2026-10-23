import { buildConstraintAddAndValidateSql } from '@vouchington/postgres/catalog-guarded-ddl'

const relation = 'relation__remote_actor__follow__user'
const activity = 'activitypub_remote_follow_activities'
const constraint = 'fk_remote_follow__inbound_follow_activity_row_id'
// A referenced Follow identity survives relation cleanup. Deferred NO ACTION also lets deletion
// of the remote actor or target user cascade through both tables in one statement.
const definition =
  'FOREIGN KEY (subject_id, object_id, inbound_follow_activity_row_id) REFERENCES activitypub_remote_follow_activities(remote_actor_id, target_user_id, id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED'
const verifiedDefinition =
  'FOREIGN KEY (subject_id, object_id, inbound_follow_activity_row_id) REFERENCES activitypub_remote_follow_activities(remote_actor_id, target_user_id, id) DEFERRABLE INITIALLY DEFERRED'

/** loaded by path by the config-driven migration runner, after relation table creation */
export default function generateRemoteFollowActivityForeignKeySql(): string {
  return [
    ...buildConstraintAddAndValidateSql(relation, constraint, definition, activity),
    `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '${relation}'::regclass
      AND conname = '${constraint}'
      AND convalidated
      AND pg_get_constraintdef(oid, true) = '${verifiedDefinition}'
  ) THEN
    RAISE EXCEPTION 'Remote Follow activity FK is missing, unvalidated, or has an unexpected definition';
  END IF;
END $$;`,
    `COMMENT ON COLUMN ${relation}.inbound_follow_activity_row_id IS 'Current inbound Follow activity cycle; undone identities remain in the activity table and cannot reauthorize this relation.';`,
  ].join('\n')
}
