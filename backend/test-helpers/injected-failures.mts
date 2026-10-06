import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { getEntityRelationVoteTableName } from '@voucha/types/entities/entity-relations-metadata'
import sql from 'sql-template-strings'
import { getEntityRelationMetadataOrThrow } from '../services/entity-relations/metadata.mts'
import { runThenCleanup } from './run-then-cleanup.mts'

/**
 * Failure injection without per-test DDL. Triggers on the shared tables are installed once per
 * test database by `test-helpers/vitest.setup.failure-injection.mts`. Each trigger raises only for
 * actors listed in a control table, so a test injects a failure by inserting its fresh fixture
 * actor's row and removes it afterwards: row locks only, never the table-level locks that
 * CREATE/DROP TRIGGER take against concurrent tests.
 *
 * The objects live in their own schema because they are test-database-only: they must stay out of
 * the `public` catalog that schema-growth and naming tests enumerate. The triggers themselves
 * appear in the table's trigger list, so they are installed only for projects that need them, never
 * for the PostgreSQL schema job that compares the live catalog with the committed snapshot. Rename
 * a trigger when changing its definition; installation skips triggers that already exist.
 */
export type InjectedFailureScope =
  | 'post_category_topic_vote'
  | 'staff_action_history'
  | 'staff_action_history_finished'

export const postCategoryTopicVoteTable = getEntityRelationVoteTableName(
  getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'topic',
    predicate: 'category',
  }),
)

const schema = 'test_failure_injection'

type InjectedFailureTrigger = {
  name: string
  table: string
  condition: string
  fn: string
  scope: InjectedFailureScope
}

export const injectedFailureTriggers: readonly InjectedFailureTrigger[] = [
  {
    name: 'test_failure_injection_staff_action_history',
    table: 'moderator_actions',
    condition: '',
    fn: 'reject_staff_action',
    scope: 'staff_action_history',
  },
  {
    name: 'test_failure_injection_staff_action_history_finished',
    table: 'moderator_actions',
    condition: "WHEN (NEW.metadata->>'phase' = 'finished')",
    fn: 'reject_staff_action',
    scope: 'staff_action_history_finished',
  },
  {
    name: 'test_failure_injection_post_category_topic_vote',
    table: postCategoryTopicVoteTable,
    condition: '',
    fn: 'reject_category_vote',
    scope: 'post_category_topic_vote',
  },
]

function createTriggerIfMissing({ name, table, condition, fn, scope }: InjectedFailureTrigger) {
  return `IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.${table}'::regclass AND tgname = '${name}'
    ) THEN
      CREATE TRIGGER ${name} BEFORE INSERT ON public.${table}
        FOR EACH ROW ${condition} EXECUTE FUNCTION ${schema}.${fn}('${scope}');
    END IF;`
}

/**
 * Idempotent: functions are replaced and the control table and triggers are created only when
 * missing, so a repeated run against a database that already has them takes no shared-table lock.
 * The advisory lock serializes concurrent installers. Run from vitest global setup, before test
 * workers fork and connect.
 */
export async function installInjectedFailuresForTestDatabase(): Promise<void> {
  await write(`/* installInjectedFailuresForTestDatabase */ DO $install$
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('voucha.${schema}', 0));
    CREATE SCHEMA IF NOT EXISTS ${schema};
    CREATE TABLE IF NOT EXISTS ${schema}.rejected_actors (
      scope text NOT NULL,
      actor_id uuid NOT NULL,
      lease_id uuid NOT NULL,
      PRIMARY KEY (scope, actor_id, lease_id)
    );
    CREATE OR REPLACE FUNCTION ${schema}.reject_staff_action() RETURNS trigger
    LANGUAGE plpgsql AS $staff$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM ${schema}.rejected_actors
        WHERE scope = TG_ARGV[0] AND actor_id = NEW.actor_user_id
      ) THEN
        RAISE EXCEPTION 'staff history rejected for test';
      END IF;
      RETURN NEW;
    END
    $staff$;
    CREATE OR REPLACE FUNCTION ${schema}.reject_category_vote() RETURNS trigger
    LANGUAGE plpgsql AS $vote$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM ${schema}.rejected_actors
        WHERE scope = TG_ARGV[0] AND actor_id = NEW.user_id
      ) THEN
        RAISE EXCEPTION 'category vote rejected for test';
      END IF;
      RETURN NEW;
    END
    $vote$;
    ${injectedFailureTriggers.map(createTriggerIfMissing).join('\n    ')}
  END
  $install$`)
}

/**
 * Rejects the scope's inserts for `actorId` while `execute` runs. Use a fresh fixture actor so
 * parallel tests that touch the same table keep passing. A failing release never replaces the
 * failure `execute` threw; the leaked row only affects an actor no other test uses.
 */
export async function withInjectedFailure<T>(
  scope: InjectedFailureScope,
  actorId: string,
  execute: () => Promise<T>,
): Promise<T> {
  const leaseId = randomUUID()
  await write(sql`/* injectFailure */
    INSERT INTO test_failure_injection.rejected_actors (scope, actor_id, lease_id)
    VALUES (${scope}, ${actorId}, ${leaseId})`)
  return runThenCleanup(execute, async () => {
    await write(sql`/* releaseInjectedFailure */
      DELETE FROM test_failure_injection.rejected_actors
      WHERE scope = ${scope} AND actor_id = ${actorId} AND lease_id = ${leaseId}`)
  })
}
