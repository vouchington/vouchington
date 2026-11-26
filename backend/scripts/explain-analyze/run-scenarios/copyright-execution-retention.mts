import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { deleteAttemptBatch } from '@services/copyright-notices/operational-retention-attempt-batch'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  copyrightExecutionCutoff,
  copyrightExecutionLanes,
  copyrightExecutionRows,
  copyrightOperationalSetting,
  executionRelations,
  restoreCopyrightExecutionResults,
  seedCopyrightExecutionRows,
  seedCopyrightExecutionWork,
  type CopyrightExecutionLane,
} from './copyright-execution-retention-fixture.mts'

const markers = [
  'selectExpiredCopyrightExecutionAttempts',
  'deleteExpiredCopyrightExecutionResults',
  'deleteExpiredCopyrightExecutionAttempts',
] as const
const setOperationalRetention = `/* enableCopyrightOperationalRetention */ SET LOCAL ${copyrightOperationalSetting} = 'on'`
const checkMarker = 'checkCopyrightExecutionRetentionSurvivors'

export async function runCopyrightExecutionRetentionScenarios(): Promise<void> {
  await seedCopyrightExecutionWork()
  const fixture = copyrightExecutionRows()
  for (const lane of copyrightExecutionLanes) {
    // Capture is process-wide. Finish one lane's replay and cleanup before starting the other.
    await runLane(lane, fixture)
  }
}

async function runLane(
  { kind, scenario }: CopyrightExecutionLane,
  { rows, pageIds, eligible }: ReturnType<typeof copyrightExecutionRows>,
): Promise<void> {
  const { attempts, results } = executionRelations(kind)
  const ids = rows.map(row => row.id)
  const deletedIds = eligible.map(row => row.id)
  const deleted = new Set(deletedIds)
  const expected = rows
    .filter(row => !deleted.has(row.id))
    .map(row => ({
      id: row.id,
      has_result: row.finishedAt !== null,
    }))
  try {
    await using seed = await beginTransaction()
    await seedCopyrightExecutionRows(seed, kind, rows)
    await seed.commit()
    await write(`/* analyzeCopyrightExecutionRetention */ ANALYZE ${attempts}, ${results}`)
    registerScenarioContract(scenario, {
      // Both DELETE statements have no RETURNING clause.
      allowEmptyResult: true,
      seededRows: {
        [attempts]: rows.length,
        [results]: rows.filter(row => row.finishedAt !== null).length,
      },
      // Eligibility currently scans both tables in custom mode and the results in generic mode.
      expectations: [
        { kind: 'usesIndexes', indexes: [`${results}_pkey`], queryContains: `/* ${markers[1]} */` },
        {
          kind: 'usesIndexes',
          indexes: [`${attempts}_pkey`],
          queryContains: `/* ${markers[2]} */`,
        },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        await using query = await beginTransaction()
        await query(setOperationalRetention)
        assert.equal(
          await deleteAttemptBatch(query, kind, pageIds, copyrightExecutionCutoff),
          deletedIds.length,
        )
        const { rows: survivors } = await query<{ id: string; has_result: boolean }>(
          `/* ${checkMarker} */ SELECT attempt.id, result.attempt_id IS NOT NULL AS has_result
           FROM ${attempts} attempt LEFT JOIN ${results} result ON result.attempt_id = attempt.id
           WHERE attempt.id = ANY($1::uuid[]) ORDER BY attempt.id`,
          [ids],
        )
        assert.deepEqual(survivors, expected)
        await query.rollback()
      },
      undefined,
      markers,
      {
        exactCapturedNames: ['enableCopyrightOperationalRetention', ...markers, checkMarker],
        localSettings: { [copyrightOperationalSetting]: 'on' },
        beforeExplain: async ({ text }) => {
          await using query = await beginTransaction()
          if (text.startsWith(`/* ${markers[2]} */`)) {
            // Match the live third statement: the result DELETE already ran.
            await query(setOperationalRetention)
            await query(
              `/* prepareCopyrightExecutionAttemptReplay */ DELETE FROM ${results}
               WHERE attempt_id = ANY($1::uuid[])`,
              [deletedIds],
            )
          } else {
            await restoreCopyrightExecutionResults(query, kind, eligible)
          }
          await query.commit()
        },
      },
    )
  } finally {
    await using query = await beginTransaction()
    await query(setOperationalRetention)
    await query(
      `/* cleanupCopyrightExecutionRetention */ DELETE FROM ${attempts} WHERE id = ANY($1::uuid[])`,
      [ids],
    )
    await query.commit()
  }
}
