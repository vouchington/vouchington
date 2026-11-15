import { randomUUID } from 'node:crypto'
import {
  readLatestTestAppealRunId,
  readLatestTestEmailRunId,
} from './copyright-ai-run-fixtures.mts'
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

/**
 * Email and appeal jobs are keyed by the admitted run, so their ids name the subject and resolve to
 * the run's job once one exists; a form screening job is still keyed by its submission.
 */
export const jobIds = {
  email: (id: string) => `run:email:${id}`,
  form: (id: string) => `copyright_form_screening_${id}`,
  appeal: (id: string) => `run:appeal:${id}`,
}

async function resolveJobId(id: string): Promise<string | null> {
  const [, kind, subjectId] = id.match(/^run:(email|appeal):(.+)$/) ?? []
  if (!kind || !subjectId) return id
  const runId =
    kind === 'email'
      ? await readLatestTestEmailRunId(subjectId)
      : await readLatestTestAppealRunId(subjectId)
  if (!runId) return null
  return kind === 'email'
    ? `copyright_email_intake_${runId}`
    : `copyright_appeal_recommendation_${runId}`
}

/** Removes the queued job a tracked id resolves to, if any. */
export async function removeTrackedJob(id: string) {
  const resolved = await resolveJobId(id)
  if (resolved) await (await ai_agents.getJob(resolved))?.remove()
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

/** The queued job (without its run id, which is asserted to match the admitted run), or null. */
export async function jobFor(id: string) {
  const resolved = await resolveJobId(id)
  const job = resolved ? await ai_agents.getJob(resolved) : null
  if (!job) return null
  const { run_id: runId, ...data } = job.data as { run_id?: string }
  if (id !== resolved && !runId) throw new Error(`Job ${resolved} carries no run_id`)
  return { name: job.name, data: data as unknown }
}

export async function continuationsAfter(cursor: string) {
  return (await readAllQueueJobs(ai_agents)).filter(
    job =>
      job.name === 'reconcile-copyright-agent-dispatches' &&
      (job.data as { after?: string }).after === cursor,
  )
}
