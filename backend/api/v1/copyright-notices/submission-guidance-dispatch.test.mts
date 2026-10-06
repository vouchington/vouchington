import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { readCopyrightNoticeTargetId } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { linkCopyrightEmailIntakeToNotice } from '@services/copyright-notices/email-threading'
import {
  counterNoticeBody,
  createCopyrightFormFixture,
  createNotice,
} from '@voucha/test-helpers/copyright-route-fixtures'
import { ai_agents } from '@queues/ai-agents/queues'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

const jobId = (submissionId: string) => `copyright_submission_guidance_${submissionId}`
const staffDecision = {
  rationale: 'Staff admitted this existing-case filing.',
  manual_fallback_reason: 'No recommendation is available.',
}

async function openCase() {
  const fixture = await createCopyrightFormFixture()
  const noticeId = await createNotice(fixture)
  const targetId = await readCopyrightNoticeTargetId(noticeId)
  return { noticeId, targetId, poster: fixture.poster }
}

async function signedIn(user: Awaited<ReturnType<typeof createTestUser>>) {
  const request = createRequest()
  await request.authenticateAs(user)
  return request
}

async function expectGuidanceJob(submissionId: string) {
  const job = await ai_agents.getJob(jobId(submissionId))
  expect(job?.name).toBe('copyright-submission-guidance')
  expect(job?.data).toEqual({ submission_id: submissionId })
}

async function removeGuidanceJob(submissionId: string | undefined) {
  if (!submissionId) return
  const job = await ai_agents.getJob(jobId(submissionId))
  if (job) await job.remove()
}

