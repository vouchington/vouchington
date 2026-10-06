import { afterEach, describe, expect, it, vi } from 'vitest'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  readCopyrightEmailIntakeResponses,
  readCopyrightEmailIntakeReviewRecord,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { captureTestLogOutput } from '@voucha/test-helpers/services/copyright-notices/capture-log-output'

const path = (id: string) => `/api/v1/copyright-email-intakes/${id}/legal-process`

async function createStaffRequest() {
  const request = createRequest()
  await request.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
  return request
}

describe('POST /api/v1/copyright-email-intakes/:id/legal-process', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('records the decision for staff and queues no reply', async () => {
    const staff = await createStaffRequest()
    const intake = await createParsedCopyrightEmailIntake()

    const response = await staff
      .post(path(intake.id))
      .send({ reason: 'Subpoena for subscriber records.' })
      .expect(201)

    expect(response.body).toEqual({ decision: 'legal_process' })
    await expect(readCopyrightEmailIntakeReviewRecord(intake.id)).resolves.toMatchObject([
      { decision: 'legal_process', promoted_copyright_notice_id: null },
    ])
    await expect(readCopyrightEmailIntakeResponses(intake.id)).resolves.toEqual([])
  })

  it('answers a caller without the staff role with 403 and records nothing', async () => {
    const member = createRequest()
    await member.authenticateAs(await createTestUser())
    const intake = await createParsedCopyrightEmailIntake()

    await member.post(path(intake.id)).send({ reason: 'Subpoena.' }).expect(403)

    await expect(readCopyrightEmailIntakeReviewRecord(intake.id)).resolves.toEqual([])
  })

  it('answers an anonymous caller with 401', async () => {
    const intake = await createParsedCopyrightEmailIntake()

    await createRequest().post(path(intake.id)).send({ reason: 'Subpoena.' }).expect(401)
  })

  it('answers an unknown intake with 404', async () => {
    const staff = await createStaffRequest()

    const response = await staff
      .post(path(crypto.randomUUID()))
      .send({ reason: 'Subpoena.' })
      .expect(404)

    expect(response.body.message).toBe('Copyright email intake not found')
  })

  it.each([{}, { reason: 42 }, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(1_001) }])(
    'refuses the invalid body %#',
    async body => {
      const staff = await createStaffRequest()
      const intake = await createParsedCopyrightEmailIntake()

      await staff.post(path(intake.id)).send(body).expect(422)

      await expect(readCopyrightEmailIntakeReviewRecord(intake.id)).resolves.toEqual([])
    },
  )

  it('answers a second decision with 409 and keeps the first record', async () => {
    const staff = await createStaffRequest()
    const intake = await createParsedCopyrightEmailIntake()
    await staff.post(path(intake.id)).send({ reason: 'First reason.' }).expect(201)
    const [recorded] = await readCopyrightEmailIntakeReviewRecord(intake.id)

    await staff.post(path(intake.id)).send({ reason: 'Second reason.' }).expect(409)

    await expect(readCopyrightEmailIntakeReviewRecord(intake.id)).resolves.toEqual([recorded])
  })

  it('answers a rejection of a legal-process intake with 409 and sends no reply', async () => {
    const staff = await createStaffRequest()
    const intake = await createParsedCopyrightEmailIntake()
    await staff.post(path(intake.id)).send({ reason: 'Subpoena.' }).expect(201)

    await staff
      .post(`/api/v1/copyright-email-intakes/${intake.id}/rejections`)
      .send({ rationale: 'Not a copyright notice.', manual_fallback_reason: 'No agent output.' })
      .expect(409)

    await expect(readCopyrightEmailIntakeResponses(intake.id)).resolves.toEqual([])
    await expect(readCopyrightEmailIntakeReviewRecord(intake.id)).resolves.toMatchObject([
      { decision: 'legal_process' },
    ])
  })

  it('keeps the reason out of error bodies and logs', async () => {
    const staff = await createStaffRequest()
    const intake = await createParsedCopyrightEmailIntake()
    const reason = `Subpoena for matter ${crypto.randomUUID()}`
    const output = captureTestLogOutput()

    await staff.post(path(intake.id)).send({ reason }).expect(201)
    const conflict = await staff.post(path(intake.id)).send({ reason }).expect(409)
    const oversized = await staff
      .post(path(intake.id))
      .send({ reason: `${reason} ${'x'.repeat(1_001)}` })
      .expect(422)

    expect(JSON.stringify([conflict.body, oversized.body])).not.toContain(reason)
    expect(output()).not.toContain(reason)
    const [review] = await readCopyrightEmailIntakeReviewRecord(intake.id)
    expect(review?.rationale_ciphertext).not.toContain(reason)
  })
})
