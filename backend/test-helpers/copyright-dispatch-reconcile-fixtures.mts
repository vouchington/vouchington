import { randomUUID } from 'node:crypto'
import { ai_agents } from '../queues/ai-agents/queues.mts'
import { createCopyrightAppeal } from '../services/copyright-notices/index.mts'
import { createTestUser } from './index.mts'
import { createParsedCopyrightEmailIntake } from './copyright-email-intake-fixtures.mts'
import { readAllQueueJobs } from './queue-jobs.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import {
  createClearScreenedForm,
  createSignedInCopyrightForm,
} from './services/copyright-notices/screened-form.mts'

export const jobIds = {
  email: (id: string) => `copyright_email_intake_${id}`,
  form: (id: string) => `copyright_form_screening_${id}`,
  appeal: (id: string) => `copyright_appeal_recommendation_${id}`,
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

export async function continuationsAfter(cursor: string) {
  return (await readAllQueueJobs(ai_agents)).filter(
    job =>
      job.name === 'reconcile-copyright-agent-dispatches' &&
      (job.data as { after?: string }).after === cursor,
  )
}
