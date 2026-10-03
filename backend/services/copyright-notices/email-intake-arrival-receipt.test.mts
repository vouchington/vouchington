import { createTestUser } from '@voucha/test-helpers'
import { failTestCopyrightDeliveryIntent } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { recordCopyrightEmailIntakeLegalProcess } from './email-legal-process.mts'
import { rejectCopyrightEmailIntake } from './email-rejection.mts'
import { replayFailedCopyrightEmailIntakeReplyIntent } from './delivery-intents.mts'
import { describe, expect, it, vi } from 'vitest'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { readCopyrightEmailIntakeResponses } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { createCopyrightEmailIntake } from './email-intakes.mts'
import { recordCopyrightEmailParse } from './email-intake-parses.mts'
import { prepareCopyrightEmailDelivery } from './delivery-transport.mts'
import type { CopyrightEmailSesVerdicts } from './email-ses-verdicts.mts'
import { copyrightReceiptText } from './statement-of-reasons-wording.mts'

async function intake(verdicts: CopyrightEmailSesVerdicts = PASSING_COPYRIGHT_EMAIL_SES_VERDICTS) {
  const sesMessageId = `receipt-${crypto.randomUUID()}`
  return (
    await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}`,
      rawSha256: Buffer.alloc(32, 1),
      rawMimeType: 'message/rfc822',
      rawByteSize: 1,
      sesVerdicts: verdicts,
    })
  ).intake
}
const parsed = () => ({
  status: 'succeeded' as const,
  fromEmail: `sender-${crypto.randomUUID()}@example.test`,
  subject: 'Notice',
  bodyText: 'Notice body',
  messageId: null,
  replyReferences: [] as string[],
  attachments: [],
})

describe('authenticated email arrival receipts', () => {
  useCopyrightIntakeEnvironment()
  it('retains one receipt to the parsed sender and replay creates no duplicate', async () => {
    const message = await intake()
    const parse = parsed()
    await recordCopyrightEmailParse(message, parse)
    await recordCopyrightEmailParse(message, parse)
    const rows = await readCopyrightEmailIntakeResponses(message.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.delivery_kind).toBe('email_intake_received')
    expect(await prepareCopyrightEmailDelivery(rows[0]!.id)).toMatchObject({
      recipientEmail: parse.fromEmail,
      text: copyrightReceiptText(),
    })
  })
  it('keeps receipt and reply separate and never replays a failed receipt as a staff reply', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const message = await intake()
    await recordCopyrightEmailParse(message, parsed())
    const receipt = (await readCopyrightEmailIntakeResponses(message.id))[0]!
    await failTestCopyrightDeliveryIntent(receipt.id)
    const result = await rejectCopyrightEmailIntake({
      currentUser: moderator,
      intakeId: message.id,
      recommendationId: null,
      manualFallbackReason: 'Manual review.',
      rationale: 'Incomplete notice.',
      responseKind: 'rejected',
      responseMessage: null,
    })
    expect(result.replyQueued).toBe(true)
    expect(
      await replayFailedCopyrightEmailIntakeReplyIntent({
        intakeId: message.id,
        actorUserId: moderator.id,
      }),
    ).toBeNull()
    await failTestCopyrightDeliveryIntent(result.responseId!)
    expect(
      await replayFailedCopyrightEmailIntakeReplyIntent({
        intakeId: message.id,
        actorUserId: moderator.id,
      }),
    ).toBe(result.responseId)
    expect(await readCopyrightEmailIntakeResponses(message.id)).toEqual(
      expect.arrayContaining([
        { id: receipt.id, delivery_kind: 'email_intake_received', state: 'failed' },
        { id: result.responseId, delivery_kind: 'email_intake_rejected', state: 'pending' },
      ]),
    )
  })
  it.each(['rejected', 'legal_process'] as const)(
    'never queues a late arrival receipt after an unparsed intake is %s',
    async decision => {
      const message = await intake()
      const moderator = await createTestUser({ extraRoles: ['moderator'] })
      if (decision === 'legal_process')
        await recordCopyrightEmailIntakeLegalProcess({
          currentUser: moderator,
          intakeId: message.id,
          reason: 'Court process.',
        })
      else
        await rejectCopyrightEmailIntake({
          currentUser: moderator,
          intakeId: message.id,
          recommendationId: null,
          manualFallbackReason: 'Manual review.',
          rationale: 'Incomplete notice.',
          responseKind: 'rejected',
          responseMessage: null,
          replyEmail: 'retained@example.test',
        })
      const before = await readCopyrightEmailIntakeResponses(message.id)
      const parse = parsed()
      await recordCopyrightEmailParse(message, parse)
      await recordCopyrightEmailParse(message, parse)
      expect(await readCopyrightEmailIntakeResponses(message.id)).toEqual(before)
      expect(before.every(row => row.delivery_kind !== 'email_intake_received')).toBe(true)
    },
  )
  it.each(['fail', 'gray', 'processing_failed', 'unknown'] as const)(
    'sends no receipt when DMARC is %s',
    async dmarc => {
      const message = await intake({ ...PASSING_COPYRIGHT_EMAIL_SES_VERDICTS, dmarc })
      await recordCopyrightEmailParse(message, parsed())
      expect(await readCopyrightEmailIntakeResponses(message.id)).toEqual([])
    },
  )
  it.each(['spam', 'virus'] as const)('sends no receipt when %s fails', async verdict => {
    const message = await intake({ ...PASSING_COPYRIGHT_EMAIL_SES_VERDICTS, [verdict]: 'fail' })
    await recordCopyrightEmailParse(message, parsed())
    expect(await readCopyrightEmailIntakeResponses(message.id)).toEqual([])
  })
  it('sends nothing for replies, parse failure or paused intake', async () => {
    const reply = await intake()
    await recordCopyrightEmailParse(reply, {
      ...parsed(),
      replyReferences: ['<earlier@example.test>'],
    })
    const failed = await intake()
    await recordCopyrightEmailParse(failed, { status: 'failed', error: 'Invalid MIME' })
    vi.stubEnv('COPYRIGHT_INTAKE_ENABLED', 'false')
    const paused = await intake()
    await recordCopyrightEmailParse(paused, parsed())
    for (const message of [reply, failed, paused])
      expect(await readCopyrightEmailIntakeResponses(message.id)).toEqual([])
  })
})