describe('copyright submission guidance dispatch from filing routes', () => {
  useCopyrightIntakeEnvironment()
  afterEach(() => vi.restoreAllMocks())

  it('enqueues a signed-in counter-notice once and does not enqueue its replay', async () => {
    const { noticeId, targetId, poster } = await openCase()
    const request = await signedIn(poster)
    const path = `/api/v1/copyright-notices/${noticeId}/counter-notices`
    const key = crypto.randomUUID()
    let submissionId: string | undefined
    try {
      const first = await request
        .post(path)
        .set('Idempotency-Key', key)
        .send(counterNoticeBody(targetId))
        .expect(201)
      submissionId = first.body.copyright_submission.id
      await expectGuidanceJob(submissionId!)
      const add = vi.spyOn(ai_agents, 'add')
      const replay = await request
        .post(path)
        .set('Idempotency-Key', key)
        .send(counterNoticeBody(targetId))
        .expect(200)
      expect(replay.body.copyright_submission.id).toBe(submissionId)
      expect(replay.body.is_duplicate).toBe(true)
      expect(add).not.toHaveBeenCalledWith(
        'copyright-submission-guidance',
        expect.anything(),
        expect.anything(),
      )
    } finally {
      await removeGuidanceJob(submissionId)
    }
  })

  it('enqueues a guest court/CCB hold and leaves a supplement out', async () => {
    const { noticeId } = await openCase()
    const staff = await signedIn(await createTestUser({ extraRoles: ['moderator'] }))
    const issued = await staff
      .post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`)
      .send({ expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
      .expect(201)
    const path = `/api/v1/copyright-notices/${noticeId}/guest-filings`
    const guest = createRequest()
    const token = issued.body.copyright_guest_capability.token as string
    let submissionId: string | undefined
    try {
      const add = vi.spyOn(ai_agents, 'add')
      const supplement = await guest
        .post(path)
        .set('Copyright-Guest-Capability', token)
        .send({ kind: 'supplement', statement: 'Additional information.' })
        .expect(201)
      expect(add).not.toHaveBeenCalledWith(
        'copyright-submission-guidance',
        expect.anything(),
        expect.anything(),
      )
      const hold = await guest
        .post(path)
        .set('Copyright-Guest-Capability', token)
        .send({ kind: 'court_or_ccb_hold', statement: 'A court case was filed.' })
        .expect(201)
      submissionId = hold.body.copyright_submission.id
      expect(submissionId).not.toBe(supplement.body.copyright_submission.id)
      await expectGuidanceJob(submissionId!)
      expect(add).toHaveBeenCalledExactlyOnceWith(
        'copyright-submission-guidance',
        { submission_id: submissionId },
        expect.anything(),
      )
      await guest
        .post(path)
        .set('Copyright-Guest-Capability', token)
        .send({ kind: 'court_or_ccb_hold', statement: 'A repeated hold.' })
        .expect(409)
      expect(add).toHaveBeenCalledExactlyOnceWith(
        'copyright-submission-guidance',
        { submission_id: submissionId },
        expect.anything(),
      )
    } finally {
      await removeGuidanceJob(submissionId)
    }
  })

  it.each(['counter_notice', 'court_or_ccb_hold'] as const)(
    'enqueues admitted email %s once and skips replay',
    async kind => {
      const { noticeId, targetId } = await openCase()
      const reply = await createParsedCopyrightEmailIntake()
      await linkCopyrightEmailIntakeToNotice({ intakeId: reply.id, noticeId, linkKind: 'thread' })
      const staff = await signedIn(await createTestUser({ extraRoles: ['moderator'] }))
      const path = `/api/v1/copyright-email-intakes/${reply.id}/correspondence`
      const body =
        kind === 'counter_notice'
          ? { kind, ...staffDecision, ...counterNoticeBody(targetId) }
          : { kind, ...staffDecision, submission_summary: 'A CCB claim was commenced.' }
      let submissionId: string | undefined
      try {
        const first = await staff.post(path).send(body).expect(201)
        submissionId = first.body.copyright_submission.id
        await expectGuidanceJob(submissionId!)
        const add = vi.spyOn(ai_agents, 'add')
        const replay = await staff.post(path).send(body).expect(200)
        expect(replay.body).toMatchObject({
          copyright_submission: { id: submissionId },
          is_duplicate: true,
        })
        expect(add).not.toHaveBeenCalledWith(
          'copyright-submission-guidance',
          expect.anything(),
          expect.anything(),
        )
      } finally {
        await removeGuidanceJob(submissionId)
      }
    },
  )

  it('preserves a committed guest hold response when guidance enqueue fails', async () => {
    const { noticeId } = await openCase()
    const staff = await signedIn(await createTestUser({ extraRoles: ['moderator'] }))
    const issued = await staff
      .post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`)
      .send({ expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
      .expect(201)
    vi.spyOn(ai_agents, 'add').mockRejectedValueOnce(new Error('queue unavailable'))
    const filed = await createRequest()
      .post(`/api/v1/copyright-notices/${noticeId}/guest-filings`)
      .set('Copyright-Guest-Capability', issued.body.copyright_guest_capability.token)
      .send({ kind: 'court_or_ccb_hold', statement: 'Court case 1:26-cv-01234 was filed.' })
      .expect(201)
    expect(filed.body.copyright_submission).toMatchObject({
      id: expect.any(String),
      kind: 'court_or_ccb_hold',
    })
  })

  it.each(['counter_notice', 'court_or_ccb_hold'] as const)(
    'preserves admitted email %s when guidance enqueue fails',
    async kind => {
      const { noticeId, targetId } = await openCase()
      const reply = await createParsedCopyrightEmailIntake()
      await linkCopyrightEmailIntakeToNotice({ intakeId: reply.id, noticeId, linkKind: 'thread' })
      const staff = await signedIn(await createTestUser({ extraRoles: ['moderator'] }))
      const body =
        kind === 'counter_notice'
          ? { kind, ...staffDecision, ...counterNoticeBody(targetId) }
          : { kind, ...staffDecision, submission_summary: 'A CCB claim was commenced.' }
      vi.spyOn(ai_agents, 'add').mockRejectedValueOnce(new Error('queue unavailable'))
      const admitted = await staff
        .post(`/api/v1/copyright-email-intakes/${reply.id}/correspondence`)
        .send(body)
        .expect(201)
      expect(admitted.body).toMatchObject({
        copyright_submission: { id: expect.any(String) },
        is_duplicate: false,
      })
    },
  )
  it('preserves a committed counter-notice response when the queue provider rejects the enqueue', async () => {
    const { noticeId, targetId, poster } = await openCase()
    const request = await signedIn(poster)
    const add = vi.spyOn(ai_agents, 'add')
    add.mockRejectedValueOnce(new Error('queue unavailable'))
    const filed = await request
      .post(`/api/v1/copyright-notices/${noticeId}/counter-notices`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(counterNoticeBody(targetId))
      .expect(201)
    expect(filed.body).toMatchObject({
      copyright_submission: { id: expect.any(String) },
      is_duplicate: false,
    })
  })
})
