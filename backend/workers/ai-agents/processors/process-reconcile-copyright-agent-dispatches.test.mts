import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import * as psql from '@data-stores/psql'
import { ai_agents } from '@queues/ai-agents/queues'
import { copyrightSweepConfig } from '@services/copyright-notices/work-limits'
import { createCopyrightAppeal } from '@services/copyright-notices'
import { createTestUser } from '@voucha/test-helpers'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readTestPendingCopyrightAgentDispatches } from '@voucha/test-helpers/services/copyright-notices/pending-agent-dispatches'
import {
  createClearScreenedForm,
  createSignedInCopyrightForm,
} from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { processReconcileCopyrightAgentDispatches } from './process-reconcile-copyright-agent-dispatches.mts'

type GetPending = NonNullable<
  Parameters<typeof processReconcileCopyrightAgentDispatches>[1]
>['getPending']

const jobIds = {
  email: (id: string) => `copyright_email_intake_${id}`,
  form: (id: string) => `copyright_form_screening_${id}`,
  appeal: (id: string) => `copyright_appeal_recommendation_${id}`,
}

/** Pages of this test's own dispatches, read through the production keyset query by owned id. */
function ownedPages(pages: Array<{ ids: string[]; next: string | null }>) {
  const calls: Array<Parameters<GetPending>[0]> = []
  const getPending: GetPending = async options => {
    calls.push(options)
    const index = options?.after ? pages.findIndex(page => page.next === options.after) + 1 : 0
    const page = pages[index]
    if (!page) throw new Error(`No owned page for ${JSON.stringify(options)}`)
    const results = (
      await Promise.all(page.ids.map(id => readTestPendingCopyrightAgentDispatches(id)))
    ).flat()
    return {
      results,
      page_info: {
        has_next_page: page.next !== null,
        start_cursor: null,
        end_cursor: page.next,
      },
    }
  }
  return { calls, getPending }
}

async function pendingEmail() {
  const intake = await createParsedCopyrightEmailIntake()
  return intake.id
}

async function pendingFormScreening() {
  const { intake } = await createSignedInCopyrightForm()
  return intake.copyright_notice_submission_id
}

async function pendingFormEffect() {
  const { notice } = await createClearScreenedForm()
  return {
    submissionId: notice.intake.copyright_notice_submission_id,
    noticeId: notice.intake.copyright_notice_id,
  }
}

async function pendingAppeal() {
  const poster = await createTestUser()
  const { intake } = await createSignedInCopyrightForm(1, { poster })
  const noticeId = intake.copyright_notice_id
  const targetId = (await getCopyrightNoticePrivateAggregate(noticeId))?.targets[0]?.id
  if (!targetId) throw new Error('Appeal target missing')
  const appeal = await createCopyrightAppeal(poster, noticeId, randomUUID(), {
    reason: 'I created this image.',
    targetIds: [targetId],
  })
  return appeal.submission.id
}

async function jobFor(id: string) {
  const job = await ai_agents.getJob(id)
  return job ? { name: job.name, data: job.data as unknown } : null
}

/** Fails the enqueue of one owned email intake and passes every other add to the real queue. */
function failEmailEnqueue(intakeId: string, error: Error) {
  const realAdd = ai_agents.add.bind(ai_agents)
  return vi.spyOn(ai_agents, 'add').mockImplementation((name, data, opts) => {
    if (
      name === 'copyright-email-intake' &&
      (data as { intake_id?: string }).intake_id === intakeId
    )
      return Promise.reject(error)
    return realAdd(name, data, opts)
  })
}

async function continuationsAfter(cursor: string) {
  return (await readAllQueueJobs(ai_agents)).filter(
    job => job.name === 'reconcile-copyright-agent-dispatches' && job.data.after === cursor,
  )
}

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
      const realWrite = psql.write
      vi.spyOn(psql, 'write').mockImplementation((query, ...rest) => {
        const { text, values } = typeof query === 'string' ? { text: query, values: [] } : query
        if (
          text.includes('readAutomaticWithholdingClaimant') &&
          values.includes(failingEffect.submissionId)
        )
          return Promise.reject(effectFailure)
        return realWrite(query, ...rest)
      })
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
