import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import { ai_agents } from '../queues/ai-agents/queues.mts'
import { createCopyrightAppeal } from '../services/copyright-notices/index.mts'
import type { processReconcileCopyrightAgentDispatches } from '../workers/ai-agents/processors/process-reconcile-copyright-agent-dispatches.mts'
import { createTestUser } from './index.mts'
import { createParsedCopyrightEmailIntake } from './copyright-email-intake-fixtures.mts'
import { readAllQueueJobs } from './queue-jobs.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readTestPendingCopyrightAgentDispatches } from './services/copyright-notices/pending-agent-dispatches.mts'
import {
  createClearScreenedForm,
  createSignedInCopyrightForm,
} from './services/copyright-notices/screened-form.mts'

type GetPending = NonNullable<
  Parameters<typeof processReconcileCopyrightAgentDispatches>[1]
>['getPending']

export const jobIds = {
  email: (id: string) => `copyright_email_intake_${id}`,
  form: (id: string) => `copyright_form_screening_${id}`,
  appeal: (id: string) => `copyright_appeal_recommendation_${id}`,
}

/** Pages of this test's own dispatches, read through the production keyset query by owned id. */
export function ownedPages(pages: Array<{ ids: string[]; next: string | null }>) {
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

export async function pendingEmail() {
  const intake = await createParsedCopyrightEmailIntake()
  return intake.id
}

export async function pendingFormScreening() {
  const { intake } = await createSignedInCopyrightForm()
  return intake.copyright_notice_submission_id
}

export async function pendingFormEffect() {
  const { notice } = await createClearScreenedForm()
  return {
    submissionId: notice.intake.copyright_notice_submission_id,
    noticeId: notice.intake.copyright_notice_id,
  }
}

export async function pendingAppeal() {
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

export async function jobFor(id: string) {
  const job = await ai_agents.getJob(id)
  return job ? { name: job.name, data: job.data as unknown } : null
}

/** Fails the enqueue of one owned email intake and passes every other add to the real queue. */
export function failEmailEnqueue(intakeId: string, error: Error) {
  const realAdd = ai_agents.add
  return vi.spyOn(ai_agents, 'add').mockImplementation((name, data, opts) => {
    if (
      name === 'copyright-email-intake' &&
      (data as { intake_id?: string }).intake_id === intakeId
    )
      return Promise.reject(error)
    return realAdd.call(ai_agents, name, data, opts)
  })
}

export async function continuationsAfter(cursor: string) {
  return (await readAllQueueJobs(ai_agents)).filter(
    job =>
      job.name === 'reconcile-copyright-agent-dispatches' &&
      (job.data as { after?: string }).after === cursor,
  )
}
