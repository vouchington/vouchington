import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { UnrecoverableError } from 'glide-mq'
import type { NamedQueueJob } from '@data-stores/valkey-glide-mq'
import type { AIAgentJobPayloads } from '@queues/ai-agents/types'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import {
  COPYRIGHT_AI_RUN_TABLES,
  createCopyrightCaseWithAiRunSubjects,
  readTestCopyrightAiRun,
} from '@voucha/test-helpers/copyright-ai-run-fixtures'
import { admitCopyrightAppealRecommendationRun } from '@services/copyright-notices/appeal-recommendation-runs'
import { copyrightAppealRecommendations } from '@services/copyright-notices/appeal-recommendations'
import { admitCopyrightEmailRecommendationRun } from '@services/copyright-notices/email-recommendation-runs'
import { admitCopyrightSubmissionGuidanceRun } from '@services/copyright-notices/submission-guidance-runs'
import { withDurableRerunOutcome } from './durable-rerun-outcomes.mts'

type Job = NamedQueueJob<AIAgentJobPayloads>

/** A final-attempt job; the default persistence path then marks its run failed. */
function finalAttemptJob(name: string, data: Record<string, string>): Job {
  return { name, data, attemptsMade: 0, opts: { attempts: 1 } } as unknown as Job
}

const failProcessing = async () => {
  throw new UnrecoverableError('Owned permanent processor failure')
}

describe('copyright AI run terminal outcomes', () => {
  it('marks the admitted run failed when the processor ends permanently', async () => {
    const { appealSubmissionId, counterNoticeSubmissionId } =
      await createCopyrightCaseWithAiRunSubjects()
    const intake = await createParsedCopyrightEmailIntake()
    const appealRun = (await admitCopyrightAppealRecommendationRun(appealSubmissionId))!
    const guidanceRun = (await admitCopyrightSubmissionGuidanceRun(counterNoticeSubmissionId))!
    const emailRun = (await admitCopyrightEmailRecommendationRun(intake.id))!
    const jobs: Array<[string, string, string, Record<string, string>]> = [
      [
        COPYRIGHT_AI_RUN_TABLES.appeal,
        appealRun,
        'copyright-appeal-recommendation',
        { submission_id: appealSubmissionId, run_id: appealRun },
      ],
      [
        COPYRIGHT_AI_RUN_TABLES.guidance,
        guidanceRun,
        'copyright-submission-guidance',
        { submission_id: counterNoticeSubmissionId, run_id: guidanceRun },
      ],
      [
        COPYRIGHT_AI_RUN_TABLES.email,
        emailRun,
        'copyright-email-intake',
        { intake_id: intake.id, run_id: emailRun },
      ],
    ]
    for (const [table, runId, name, data] of jobs) {
      await expect(
        withDurableRerunOutcome(finalAttemptJob(name, data), failProcessing),
      ).rejects.toThrow('Owned permanent processor failure')
      expect(await readTestCopyrightAiRun(table as never, runId)).toMatchObject({
        status: 'failed',
      })
    }
  })

  it('keeps a succeeded run succeeded when the job then reports a late failure', async () => {
    const { appealSubmissionId } = await createCopyrightCaseWithAiRunSubjects()
    const runId = (await admitCopyrightAppealRecommendationRun(appealSubmissionId))!
    expect(
      await copyrightAppealRecommendations.append({
        submissionId: appealSubmissionId,
        runId,
        inputSha256: createHash('sha256').update(randomBytes(8)).digest(),
        promptVersion: 'test-v1',
        model: 'test-model',
        recommendation: 'uncertain',
        rationale: 'A moderator should review.',
      }),
    ).toBe(true)
    await expect(
      withDurableRerunOutcome(
        finalAttemptJob('copyright-appeal-recommendation', {
          submission_id: appealSubmissionId,
          run_id: runId,
        }),
        failProcessing,
      ),
    ).rejects.toThrow('Owned permanent processor failure')
    expect(await readTestCopyrightAiRun(COPYRIGHT_AI_RUN_TABLES.appeal, runId)).toEqual({
      status: 'succeeded',
      completed: true,
      has_result: true,
    })
  })
})
