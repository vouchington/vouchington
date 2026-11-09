import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { createModerationAppealDraft } from '@services/moderation-appeals/create-appeal-draft'
import {
  appealResolutionRunId,
  createAppealResolutionRun,
  getAppealResolutionRunOutcome,
  getAppealResolutionRunStatus,
  markAppealResolutionRunExpired,
  markAppealResolutionRunFailed,
} from '@services/moderation-appeals/rerun-outcomes'
import { registerModerationRerunScenario as register } from './moderation-rerun-contract.mts'
import { runAndCapture } from '../run-support.mts'

export async function runAppealScenarios(appealId: string, requestToken: string): Promise<void> {
  register('appeal-rerun-admission')
  await runAndCapture(
    'appeal-rerun-admission',
    async () => {
      await using transaction = await beginTransaction()
      const { rows: tokens } = await transaction<{ id: string }>(
        '/* moderationRerunOutcome:token */ SELECT uuidv7() AS id',
      )
      const admissionToken = tokens[0]!.id
      await createAppealResolutionRun(transaction, appealId, admissionToken)
      await transaction.rollback()
    },
    undefined,
    'createAppealResolutionRun',
  )

  await createAppealResolutionRun(write, appealId, requestToken)
  register('appeal-rerun-status')
  await runAndCapture(
    'appeal-rerun-status',
    async () => {
      assert.equal(await getAppealResolutionRunStatus(appealId, requestToken), 'active')
    },
    undefined,
    'getAppealResolutionRunStatus',
  )
  register('appeal-rerun-result')
  await runAndCapture(
    'appeal-rerun-result',
    async () => {
      assert.deepEqual(
        await getAppealResolutionRunOutcome(appealId, appealResolutionRunId(requestToken)),
        {
          run_id: appealResolutionRunId(requestToken),
          status: 'active',
          ai_drafted_at: null,
          latest_lifecycle_change_id: null,
        },
      )
    },
    undefined,
    'getAppealResolutionRunOutcome',
  )

  register('appeal-rerun-success')
  await runAndCapture(
    'appeal-rerun-success',
    async () => {
      const result = await createModerationAppealDraft({
        appealId,
        requestToken,
        runId: appealResolutionRunId(requestToken),
        recommendedAction: 'deny',
        aiPublicResponse: 'EXPLAIN fixture',
        aiInternalResponse: 'EXPLAIN fixture',
        model: 'explain-fixture',
      })
      assert(result)
    },
    undefined,
    'createModerationAppealDraft',
  )

  const failedToken = await addAppealRun(appealId)
  register('appeal-rerun-failed')
  await runAndCapture(
    'appeal-rerun-failed',
    async () => {
      await markAppealResolutionRunFailed(appealId, failedToken)
      assert.equal(await getAppealResolutionRunStatus(appealId, failedToken), 'failed')
    },
    undefined,
    'markAppealResolutionRunFailed',
    {
      afterCapture: () => restoreAppealOutcome(failedToken, 'failed_at'),
    },
  )
  const expiredToken = await addAppealRun(appealId)
  register('appeal-rerun-expired')
  await runAndCapture(
    'appeal-rerun-expired',
    async () => {
      await markAppealResolutionRunExpired(appealId, expiredToken)
      assert.equal(await getAppealResolutionRunStatus(appealId, expiredToken), 'expired')
    },
    undefined,
    'markAppealResolutionRunExpired',
    {
      afterCapture: () => restoreAppealOutcome(expiredToken, 'expired_at'),
    },
  )
}

async function addAppealRun(appealId: string): Promise<string> {
  const { rows } = await write<{ id: string }>(
    '/* moderationRerunOutcome:addAppealRun */ INSERT INTO moderation_appeal_resolution_runs (moderation_appeal_id) VALUES ($1::uuid) RETURNING id',
    [appealId],
  )
  return rows[0]!.id
}

async function restoreAppealOutcome(runId: string, column: 'failed_at' | 'expired_at') {
  if (column === 'failed_at')
    await write(
      '/* restoreModerationRerunOutcome:appealFailed */ UPDATE moderation_appeal_resolution_runs SET failed_at = NULL WHERE id = $1::uuid',
      [runId],
    )
  else
    await write(
      '/* restoreModerationRerunOutcome:appealExpired */ UPDATE moderation_appeal_resolution_runs SET expired_at = NULL WHERE id = $1::uuid',
      [runId],
    )
}
