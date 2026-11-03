import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { ai_agents } from '@queues/ai-agents/queues'
import { copyrightSweepConfig } from '@services/copyright-notices/work-limits'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { rejectPostgresWriteForTest } from '@voucha/test-helpers/injected-failures'
import { readTestPendingCopyrightAgentDispatches } from '@voucha/test-helpers/services/copyright-notices/pending-agent-dispatches'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  continuationsAfter,
  failEmailEnqueue,
  jobFor,
  jobIds,
  ownedPages,
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
      const [emailId, formId, effect, appealId] = await Promise.all([
        pendingEmail(),
        pendingFormScreening(),
        pendingFormEffect(),
        pendingAppeal(),
      ])
      track(jobIds.email(emailId), jobIds.form(formId), jobIds.appeal(appealId))
      const { getPending } = ownedPages([
        { ids: [emailId, formId, effect.submissionId, appealId], next: null },
      ])

      await expect(processReconcileCopyrightAgentDispatches({}, { getPending })).resolves.toEqual({
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
      const cursor = `first-cursor-${randomUUID()}`
      const [emailId, effect] = await Promise.all([pendingEmail(), pendingFormEffect()])
      track(jobIds.email(emailId))
      const { calls, getPending } = ownedPages([
        { ids: [emailId], next: cursor },
        { ids: [effect.submissionId], next: null },
      ])

      await processReconcileCopyrightAgentDispatches({}, { getPending })

      expect(calls).toEqual([{ limit: 100 }, { limit: 100, after: cursor }])
      await expect(jobFor(jobIds.email(emailId))).resolves.toEqual({
        name: 'copyright-email-intake',
        data: { intake_id: emailId },
      })
      await expect(countCopyrightActiveRestrictionsForNotice(effect.noticeId)).resolves.toBe(1)
    })

    it('continues beyond its cap despite a failed head and resumes at the saved cursor', async () => {
      onTestFinished(
        overrideDynamicConfigFieldsForTest(copyrightSweepConfig, {
          batch_size: 1,
          max_batches_per_run: 1,
        }),
      )
      const cursor = `head-cursor-${randomUUID()}`
      const [headId, tailId] = await Promise.all([pendingEmail(), pendingEmail()])
      track(jobIds.email(headId), jobIds.email(tailId))
      const headFailure = new Error('head failed')
      failEmailEnqueue(headId, headFailure)
      const head = ownedPages([{ ids: [headId], next: cursor }])

      const failure = await processReconcileCopyrightAgentDispatches(
        {},
        { getPending: head.getPending },
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

      const tail = ownedPages([
        { ids: [headId], next: cursor },
        { ids: [tailId], next: null },
      ])
      await expect(
        processReconcileCopyrightAgentDispatches(
          { after: cursor },
          { getPending: tail.getPending },
        ),
      ).resolves.toEqual({ hasMore: false })
      expect(tail.calls).toEqual([{ after: cursor, limit: 1 }])
      await expect(jobFor(jobIds.email(tailId))).resolves.toEqual({
        name: 'copyright-email-intake',
        data: { intake_id: tailId },
      })
    })

    it('keeps dispatching past failed items, then fails with every error', async () => {
      const [failingEmailId, failingEffect, appealId, sameEffect, nextEmailId] = await Promise.all([
        pendingEmail(),
        pendingFormEffect(),
        pendingAppeal(),
        pendingFormEffect(),
        pendingEmail(),
      ])
      track(jobIds.email(failingEmailId), jobIds.appeal(appealId), jobIds.email(nextEmailId))
      const enqueueFailure = new Error('enqueue failed')
      const effectFailure = new Error('form effect failed')
      failEmailEnqueue(failingEmailId, enqueueFailure)
      onTestFinished(
        rejectPostgresWriteForTest('readAutomaticWithholdingClaimant', effectFailure, values =>
          values.includes(failingEffect.submissionId),
        ),
      )
      const cursor = `first-cursor-${randomUUID()}`
      const { getPending } = ownedPages([
        {
          ids: [failingEmailId, failingEffect.submissionId, appealId, sameEffect.submissionId],
          next: cursor,
        },
        { ids: [nextEmailId], next: null },
      ])

      const failure = await processReconcileCopyrightAgentDispatches({}, { getPending }).then(
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
      const [emailId, formId, appealId] = await Promise.all([
        pendingEmail(),
        pendingFormScreening(),
        pendingAppeal(),
      ])
      track(jobIds.email(emailId), jobIds.form(formId), jobIds.appeal(appealId))
      const { getPending } = ownedPages([{ ids: [emailId, formId, appealId], next: null }])

      await processReconcileCopyrightAgentDispatches({}, { getPending })

      await expect(jobFor(jobIds.appeal(appealId))).resolves.toEqual({
        name: 'copyright-appeal-recommendation',
        data: { submission_id: appealId },
      })
      await expect(jobFor(jobIds.email(emailId))).resolves.toBeNull()
      await expect(jobFor(jobIds.form(formId))).resolves.toBeNull()
    })

    it('still applies a saved form effect, because it starts no agent work', async () => {
      const [formId, effect] = await Promise.all([pendingFormScreening(), pendingFormEffect()])
      track(jobIds.form(formId))
      const { getPending } = ownedPages([{ ids: [formId, effect.submissionId], next: null }])

      await processReconcileCopyrightAgentDispatches({}, { getPending })

      await expect(countCopyrightActiveRestrictionsForNotice(effect.noticeId)).resolves.toBe(1)
      await expect(jobFor(jobIds.form(formId))).resolves.toBeNull()
    })

    it('walks past a page of paused dispatches to reach an appeal on a later page', async () => {
      const cursor = `first-cursor-${randomUUID()}`
      const [emailId, appealId] = await Promise.all([pendingEmail(), pendingAppeal()])
      track(jobIds.email(emailId), jobIds.appeal(appealId))
      const { calls, getPending } = ownedPages([
        { ids: [emailId], next: cursor },
        { ids: [appealId], next: null },
      ])

      await processReconcileCopyrightAgentDispatches({}, { getPending })

      expect(calls).toEqual([{ limit: 100 }, { limit: 100, after: cursor }])
      await expect(jobFor(jobIds.appeal(appealId))).resolves.toEqual({
        name: 'copyright-appeal-recommendation',
        data: { submission_id: appealId },
      })
      await expect(jobFor(jobIds.email(emailId))).resolves.toBeNull()
    })
  })
})
