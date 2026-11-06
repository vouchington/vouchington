import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { FK_ACTOR_INDEX_PROBES } from '../fk-actor-index-probes.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { SEEDED_ROWS_BY_RELATION } from '../plan-seeded-rows.mts'
import { runAndCapture } from '../run-support.mts'
import {
  REPORT_CONTEXT_POST_COUNT,
  REPORT_CONTEXT_REPORTED_USER_COUNT,
  REPORT_CONTEXT_HOSTNAME_COUNT,
  REPORT_CONTEXT_RSS_FEED_ITEM_COUNT,
  REPORT_CONTEXT_NOISE_POST_COUNT,
} from '../seed-data/moderation-report-context-counts.mts'

/** Probe existing mostly-null actor cohorts without changing unrelated fixtures or planner settings. */
export async function runFkActorIndexScenarios(): Promise<void> {
  const indexes = {
    images: 'idx_images__deleted_by_id',
    agent_moderations: 'agent_moderations__default_deleted_by_id_idx',
    moderation_cases: 'idx_moderation_cases__resolved_by_id',
  }
  const seededRows = {
    images: SEEDED_ROWS_BY_RELATION.images!,
    agent_moderations: SEEDED_ROWS_BY_RELATION.agent_moderations!,
    moderation_cases:
      REPORT_CONTEXT_POST_COUNT +
      REPORT_CONTEXT_REPORTED_USER_COUNT +
      REPORT_CONTEXT_HOSTNAME_COUNT +
      REPORT_CONTEXT_RSS_FEED_ITEM_COUNT +
      REPORT_CONTEXT_NOISE_POST_COUNT,
  }
  for (const probe of FK_ACTOR_INDEX_PROBES) {
    registerScenarioContract(probe.id, {
      allowEmptyResult: true,
      seededRows: { [probe.relation]: seededRows[probe.relation] },
      forbidSequentialScans: [probe.relation],
      ...(probe.relation === 'agent_moderations'
        ? {
            crossPartition: {
              agent_moderations:
                'Actor FK lookup cannot constrain post_id; every partition must be searched.',
            },
          }
        : {}),
      expectations: [
        { kind: 'usesIndexes', indexes: [indexes[probe.relation]], noSort: true },
        { kind: 'maxProcessedRows', relation: probe.relation, max: 2 },
        { kind: 'maxBitmapIndexRows', max: 2 },
      ],
    })
    // no-mistakes-disable-next-line query-reached-per-item: three fixed FK equality shapes require separate parameterized custom/generic plan captures
    await runAndCapture(probe.id, async () => {
      const result = await write(`/* runFkActorIndexScenarios */ ${probe.text}`, [...probe.values])
      assert.equal(result.rows.length, 0, `${probe.relation} actor probe must remain a no-match`)
    })
  }
}
