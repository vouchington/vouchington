import { write } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

const topicId = '019e0000-8a00-7000-8000-0000000013ec'

async function setDeleted(deleted: boolean, annotation: string): Promise<void> {
  await write(
    `/* ${annotation} */ UPDATE topics
    SET deleted_at = CASE WHEN $2::boolean THEN CURRENT_TIMESTAMP ELSE NULL END,
      deleted_by_id = CASE WHEN $2::boolean THEN $3::uuid ELSE NULL END
    WHERE id = $1::uuid RETURNING id`,
    [topicId, deleted, seedUser.id],
  )
}

export async function runTopicLinkCountLifecycleScenarios(): Promise<void> {
  const cases = [
    {
      id: 'topic-link-count-soft-delete',
      annotation: 'explainTopicLinkCountDelete',
      deleted: true,
    },
    { id: 'topic-link-count-restore', annotation: 'explainTopicLinkCountRestore', deleted: false },
  ] as const
  for (const scenario of cases) {
    registerScenarioContract(scenario.id, {
      expectations: [
        // The single target appears in both ModifyTable and its primary-key scan.
        { kind: 'maxProcessedRows', relation: 'topics', max: 2 },
        {
          kind: 'maxFunctionCalls',
          function: 'fn_refresh_referral_program_link_counts_on_topic_lifecycle',
          max: 1,
        },
        { kind: 'maxFunctionCalls', function: 'fn_project_referral_program_link_counts', max: 1 },
      ],
    })
    // Set the initial state, run the real transition, then reset it before every rolled-back
    // custom/generic and repeated EXPLAIN so the lifecycle trigger actually runs each time.
    // no-mistakes-disable-next-line query-reached-per-item: two fixed lifecycle cases have separate captures.
    await setDeleted(!scenario.deleted, 'prepareTopicLinkCountLifecycle')
    // no-mistakes-disable-next-line query-reached-per-item: two fixed lifecycle cases have separate captures.
    await runAndCapture(
      scenario.id,
      () => setDeleted(scenario.deleted, scenario.annotation),
      undefined,
      scenario.annotation,
      { afterCapture: () => setDeleted(!scenario.deleted, 'resetTopicLinkCountLifecycle') },
    )
  }
}
