import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, insertTestUserWarning, WEB_PROVENANCE } from '@voucha/test-helpers'
import { appealResolutionRunInputForTest } from '@voucha/test-helpers/appeal-resolution-run'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createModerationAppeal } from '@services/moderation-appeals/create'
import { parseCreateModerationAppealInput } from '@services/moderation-appeals/parse'
import {
  getAppealResolutionRunStatus,
  markAppealResolutionRunsFailed,
} from '@services/moderation-appeals/rerun-outcomes'
import { createAIAgentReportFixture } from '@voucha/test-helpers/ai-agent-worker-fixtures'
import {
  createReportJudgementRun,
  getReportJudgementRunStatus,
  markReportJudgementRunFailed,
} from '@services/moderation-reports/rerun-outcomes'
import {
  processExpireStuckAppealResolutionRuns,
  processExpireStuckReportJudgementRuns,
} from './process-expire-stuck-resolution-runs.mts'

const LATER = () => new Date(Date.now() + 48 * 60 * 60 * 1000)

describe('expire stuck appeal resolution runs', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  /** An appeal commits with its active run; a failed post-commit admission leaves it active. */
  async function makeStuckRun() {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const { appeal } = await createModerationAppeal(
      appellant,
      WEB_PROVENANCE,
      parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: `Stuck run ${crypto.randomUUID()}`,
      }),
    )
    const { runId } = await appealResolutionRunInputForTest(appeal.id)
    return { appealId: appeal.id, runId }
  }

  it('expires an old active run on a later sweep tick', async () => {
    const { appealId, runId } = await makeStuckRun()
    expect(await getAppealResolutionRunStatus(appealId, runId)).toBe('active')

    const result = await processExpireStuckAppealResolutionRuns({
      now: LATER(),
      runIds: [runId],
    })

    expect(result).toEqual({ deleted: 1, hasMore: false })
    expect(await getAppealResolutionRunStatus(appealId, runId)).toBe('expired')
  })

  it('leaves a run younger than the age bound active', async () => {
    const { appealId, runId } = await makeStuckRun()

    await processExpireStuckAppealResolutionRuns({ runIds: [runId] })

    expect(await getAppealResolutionRunStatus(appealId, runId)).toBe('active')
  })

  it('leaves a run that already finished unchanged', async () => {
    const { appealId, runId } = await makeStuckRun()
    expect(await markAppealResolutionRunsFailed([{ appealId, runId }])).toBe(1)

    const result = await processExpireStuckAppealResolutionRuns({
      now: LATER(),
      runIds: [runId],
    })

    expect(result).toEqual({ deleted: 0, hasMore: false })
    expect(await getAppealResolutionRunStatus(appealId, runId)).toBe('failed')
  })

  it('caps one run at its page budget and the next tick resumes', async () => {
    const first = await makeStuckRun()
    const second = await makeStuckRun()
    const runIds = [first.runId, second.runId]

    const capped = await processExpireStuckAppealResolutionRuns({
      now: LATER(),
      runIds,
      limits: { batchSize: 1, maxBatches: 1 },
    })
    expect(capped).toEqual({ deleted: 1, hasMore: true })
    const statuses = await Promise.all([
      getAppealResolutionRunStatus(first.appealId, first.runId),
      getAppealResolutionRunStatus(second.appealId, second.runId),
    ])
    expect(statuses.toSorted((a, b) => a!.localeCompare(b!))).toEqual(['active', 'expired'])

    await processExpireStuckAppealResolutionRuns({ now: LATER(), runIds })
    expect(await getAppealResolutionRunStatus(first.appealId, first.runId)).toBe('expired')
    expect(await getAppealResolutionRunStatus(second.appealId, second.runId)).toBe('expired')
  })
})

async function makeActiveRun() {
  const reportId = (await createAIAgentReportFixture()).data.triggering_report_id
  return { reportId, runId: await createReportJudgementRun(reportId) }
}

describe('expire stuck report judgement runs', () => {
  it('expires an old active run that a crash left without a failure marker', async () => {
    const { reportId, runId } = await makeActiveRun()

    const result = await processExpireStuckReportJudgementRuns({ now: LATER(), runIds: [runId] })

    expect(result).toEqual({ deleted: 1, hasMore: false })
    expect(await getReportJudgementRunStatus(reportId, runId)).toBe('expired')
  })

  it('leaves a run younger than the age bound active', async () => {
    const { reportId, runId } = await makeActiveRun()

    await processExpireStuckReportJudgementRuns({ runIds: [runId] })

    expect(await getReportJudgementRunStatus(reportId, runId)).toBe('active')
  })

  it('leaves a run the worker already marked failed unchanged', async () => {
    const { reportId, runId } = await makeActiveRun()
    await markReportJudgementRunFailed(reportId, runId)

    const result = await processExpireStuckReportJudgementRuns({ now: LATER(), runIds: [runId] })

    expect(result).toEqual({ deleted: 0, hasMore: false })
    expect(await getReportJudgementRunStatus(reportId, runId)).toBe('failed')
  })

  it('caps one run at its page budget and the next tick resumes', async () => {
    const first = await makeActiveRun()
    const second = await makeActiveRun()
    const runIds = [first.runId, second.runId]

    const capped = await processExpireStuckReportJudgementRuns({
      now: LATER(),
      runIds,
      limits: { batchSize: 1, maxBatches: 1 },
    })
    expect(capped).toEqual({ deleted: 1, hasMore: true })

    await processExpireStuckReportJudgementRuns({ now: LATER(), runIds })
    expect(await getReportJudgementRunStatus(first.reportId, first.runId)).toBe('expired')
    expect(await getReportJudgementRunStatus(second.reportId, second.runId)).toBe('expired')
  })
})
