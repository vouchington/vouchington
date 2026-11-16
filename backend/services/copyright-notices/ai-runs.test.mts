import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS } from '@ts-shared/utils/copyright-submission-guidance'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import {
  COPYRIGHT_AI_RUN_TABLES,
  createCopyrightCaseWithAiRunSubjects,
  readTestCopyrightAiRun,
  setTestCopyrightAiRunTimestamps,
} from '@voucha/test-helpers/copyright-ai-run-fixtures'
import {
  admitCopyrightAppealRecommendationRun,
  markCopyrightAppealRecommendationRunExpired,
  markCopyrightAppealRecommendationRunFailed,
} from './appeal-recommendation-runs.mts'
import { copyrightAppealRecommendations } from './appeal-recommendations.mts'
import {
  admitCopyrightEmailRecommendationRun,
  markCopyrightEmailRecommendationRunExpired,
  markCopyrightEmailRecommendationRunFailed,
} from './email-recommendation-runs.mts'
import { appendCopyrightEmailIntakeRecommendation } from './email-recommendations.mts'
import {
  admitCopyrightSubmissionGuidanceRun,
  markCopyrightSubmissionGuidanceRunExpired,
  markCopyrightSubmissionGuidanceRunFailed,
} from './submission-guidance-runs.mts'
import { appendCopyrightSubmissionGuidance } from './submission-guidance.mts'

type Table = (typeof COPYRIGHT_AI_RUN_TABLES)[keyof typeof COPYRIGHT_AI_RUN_TABLES]

type Flow = {
  name: string
  table: Table
  resultColumn: string
  /** A fresh subject owned by this test. */
  subject: () => Promise<string>
  admit: (subjectId: string) => Promise<string | null>
  /** Writes the immutable result and completes the run; false when the run already ended. */
  succeed: (subjectId: string, runId: string) => Promise<boolean>
  fail: (runId: string) => Promise<void>
  expire: (runId: string) => Promise<void>
}

const digest = () => createHash('sha256').update(randomBytes(8)).digest()

const flows: Flow[] = [
  {
    name: 'appeal recommendation',
    table: COPYRIGHT_AI_RUN_TABLES.appeal,
    resultColumn: 'copyright_notice_appeal_recommendation_id',
    subject: async () => (await createCopyrightCaseWithAiRunSubjects()).appealSubmissionId,
    admit: admitCopyrightAppealRecommendationRun,
    succeed: (submissionId, runId) =>
      copyrightAppealRecommendations.append({
        submissionId,
        runId,
        inputSha256: digest(),
        promptVersion: 'test-v1',
        model: 'test-model',
        recommendation: 'uncertain',
        rationale: 'A moderator should review.',
      }),
    fail: markCopyrightAppealRecommendationRunFailed,
    expire: markCopyrightAppealRecommendationRunExpired,
  },
  {
    name: 'submission guidance',
    table: COPYRIGHT_AI_RUN_TABLES.guidance,
    resultColumn: 'copyright_notice_submission_guidance_id',
    subject: async () => (await createCopyrightCaseWithAiRunSubjects()).counterNoticeSubmissionId,
    admit: admitCopyrightSubmissionGuidanceRun,
    succeed: (submissionId, runId) =>
      appendCopyrightSubmissionGuidance({
        submissionId,
        runId,
        inputSha256: digest(),
        promptVersion: 'test-v1',
        model: 'test-model',
        guidance: {
          summary: 'The filer disputes the restriction.',
          elements: COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS.map(element => ({
            element,
            status: 'present' as const,
            gap: null,
          })),
          risk_notes: [],
        },
      }),
    fail: markCopyrightSubmissionGuidanceRunFailed,
    expire: markCopyrightSubmissionGuidanceRunExpired,
  },
  {
    name: 'email intake recommendation',
    table: COPYRIGHT_AI_RUN_TABLES.email,
    resultColumn: 'copyright_notice_email_intake_recommendation_id',
    subject: async () => (await createParsedCopyrightEmailIntake()).id,
    admit: admitCopyrightEmailRecommendationRun,
    succeed: (intakeId, runId) =>
      appendCopyrightEmailIntakeRecommendation({
        intakeId,
        runId,
        inputSha256: digest(),
        promptVersion: 'test-v1',
        model: 'test-model',
        structuredOutput: { recommendation: 'potentially_valid' },
      }),
    fail: markCopyrightEmailRecommendationRunFailed,
    expire: markCopyrightEmailRecommendationRunExpired,
  },
]

describe.each(flows)('copyright AI run: $name', flow => {
  it('admits idempotently, returning the active run to every caller', async () => {
    const subjectId = await flow.subject()
    const [first, second] = await Promise.all([flow.admit(subjectId), flow.admit(subjectId)])
    expect(first).toBeTruthy()
    expect(second).toBe(first)
    expect(await readTestCopyrightAiRun(flow.table, first!)).toMatchObject({ status: 'active' })
    expect(await flow.admit(subjectId)).toBe(first)
  })

  it('completes the run with its result, and a delayed failure cannot undo the success', async () => {
    const subjectId = await flow.subject()
    const runId = (await flow.admit(subjectId))!
    expect(await flow.succeed(subjectId, runId)).toBe(true)
    await flow.fail(runId)
    await flow.expire(runId)
    expect(await readTestCopyrightAiRun(flow.table, runId)).toEqual({
      status: 'succeeded',
      completed: true,
      has_result: true,
    })
    // A finished run frees the subject for a fresh admission.
    // Appeal and guidance subjects can be re-run; a completed email recommendation never is.
    const next = await flow.admit(subjectId)
    expect(next === null).toBe(flow.name === 'email intake recommendation')
    expect(next).not.toBe(runId)
  })

  it('records a definitive failure and refuses a later success for that run', async () => {
    const subjectId = await flow.subject()
    const runId = (await flow.admit(subjectId))!
    await flow.fail(runId)
    expect(await flow.succeed(subjectId, runId)).toBe(false)
    expect(await readTestCopyrightAiRun(flow.table, runId)).toEqual({
      status: 'failed',
      completed: false,
      has_result: false,
    })
  })

  it('expires a run whose input no longer applies and admits a new one afterwards', async () => {
    const subjectId = await flow.subject()
    const runId = (await flow.admit(subjectId))!
    await flow.expire(runId)
    expect(await readTestCopyrightAiRun(flow.table, runId)).toMatchObject({ status: 'expired' })
    expect(await flow.succeed(subjectId, runId)).toBe(false)
    const replacement = await flow.admit(subjectId)
    expect(replacement).toEqual(expect.any(String))
    expect(replacement).not.toBe(runId)
  })

  it('rejects a completion without a result and more than one terminal timestamp', async () => {
    const subjectId = await flow.subject()
    const runId = (await flow.admit(subjectId))!
    await expect(
      setTestCopyrightAiRunTimestamps(flow.table, runId, 'completed_at = now()'),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      setTestCopyrightAiRunTimestamps(flow.table, runId, 'failed_at = now(), expired_at = now()'),
    ).rejects.toMatchObject({ code: '23514' })
    expect(await readTestCopyrightAiRun(flow.table, runId)).toMatchObject({ status: 'active' })
  })
})
