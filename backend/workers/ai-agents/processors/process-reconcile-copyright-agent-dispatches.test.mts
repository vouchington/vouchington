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
  pendingAppeal,
  pendingEmail,
  pendingFormEffect,
  pendingFormScreening,
} from '@voucha/test-helpers/copyright-dispatch-reconcile-fixtures'
import { processReconcileCopyrightAgentDispatches } from './process-reconcile-copyright-agent-dispatches.mts'

describe('processReconcileCopyrightAgentDispatches', () => {
  const enqueued: string[] = []
  const track = (...ids: string[]) => enqueued.push(...ids)

  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(
      enqueued.splice(0).map(async id => {
        const job = await ai_agents.getJob(id)
        await job?.remove()
      }),
    )
  })

  describe('while new intake is switched on', () => {
    useCopyrightIntakeEnvironment()
    useAutomaticProvisionalWithholding()

    it('re-enqueues advisory gaps and applies saved form effects without an agent run', async () => {
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

      await expect(
        processReconcileCopyrightAgentDispatches({}, { ids, batchSize: 1 }),
      ).resolves.toEqual({
        hasMore: false,
      })

      await expect(jobFor(jobIds.email(emailId))).resolves.toEqual({
        name: 'copyright-email-intake',
        data: { intake_id: emailId },
      })
      await expect(jobFor(jobIds.form(formId))).resolves.toEqual({
        name: 'copyright-form-screening',
        data: { submission_id: formId },
      })
      await expect(jobFor(jobIds.appeal(appealId))).resolves.toEqual({
        name: 'copyright-appeal-recommendation',
        data: { submission_id: appealId },
      })
      await expect(jobFor(jobIds.form(effect.submissionId))).resolves.toBeNull()
      await expect(countCopyrightActiveRestrictionsForNotice(effect.noticeId)).resolves.toBe(1)
      await expect(readTestPendingCopyrightAgentDispatches(effect.submissionId)).resolves.toEqual(
        [],
      )
    })

    it('walks every page of the pending backlog', async () => {
      onTestFinished(overrideDynamicConfigFieldsForTest(copyrightSweepConfig, { batch_size: 1 }))
      const excluded = await pendingFormEffect()
      onTestFinished(async () => {
        await expect(countCopyrightActiveRestrictionsForNotice(excluded.noticeId)).resolves.toBe(0)
      })
      const emailId = await pendingEmail()
      const effect = await pendingFormEffect()
      track(jobIds.email(emailId))
      const ids = [emailId, effect.submissionId]
      const page = await getPendingCopyrightAgentDispatches({ ids, limit: 1 })
      expect(page.results).toEqual([{ kind: 'email', intakeId: emailId }])
      expect(page.page_info.has_next_page).toBe(true)
      const tail = await getPendingCopyrightAgentDispatches({
        ids,
        limit: 1,
        after: page.page_info.end_cursor!,
      })
      expect(tail.results).toEqual([{ kind: 'form-effect', submissionId: effect.submissionId }])
      expect(tail.page_info.has_next_page).toBe(false)

      await processReconcileCopyrightAgentDispatches({}, { ids })

      await expect(jobFor(jobIds.email(emailId))).resolves.toEqual({
        name: 'copyright-email-intake',
        data: { intake_id: emailId },
      })
      await expect(countCopyrightActiveRestrictionsForNotice(effect.noticeId)).resolves.toBe(1)
    })

    it('continues beyond its cap despite a failed head and resumes at the saved cursor', async () => {
      const excluded = await pendingFormEffect()
      onTestFinished(async () => {
        await expect(countCopyrightActiveRestrictionsForNotice(excluded.noticeId)).resolves.toBe(0)
      })
      onTestFinished(
        overrideDynamicConfigFieldsForTest(copyrightSweepConfig, {
          batch_size: 1,
          max_batches_per_run: 1,
        }),
      )
      const headId = await pendingEmail()
      const tailId = await pendingEmail()
      const first = await getPendingCopyrightAgentDispatches({ ids: [headId, tailId], limit: 1 })
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

      const failure = await processReconcileCopyrightAgentDispatches(
        {},
        { ids, batchSize: 1 },
      ).then(
        () => null,
        (err: unknown) => err,
      )

      expect(failure).toBeInstanceOf(AggregateError)
      expect((failure as AggregateError).errors).toEqual([headFailure])
      const continuations = await continuationsAfter(cursor)
      expect(continuations.map(job => job.data)).toEqual([{ after: cursor }])
      track(...continuations.map(job => job.id))
      await expect(jobFor(jobIds.email(headId))).resolves.toBeNull()

      await expect(
        processReconcileCopyrightAgentDispatches({ after: cursor }, { ids, batchSize: 1 }),
      ).resolves.toEqual({ hasMore: false })
      await expect(jobFor(jobIds.email(tailId))).resolves.toEqual({
        name: 'copyright-email-intake',
        data: { intake_id: tailId },
      })
    })

    it('keeps dispatching past failed items, then fails with every error', async () => {
      const excluded = await pendingFormEffect()
      onTestFinished(async () => {
        await expect(countCopyrightActiveRestrictionsForNotice(excluded.noticeId)).resolves.toBe(0)
      })
      const failingEmailId = await pendingEmail()
      const [failingEffect, appealId, sameEffect, nextEmailId] = await Promise.all([
        pendingFormEffect(),
        pendingAppeal(),
        pendingFormEffect(),
        pendingEmail(),
      ])
      track(jobIds.email(failingEmailId), jobIds.appeal(appealId), jobIds.email(nextEmailId))
      const enqueueFailure = new Error('enqueue failed')
      const effectFailure = new Error('form effect failed')
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
      onTestFinished(
        rejectPostgresWriteForTest('readAutomaticWithholdingClaimant', effectFailure, values =>
          values.includes(failingEffect.submissionId),
        ),
      )
      const ids = [
        failingEmailId,
        failingEffect.submissionId,
        appealId,
        sameEffect.submissionId,
        nextEmailId,
      ]

      const failure = await processReconcileCopyrightAgentDispatches(
        {},
        { ids, batchSize: 1 },
      ).then(
        () => null,
        (err: unknown) => err,
      )

      expect(failure).toBeInstanceOf(AggregateError)
      expect((failure as AggregateError).errors).toEqual([enqueueFailure, effectFailure])
      await expect(jobFor(jobIds.appeal(appealId))).resolves.toEqual({
        name: 'copyright-appeal-recommendation',
        data: { submission_id: appealId },
      })
      await expect(countCopyrightActiveRestrictionsForNotice(sameEffect.noticeId)).resolves.toBe(1)
      await expect(countCopyrightActiveRestrictionsForNotice(failingEffect.noticeId)).resolves.toBe(
        0,
      )
      await expect(jobFor(jobIds.email(nextEmailId))).resolves.toEqual({
        name: 'copyright-email-intake',
        data: { intake_id: nextEmailId },
      })
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
      const ids = [emailId, formId, appealId]

      await processReconcileCopyrightAgentDispatches({}, { ids, batchSize: 1 })

      await expect(jobFor(jobIds.appeal(appealId))).resolves.toEqual({
        name: 'copyright-appeal-recommendation',
        data: { submission_id: appealId },
      })
      await expect(jobFor(jobIds.email(emailId))).resolves.toBeNull()
      await expect(jobFor(jobIds.form(formId))).resolves.toBeNull()
    })

    it('still applies a saved form effect, because it starts no agent work', async () => {
      const excluded = await pendingFormEffect()
      onTestFinished(async () => {
        await expect(countCopyrightActiveRestrictionsForNotice(excluded.noticeId)).resolves.toBe(0)
      })
      const [formId, effect] = await Promise.all([pendingFormScreening(), pendingFormEffect()])
      track(jobIds.form(formId))
      const ids = [formId, effect.submissionId]

      await processReconcileCopyrightAgentDispatches({}, { ids, batchSize: 1 })

      await expect(countCopyrightActiveRestrictionsForNotice(effect.noticeId)).resolves.toBe(1)
      await expect(jobFor(jobIds.form(formId))).resolves.toBeNull()
    })

    it('walks past a page of paused dispatches to reach an appeal on a later page', async () => {
      const excluded = await pendingFormEffect()
      onTestFinished(async () => {
        await expect(countCopyrightActiveRestrictionsForNotice(excluded.noticeId)).resolves.toBe(0)
      })
      const emailId = await pendingEmail()
      const appealId = await pendingAppeal()
      track(jobIds.email(emailId), jobIds.appeal(appealId))
      const ids = [emailId, appealId]

      await processReconcileCopyrightAgentDispatches({}, { ids, batchSize: 1 })

      await expect(jobFor(jobIds.appeal(appealId))).resolves.toEqual({
        name: 'copyright-appeal-recommendation',
        data: { submission_id: appealId },
      })
      await expect(jobFor(jobIds.email(emailId))).resolves.toBeNull()
    })
  })
})
