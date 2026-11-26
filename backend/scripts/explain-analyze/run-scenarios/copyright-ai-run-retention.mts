import assert from 'node:assert/strict'
import { getMinUuidv7ForDate } from '@modules/utils/ids'
import {
  deleteExpiredCopyrightAiRunBatch,
  type CopyrightAiRunKind,
} from '@services/copyright-notices/ai-run-retention'
import { DEFAULT_DATA_RETENTION_CONFIG } from '@services/data-retention/config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { COPYRIGHT_AI_RUN_RETENTION_SCENARIOS } from '../scenario-manifest-work-retention.mts'
import { seedCopyrightAiRunRetention } from '../seed-data/copyright-ai-run-retention.mts'
import { resolveSeedAnchor, SEED_ANCHOR_DATE_ENV } from '../seed-data/seed-anchor.mts'

const DAY_MS = 86_400_000
const RECENT_COUNT = 4_000
const QUERY_NAME = 'deleteOldCopyrightAiRunBatch'

export async function runCopyrightAiRunRetentionScenarios(): Promise<void> {
  await runCopyrightAiRunRetentionScenario('appeal_recommendation')
  await runCopyrightAiRunRetentionScenario('submission_guidance')
  await runCopyrightAiRunRetentionScenario('email_intake_recommendation')
}

async function runCopyrightAiRunRetentionScenario(kind: CopyrightAiRunKind): Promise<void> {
  const { dayAnchorMs } = resolveSeedAnchor(process.env[SEED_ANCHOR_DATE_ENV])
  const cutoffMs = dayAnchorMs - DEFAULT_DATA_RETENTION_CONFIG.copyright_ai_run_days * DAY_MS
  const cutoffId = getMinUuidv7ForDate(new Date(cutoffMs))
  const batchSize = DEFAULT_DATA_RETENTION_CONFIG.batch_size
  const label = COPYRIGHT_AI_RUN_RETENTION_SCENARIOS[kind]
  const fixture = await seedCopyrightAiRunRetention(kind, cutoffMs, batchSize + 1, RECENT_COUNT)
  const { table, expiredIds, recentIds } = fixture

  try {
    registerScenarioContract(label, {
      seededRows: { [table]: expiredIds.length + recentIds.length },
      expectations: [
        { kind: 'usesIndexes', indexes: [`${table}_pkey`], noSort: true },
        // Candidate selection, lookup and ModifyTable each account for one page.
        { kind: 'maxProcessedRows', relation: table, max: 3 * batchSize },
      ],
    })
    const deleteBatch = () => deleteExpiredCopyrightAiRunBatch(kind, cutoffId, batchSize)
    await runAndCapture(
      label,
      async () => {
        assert.equal(await deleteBatch(), batchSize)
      },
      kind,
      QUERY_NAME,
      {
        exactCapturedNames: [QUERY_NAME],
        afterCapture: async () => {
          assert.deepEqual(await fixture.readRemainingIds(), [
            ...expiredIds.slice(-1),
            ...recentIds,
          ])
          assert.equal(await deleteBatch(), 1)
          assert.deepEqual(await fixture.readRemainingIds(), recentIds)
          assert.equal(await deleteBatch(), 0)
          // Restore the full expired page for both rollback-only EXPLAIN passes.
          await fixture.restoreExpired()
        },
      },
    )
  } finally {
    await fixture.dropRuns()
  }
}
