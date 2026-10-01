import { describe, expect, it } from 'vitest'
import { recordCopyrightEmailParse } from '@services/copyright-notices'
import {
  createParsedCopyrightEmailIntake,
  createUnparsedCopyrightEmailIntake,
} from '@services/copyright-notices/email-intake-test-fixtures'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  readCopyrightEmailIntakeResponses,
  readCopyrightEmailIntakeReview,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'

const decision = {
  rationale: 'The message is not a complete copyright notice.',
  manual_fallback_reason: 'No agent output.',
}
const needsInformation = {
  ...decision,
  response_kind: 'needs_information',
  response_message: 'Please identify the copyrighted work and each allegedly infringing URL.',
}

// A received email whose parse failed, so it has no parsed sender to reply to.
async function createFailedParseCopyrightEmailIntake() {
  const intake = await createUnparsedCopyrightEmailIntake()
  await recordCopyrightEmailParse(intake, { status: 'failed', error: 'The MIME body is corrupt.' })
  return intake
}

async function createStaffRequest() {
  const request = createRequest()
  await request.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
  return request
}

describe('POST /api/v1/copyright-email-intakes/:id/rejections reply handling', () => {
  it.each([
    { name: 'no parse row', create: createUnparsedCopyrightEmailIntake },
    { name: 'a failed parse', create: createFailedParseCopyrightEmailIntake },
  ])('reports whether an intake with $name queued a reply', async ({ create }) => {
    const staff = await createStaffRequest()
    const [typed, typedNeedsInformation, silent, silentNeedsInformation] = await Promise.all([
      create(),
      create(),
      create(),
      create(),
    ])
    const path = (id: string) => `/api/v1/copyright-email-intakes/${id}/rejections`
    const reply_email = `reporter-${crypto.randomUUID()}@example.test`

    const sent = await staff
      .post(path(typed.id))
      .send({ ...decision, reply_email })
      .expect(200)
    const sentNeedsInformation = await staff
      .post(path(typedNeedsInformation.id))
      .send({ ...needsInformation, reply_email })
      .expect(200)
    const unsent = await staff.post(path(silent.id)).send(decision).expect(200)
    const unsentNeedsInformation = await staff
      .post(path(silentNeedsInformation.id))
      .send({ ...needsInformation, reply_email: null })
      .expect(200)

    expect([
      sent.body,
      sentNeedsInformation.body,
      unsent.body,
      unsentNeedsInformation.body,
    ]).toEqual([
      { reply_queued: true },
      { reply_queued: true },
      { reply_queued: false },
      { reply_queued: false },
    ])
    await expect(readCopyrightEmailIntakeResponses(typed.id)).resolves.toHaveLength(1)
    await expect(readCopyrightEmailIntakeResponses(silent.id)).resolves.toEqual([])
    const replay = await staff
      .post(path(typed.id))
      .send({ ...decision, reply_email })
      .expect(200)
    expect(replay.body).toEqual({ reply_queued: true })
  })

  it('replies to the parsed sender and refuses a typed address beside it', async () => {
    const staff = await createStaffRequest()
    const [parsed, refused] = await Promise.all([
      createParsedCopyrightEmailIntake(),
      createParsedCopyrightEmailIntake(),
    ])

    const queued = await staff
      .post(`/api/v1/copyright-email-intakes/${parsed.id}/rejections`)
      .send(decision)
      .expect(200)
    const conflict = await staff
      .post(`/api/v1/copyright-email-intakes/${refused.id}/rejections`)
      .send({ ...decision, reply_email: `typed-${crypto.randomUUID()}@example.test` })
      .expect(422)

    expect(queued.body).toEqual({ reply_queued: true })
    expect(conflict.body.message).toBe(
      'reply_email is only accepted while the intake has no parsed sender',
    )
    await expect(readCopyrightEmailIntakeReview(refused.id)).resolves.toEqual([])
  })

  it.each(['not-an-email', 42, `${'a'.repeat(250)}@example.test`])(
    'rejects the invalid reply_email %#',
    async reply_email => {
      const staff = await createStaffRequest()
      const intake = await createUnparsedCopyrightEmailIntake()

      await staff
        .post(`/api/v1/copyright-email-intakes/${intake.id}/rejections`)
        .send({ ...decision, reply_email })
        .expect(422)

      await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([])
    },
  )
})
