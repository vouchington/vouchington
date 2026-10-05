import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  readCopyrightEmailIntakeResponses,
  readCopyrightEmailIntakeReview,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  createParsedCopyrightEmailIntake,
  createUnparsedCopyrightEmailIntake,
} from './email-intake-test-fixtures.mts'
import { prepareCopyrightEmailDelivery, recordCopyrightEmailParse } from './index.mts'
import { rejectCopyrightEmailIntake } from './email-rejection.mts'

type Moderator = Parameters<typeof rejectCopyrightEmailIntake>[0]['currentUser']
type Decision = Pick<
  Parameters<typeof rejectCopyrightEmailIntake>[0],
  'replyEmail' | 'responseKind' | 'responseMessage'
>

const needsInformation = {
  responseKind: 'needs_information',
  responseMessage: 'Please identify the copyrighted work and each allegedly infringing URL.',
} as const
const rejected = { responseKind: 'rejected', responseMessage: null } as const
const decisionKinds = [
  { kind: 'rejected', decision: rejected },
  { kind: 'needs_information', decision: needsInformation },
] as const

let moderator: Promise<Moderator> | undefined

// Created on first use because a top-level hook is not allowed outside a describe block.
function getModerator(): Promise<Moderator> {
  moderator ??= createTestUser().then(
    record => ({ ...record, roles: ['moderator'] }) as typeof record,
  )
  return moderator
}

// A received email whose parse failed, so it has no parsed sender to reply to.
async function createFailedParseCopyrightEmailIntake() {
  const intake = await createUnparsedCopyrightEmailIntake()
  await recordCopyrightEmailParse(intake, { status: 'failed', error: 'The MIME body is corrupt.' })
  return intake
}

async function decide(intakeId: string, decision: Decision) {
  return rejectCopyrightEmailIntake({
    currentUser: await getModerator(),
    intakeId,
    recommendationId: null,
    manualFallbackReason: 'The extraction agent was unavailable.',
    rationale: 'The message is not a complete copyright notice.',
    ...decision,
  })
}

describe.each([
  { name: 'has no parse row', create: createUnparsedCopyrightEmailIntake },
  { name: 'has a failed parse', create: createFailedParseCopyrightEmailIntake },
])('a copyright email intake that $name', ({ create }) => {
  it.each(decisionKinds)(
    'queues a $kind reply to the typed address',
    async ({ kind, decision }) => {
      const intake = await create()
      const replyEmail = `reporter-${crypto.randomUUID()}@example.test`
      const input = { ...decision, replyEmail }

      const result = await decide(intake.id, input)

      expect(result).toEqual({ responseId: expect.any(String), replyQueued: true })
      await expect(readCopyrightEmailIntakeResponses(intake.id)).resolves.toEqual([
        { id: result.responseId, delivery_kind: `email_intake_${kind}`, state: 'pending' },
      ])
      const delivery = await prepareCopyrightEmailDelivery(result.responseId as string)
      expect(delivery).toEqual({
        leaseToken: expect.any(String),
        correspondenceId: null,
        recipientEmail: replyEmail,
        subject:
          kind === 'rejected'
            ? 'We could not accept your copyright notice'
            : 'More information is needed for your copyright notice',
        text: expect.stringContaining(
          kind === 'rejected'
            ? '/copyright/designated-agent'
            : 'Please identify the copyrighted work',
        ),
      })
      await expect(decide(intake.id, input)).resolves.toEqual({
        responseId: null,
        replyQueued: true,
      })
    },
  )

  it('rejects the unpromoted email without inventing a case or legal jurisdiction', async () => {
    const intake = await create()
    const result = await decide(intake.id, {
      ...rejected,
      replyEmail: `sender-${crypto.randomUUID()}@example.test`,
    })
    const delivery = await prepareCopyrightEmailDelivery(result.responseId!)
    expect(delivery.text).toContain('No copyright case was opened')
    expect(delivery.text).not.toContain(intake.id)
    expect(delivery.text).not.toContain('17 U.S.C.')
    expect(delivery.text).not.toContain('US DMCA')
    expect(delivery.text).toContain('/copyright/designated-agent')
    expect(delivery.text).toContain('A person made this intake decision')
  })

  it.each(decisionKinds)('queues no $kind reply without an address', async ({ decision }) => {
    const intake = await create()

    await expect(decide(intake.id, decision)).resolves.toEqual({
      responseId: null,
      replyQueued: false,
    })
    await expect(readCopyrightEmailIntakeResponses(intake.id)).resolves.toEqual([])
    await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([
      { decision: 'rejected', promoted_copyright_notice_id: null },
    ])
    await expect(decide(intake.id, decision)).resolves.toEqual({
      responseId: null,
      replyQueued: false,
    })
  })

  it.each(['not-an-email', `${'a'.repeat(250)}@example.test`])(
    'rejects the invalid reply address %#',
    async replyEmail => {
      const intake = await create()

      await expect(decide(intake.id, { ...rejected, replyEmail })).rejects.toMatchObject({
        status: 422,
      })
      await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([])
    },
  )
})

describe('a copyright email intake with a succeeded parse', () => {
  it.each(decisionKinds)('queues the $kind reply to the parsed sender', async ({ decision }) => {
    const intake = await createParsedCopyrightEmailIntake()

    const result = await decide(intake.id, decision)

    expect(result).toEqual({ responseId: expect.any(String), replyQueued: true })
    await expect(prepareCopyrightEmailDelivery(result.responseId as string)).resolves.toMatchObject(
      {
        recipientEmail: expect.stringMatching(/^claimant-.+@example\.test$/),
      },
    )
  })

  it('refuses a typed reply address and records nothing', async () => {
    const intake = await createParsedCopyrightEmailIntake()

    await expect(
      decide(intake.id, { ...rejected, replyEmail: `typed-${crypto.randomUUID()}@example.test` }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([])
    await expect(readCopyrightEmailIntakeResponses(intake.id)).resolves.toEqual([])
  })
})

describe('a parse that lands after a decision', () => {
  it('sends nothing when it lands after a decision that queued no reply', async () => {
    const intake = await createUnparsedCopyrightEmailIntake()
    await decide(intake.id, rejected)

    await recordCopyrightEmailParse(intake, {
      status: 'succeeded',
      fromEmail: `claimant-${crypto.randomUUID()}@example.test`,
      subject: 'Copyright complaint',
      bodyText: 'This is a copyright complaint.',
      messageId: `<${crypto.randomUUID()}@example.test>`,
      replyReferences: [],
      attachments: [],
    })

    await expect(readCopyrightEmailIntakeResponses(intake.id)).resolves.toEqual([])
    await expect(decide(intake.id, rejected)).resolves.toEqual({
      responseId: null,
      replyQueued: false,
    })
    await expect(readCopyrightEmailIntakeResponses(intake.id)).resolves.toEqual([])
  })
})
