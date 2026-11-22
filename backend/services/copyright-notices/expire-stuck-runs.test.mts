import { describe, expect, it } from 'vitest'
import { getMinUuidv7ForDate } from '@modules/utils'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import {
  COPYRIGHT_AI_RUN_TABLES,
  createCopyrightCaseWithAiRunSubjects,
  readTestCopyrightAiRun,
} from '@voucha/test-helpers/copyright-ai-run-fixtures'
import { admitCopyrightAppealRecommendationRun } from './appeal-recommendation-runs.mts'
import { admitCopyrightEmailRecommendationRun } from './email-recommendation-runs.mts'
import {
  expireStuckCopyrightAppealRecommendationRunPage,
  expireStuckCopyrightEmailRecommendationRunPage,
  expireStuckCopyrightSubmissionGuidanceRunPage,
} from './expire-stuck-runs.mts'
import { admitCopyrightSubmissionGuidanceRun } from './submission-guidance-runs.mts'

const FUTURE = () => getMinUuidv7ForDate(new Date(Date.now() + 48 * 60 * 60 * 1000))
const PAST = () => getMinUuidv7ForDate(new Date(Date.now() - 48 * 60 * 60 * 1000))

const flows = [
  {
    name: 'email intake recommendation',
    table: COPYRIGHT_AI_RUN_TABLES.email,
    subject: async () => (await createParsedCopyrightEmailIntake()).id,
    admit: admitCopyrightEmailRecommendationRun,
    expirePage: expireStuckCopyrightEmailRecommendationRunPage,
  },
  {
    name: 'appeal recommendation',
    table: COPYRIGHT_AI_RUN_TABLES.appeal,
    subject: async () => (await createCopyrightCaseWithAiRunSubjects()).appealSubmissionId,
    admit: admitCopyrightAppealRecommendationRun,
    expirePage: expireStuckCopyrightAppealRecommendationRunPage,
  },
  {
    name: 'submission guidance',
    table: COPYRIGHT_AI_RUN_TABLES.guidance,
    subject: async () => (await createCopyrightCaseWithAiRunSubjects()).counterNoticeSubmissionId,
    admit: admitCopyrightSubmissionGuidanceRun,
    expirePage: expireStuckCopyrightSubmissionGuidanceRunPage,
  },
]

describe.each(flows)('stuck copyright run recovery: $name', flow => {
  it('marks an old active run failed so the next admission opens a new run', async () => {
    const subjectId = await flow.subject()
    const runId = (await flow.admit(subjectId))!

    expect(await flow.expirePage(FUTURE(), 10, [runId])).toBe(1)

    expect(await readTestCopyrightAiRun(flow.table, runId)).toMatchObject({ status: 'failed' })
    const next = await flow.admit(subjectId)
    expect(next).toBeTruthy()
    expect(next).not.toBe(runId)
  })

  it('leaves a run younger than the cutoff active', async () => {
    const subjectId = await flow.subject()
    const runId = (await flow.admit(subjectId))!

    expect(await flow.expirePage(PAST(), 10, [runId])).toBe(0)

    expect(await readTestCopyrightAiRun(flow.table, runId)).toMatchObject({ status: 'active' })
  })

  it('does not mark a run it already failed a second time', async () => {
    const subjectId = await flow.subject()
    const runId = (await flow.admit(subjectId))!
    await flow.expirePage(FUTURE(), 10, [runId])

    expect(await flow.expirePage(FUTURE(), 10, [runId])).toBe(0)
  })
})
