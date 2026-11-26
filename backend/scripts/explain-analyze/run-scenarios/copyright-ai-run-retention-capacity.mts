import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getMinUuidv7ForDate } from '@modules/utils'
import { deleteExpiredCopyrightAiRunBatch } from '@services/copyright-notices/ai-run-retention'
import { DEFAULT_DATA_RETENTION_CONFIG } from '@services/data-retention/config'
import {
  COPYRIGHT_AI_RUN_TABLES,
  createCopyrightCaseWithAiRunSubjects,
} from '@voucha/test-helpers/copyright-ai-run-fixtures'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuidAtTimestamp } from '../seed-data/common.mts'

const scenario = 'copyright-ai-run-retention-at-cap'
const queryName = 'deleteOldCopyrightAiRunBatch'
const pageSize = DEFAULT_DATA_RETENTION_CONFIG.batch_size
const cutoffId = getMinUuidv7ForDate(new Date('2001-01-01'))
const expiredIds = Array.from({ length: pageSize * 10 + 1 }, (_, index) =>
  seedUuidAtTimestamp(Date.UTC(2000, 0, 1), index),
)
const recentIds = Array.from({ length: pageSize * 20 }, (_, index) =>
  seedUuidAtTimestamp(Date.UTC(2002, 0, 1), index),
)
const deleteIds = expiredIds.slice(0, pageSize)
const survivorIds = [...expiredIds.slice(pageSize), ...recentIds]
const fixtureIds = [...deleteIds, ...survivorIds]

export async function runCopyrightAiRunRetentionCapacityScenario(): Promise<void> {
  const { appealSubmissionId, counterNoticeSubmissionId } =
    await createCopyrightCaseWithAiRunSubjects()
  const intake = await createParsedCopyrightEmailIntake()
  const fixtures = [
    {
      kind: 'appeal_recommendation',
      table: COPYRIGHT_AI_RUN_TABLES.appeal,
      subjectColumn: 'copyright_notice_submission_id',
      subjectId: appealSubmissionId,
    },
    {
      kind: 'submission_guidance',
      table: COPYRIGHT_AI_RUN_TABLES.guidance,
      subjectColumn: 'copyright_notice_submission_id',
      subjectId: counterNoticeSubmissionId,
    },
    {
      kind: 'email_intake_recommendation',
      table: COPYRIGHT_AI_RUN_TABLES.email,
      subjectColumn: 'copyright_notice_email_intake_receipt_id',
      subjectId: intake.id,
    },
  ] as const
  registerScenarioContract(scenario, {
    expectations: [
      // One page selected, one page looked up by identity, one page deleted.
      ...fixtures.map(({ table }) => ({
        kind: 'maxProcessedRows' as const,
        relation: table,
        max: pageSize * 3,
      })),
      { kind: 'maxInputRows', nodeType: 'Sort', max: 0 },
    ],
    seededRows: Object.fromEntries(fixtures.map(({ table }) => [table, fixtureIds.length])),
  })
  try {
    // The global sweep has no scope predicate. The historical IDs isolate this fixture's
    // eligible window from ordinary run traffic in the disposable EXPLAIN database.
    for (const fixture of fixtures) {
      const { rows } = await write<{ id: string }>(
        sql`/* checkCopyrightAiRunRetentionWindow */ SELECT id FROM `
          .append(fixture.table)
          .append(sql` WHERE id < ${cutoffId}::uuid LIMIT 1`),
      )
      assert.deepEqual(rows, [])
      await insertRuns(fixture, fixtureIds)
      await write(`/* analyzeCopyrightAiRunRetentionCapacity */ ANALYZE ${fixture.table}`)
    }

    await runAndCapture(
      scenario,
      async () => {
        for (const { kind } of fixtures)
          assert.equal(await deleteExpiredCopyrightAiRunBatch(kind, cutoffId, pageSize), pageSize)
      },
      undefined,
      queryName,
      {
        exactCapturedNames: fixtures.map(() => queryName),
        afterCapture: async () => {
          for (const fixture of fixtures) {
            const { rows } = await write<{ id: string }>(
              sql`/* inspectCopyrightAiRunRetentionSurvivors */ SELECT id FROM `
                .append(fixture.table)
                .append(sql` WHERE id = ANY(${fixtureIds}::uuid[]) ORDER BY id`),
            )
            assert.deepEqual(
              rows.map(row => row.id),
              survivorIds,
            )
            // EXPLAIN ANALYZE rolls back each replay. Restore the first page once for both modes.
            await insertRuns(fixture, deleteIds)
            await write(`/* analyzeCopyrightAiRunRetentionReplay */ ANALYZE ${fixture.table}`)
          }
        },
      },
    )
  } finally {
    for (const { table, subjectColumn, subjectId } of fixtures)
      await write(
        sql`/* cleanupCopyrightAiRunRetentionCapacity */ DELETE FROM `
          .append(table)
          .append(` WHERE ${subjectColumn} = `)
          .append(sql`${subjectId}::uuid AND id = ANY(${fixtureIds}::uuid[])`),
      )
  }
}

async function insertRuns(
  fixture: { table: string; subjectColumn: string; subjectId: string },
  ids: readonly string[],
): Promise<void> {
  await write(
    sql`/* seedCopyrightAiRunRetentionCapacity */ INSERT INTO `.append(
      `${fixture.table} (id, ${fixture.subjectColumn}, failed_at)`,
    ).append(sql` SELECT id, ${fixture.subjectId}::uuid, CURRENT_TIMESTAMP
        FROM unnest(${ids}::uuid[]) AS fixture(id)`),
  )
}
