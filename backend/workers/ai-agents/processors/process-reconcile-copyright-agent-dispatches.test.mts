import { getPendingCopyrightAgentDispatches } from '@services/copyright-notices'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { ai_agents } from '@queues/ai-agents/queues'
import { copyrightSweepConfig } from '@services/copyright-notices/work-limits'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  rejectPostgresWriteForTest,
  rejectQueueJobAddForTest,
} from '@voucha/test-helpers/injected-failures'
import { readTestPendingCopyrightAgentDispatches } from '@voucha/test-helpers/services/copyright-notices/pending-agent-dispatches'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  continuationsAfter,
  jobFor,
  jobIds,
  removeTrackedJob,
  pendingAppeal,
  pendingEmail,
  pendingFormEffect,
  pendingFormScreening,
} from '@voucha/test-helpers/copyright-dispatch-reconcile-fixtures'
import { copyrightAgentDispatchProcessors as stages } from './process-reconcile-copyright-agent-dispatches.mts'

const rejection = (run: Promise<unknown>) => run.then(() => null).catch((err: unknown) => err)

describe('copyrightAgentDispatchProcessors', () => {
  const enqueued: string[] = []
  const track = (...ids: string[]) => enqueued.push(...ids)

  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(enqueued.splice(0).map(removeTrackedJob))
  })

  describe('while new intake is switched on', () => {
    useCopyrightIntakeEnvironment()
    useAutomaticProvisionalWithholding()

    it('re-enqueues each advisory gap in its own stage and applies saved form effects without an agent run', async () => {
      const excluded = await pendingFormEffect()
      onTestFinished(async () => {
        await expect(countCopyrightActiveRestrictionsForNotice(excluded.noticeId)).resolves.toBe(0)
      })
      const [emailId, formId, effect, appealId] = await Promise.all([
        pendingEmail(),
        pendingFormScreening(),
        pendingFormEffect(),
        pendingAppeal(),
      ])
      track(jobIds.email(emailId), jobIds.form(formId), jobIds.appeal(appealId))
      const ids = [emailId, formId, effect.submissionId, appealId]
      const options = { ids, batchSize: 1 }

      await expect(stages.email({}, options)).resolves.toEqual({ hasMore: false })
      await expect(jobFor(jobIds.email(emailId))).resolves.toEqual({
        name: 'copyright-email-intake',
        data: { intake_id: emailId },
      })
      await expect(jobFor(jobIds.form(formId))).resolves.toBeNull()

      await expect(stages['form-screening']({}, options)).resolves.toEqual({ hasMore: false })
      await expect(jobFor(jobIds.form(formId))).resolves.toEqual({
        name: 'copyright-form-screening',
        data: { submission_id: formId },
      })
      await expect(jobFor(jobIds.appeal(appealId))).resolves.toBeNull()

      await expect(stages.appeal({}, options)).resolves.toEqual({ hasMore: false })
      await expect(jobFor(jobIds.appeal(appealId))).resolves.toEqual({
        name: 'copyright-appeal-recommendation',
        data: { submission_id: appealId },
      })
      await expect(countCopyrightActiveRestrictionsForNotice(effect.noticeId)).resolves.toBe(0)

      await expect(stages['form-effect']({}, options)).resolves.toEqual({ hasMore: false })
      await expect(jobFor(jobIds.form(effect.submissionId))).resolves.toBeNull()
      await expect(countCopyrightActiveRestrictionsForNotice(effect.noticeId)).resolves.toBe(1)
      await expect(readTestPendingCopyrightAgentDispatches(effect.submissionId)).resolves.toEqual(
        [],
      )
    })

    it('walks every page of a stage backlog', async () => {
      onTestFinished(
        overrideDynamicConfigFieldsForTest(copyrightSweepConfig, { agent_email_batch_size: 1 }),
      )
      const [headId, tailId] = await Promise.all([pendingEmail(), pendingEmail()])
      track(jobIds.email(headId), jobIds.email(tailId))
      const ids = [headId, tailId]
      const page = await getPendingCopyrightAgentDispatches({ ids, limit: 1, kind: 'email' })
      expect(page.results).toHaveLength(1)
      expect(page.page_info.has_next_page).toBe(true)

      await expect(stages.email({}, { ids })).resolves.toEqual({ hasMore: false })

      for (const id of ids) {
        await expect(jobFor(jobIds.email(id))).resolves.toEqual({
          name: 'copyright-email-intake',
          data: { intake_id: id },
        })
      }
    })

    it('continues beyond its cap despite a failed head and resumes at the saved cursor', async () => {
      onTestFinished(
        overrideDynamicConfigFieldsForTest(copyrightSweepConfig, {
          agent_email_batch_size: 1,
          agent_email_max_batches_per_run: 1,
        }),
      )
      const headId = await pendingEmail()
      const tailId = await pendingEmail()
      const first = await getPendingCopyrightAgentDispatches({
        ids: [headId, tailId],
        limit: 1,
        kind: 'email',
      })
      expect(first.results).toEqual([{ kind: 'email', intakeId: headId }])
      expect(first.page_info.has_next_page).toBe(true)
      const cursor = first.page_info.end_cursor!
      track(jobIds.email(headId), jobIds.email(tailId))
      const headFailure = new Error('head failed')
      onTestFinished(
        rejectQueueJobAddForTest(
          ai_agents,
          (name, data) =>
            name === 'copyright-email-intake' && 'intake_id' in data && data.intake_id === headId,
          headFailure,
        ),
      )
      const ids = [headId, tailId]

      const failure = await rejection(stages.email({}, { ids }))

      expect(failure).toBeInstanceOf(AggregateError)
      expect((failure as AggregateError).errors).toEqual([headFailure])
      const continuations = await continuationsAfter('email', cursor)
      expect(continuations.map(job => job.data)).toEqual([{ after: cursor }])
      track(...continuations.map(job => job.id))
      await expect(jobFor(jobIds.email(headId))).resolves.toBeNull()

      await expect(stages.email({ after: cursor }, { ids })).resolves.toEqual({ hasMore: false })
      await expect(jobFor(jobIds.email(tailId))).resolves.toEqual({
        name: 'copyright-email-intake',
        data: { intake_id: tailId },
      })
    })

    it('keeps enqueueing past a failed email, then fails only its own stage', async () => {
      const failingEmailId = await pendingEmail()
      const [nextEmailId, appealId] = await Promise.all([pendingEmail(), pendingAppeal()])
      track(jobIds.email(failingEmailId), jobIds.email(nextEmailId), jobIds.appeal(appealId))
      const enqueueFailure = new Error('enqueue failed')
      onTestFinished(
        rejectQueueJobAddForTest(
          ai_agents,
          (name, data) =>
            name === 'copyright-email-intake' &&
            'intake_id' in data &&
            data.intake_id === failingEmailId,
          enqueueFailure,
        ),
      )
      const ids = [failingEmailId, appealId, nextEmailId]

      const failure = await rejection(stages.email({}, { ids, batchSize: 1 }))

      expect(failure).toBeInstanceOf(AggregateError)
      expect((failure as AggregateError).errors).toEqual([enqueueFailure])
      await expect(jobFor(jobIds.email(nextEmailId))).resolves.toEqual({
        name: 'copyright-email-intake',
        data: { intake_id: nextEmailId },
      })
      await expect(stages.appeal({}, { ids, batchSize: 1 })).resolves.toEqual({ hasMore: false })
      await expect(jobFor(jobIds.appeal(appealId))).resolves.toEqual({
        name: 'copyright-appeal-recommendation',
        data: { submission_id: appealId },
      })
    })

    it('keeps applying form effects past a failed one, then fails with its error', async () => {
      const excluded = await pendingFormEffect()
      onTestFinished(async () => {
        await expect(countCopyrightActiveRestrictionsForNotice(excluded.noticeId)).resolves.toBe(0)
      })
      const [failingEffect, sameEffect] = await Promise.all([
        pendingFormEffect(),
        pendingFormEffect(),
      ])
      const effectFailure = new Error('form effect failed')
      onTestFinished(
        rejectPostgresWriteForTest('readAutomaticWithholdingClaimant', effectFailure, values =>
          values.includes(failingEffect.submissionId),
        ),
      )
      const ids = [failingEffect.submissionId, sameEffect.submissionId]

      const failure = await rejection(stages['form-effect']({}, { ids, batchSize: 1 }))

      expect(failure).toBeInstanceOf(AggregateError)
      expect((failure as AggregateError).errors).toEqual([effectFailure])
      await expect(countCopyrightActiveRestrictionsForNotice(sameEffect.noticeId)).resolves.toBe(1)
      await expect(countCopyrightActiveRestrictionsForNotice(failingEffect.noticeId)).resolves.toBe(
        0,
      )
    })
  })

  describe('while new intake is switched on, with a failing admission', () => {
    useCopyrightIntakeEnvironment()

    it('records an admission failure and enqueues nothing for the page', async () => {
      const appealId = await pendingAppeal()
      const admissionFailure = new Error('admission failed')
      onTestFinished(
        rejectPostgresWriteForTest('admitCopyrightAppealRecommendationRuns', admissionFailure),
      )

      const failure = await rejection(stages.appeal({}, { ids: [appealId], batchSize: 1 }))

      expect(failure).toBeInstanceOf(AggregateError)
      expect((failure as AggregateError).errors).toEqual([admissionFailure])
      await expect(jobFor(jobIds.appeal(appealId))).resolves.toBeNull()
    })
  })

  describe('while new intake is switched off', () => {
    useCopyrightIntakeEnvironment({ enabled: false })
    useAutomaticProvisionalWithholding()

    it('still re-enqueues appeal recommendations but not email or form screening', async () => {
      const excluded = await pendingFormEffect()
      onTestFinished(async () => {
        await expect(countCopyrightActiveRestrictionsForNotice(excluded.noticeId)).resolves.toBe(0)
      })
      const [emailId, formId, appealId] = await Promise.all([
        pendingEmail(),
        pendingFormScreening(),
        pendingAppeal(),
      ])
      track(jobIds.email(emailId), jobIds.form(formId), jobIds.appeal(appealId))
      const options = { ids: [emailId, formId, appealId], batchSize: 1 }

      await expect(stages.email({}, options)).resolves.toEqual({ hasMore: false })
      await expect(stages['form-screening']({}, options)).resolves.toEqual({ hasMore: false })
      await stages.appeal({}, options)

      await expect(jobFor(jobIds.appeal(appealId))).resolves.toEqual({
        name: 'copyright-appeal-recommendation',
        data: { submission_id: appealId },
      })
      await expect(jobFor(jobIds.email(emailId))).resolves.toBeNull()
      await expect(jobFor(jobIds.form(formId))).resolves.toBeNull()
      await expect(readTestPendingCopyrightAgentDispatches(emailId)).resolves.toEqual([
        { kind: 'email', intakeId: emailId },
      ])
    })

    it('still applies a saved form effect, because it starts no agent work', async () => {
      const excluded = await pendingFormEffect()
      onTestFinished(async () => {
        await expect(countCopyrightActiveRestrictionsForNotice(excluded.noticeId)).resolves.toBe(0)
      })
      const effect = await pendingFormEffect()

      await stages['form-effect']({}, { ids: [effect.submissionId], batchSize: 1 })

      await expect(countCopyrightActiveRestrictionsForNotice(effect.noticeId)).resolves.toBe(1)
    })
  })
})
