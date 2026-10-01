import { beginTransaction } from '@voucha/test-helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import { markCopyrightDeliveryIntentBouncedBySesMessageId } from '@services/copyright-notices'
import { getPendingCopyrightStaffCase } from '@services/copyright-notices/read-models-staff-case'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { processSendCopyrightNoticeEmail } from './copyright-notice.mts'
import { captureTestLogOutput } from '@voucha/test-helpers/services/copyright-notices/capture-log-output'
import { readTestInformationRequestIntents } from '@voucha/test-helpers/services/copyright-notices/claimant-delivery'
import {
  fileTestCopyrightFormNotice,
  requestTestCopyrightInformation,
} from '@voucha/test-helpers/services/copyright-notices/information-request-fixture'

describe('copyright staff information request email', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    { label: 'guest', signedIn: false },
    { label: 'signed-in', signedIn: true },
  ])('sends the request to the $label claimant and records the delivery', async ({ signedIn }) => {
    const { noticeId, claimantEmail } = await fileTestCopyrightFormNotice(signedIn)
    const statement = `Send the registration number ${crypto.randomUUID()}`
    await requestTestCopyrightInformation(noticeId, statement)
    const [intent] = await readTestInformationRequestIntents(noticeId)
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({
      MessageId: `ses-${crypto.randomUUID()}`,
    } as never)
    const output = captureTestLogOutput()

    await expect(processSendCopyrightNoticeEmail({ intentId: intent?.id ?? '' })).resolves.toBe(
      true,
    )

    expect(ses.sendEmail).toHaveBeenCalledTimes(1)
    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: claimantEmail,
        subject: 'More information is needed for your copyright notice',
        text: statement,
        allowGlobalBcc: false,
      }),
    )
    expect(output()).not.toContain(statement)
    await expect(readTestInformationRequestIntents(noticeId)).resolves.toEqual([
      expect.objectContaining({ id: intent?.id, state: 'sent' }),
    ])
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(aggregate?.correspondence).toContainEqual(
      expect.objectContaining({
        correspondence_kind: 'request_information',
        sent_at: expect.any(Date),
      }),
    )
  })

  it('shows a bounced request on the staff case once SES reports the bounce', async () => {
    const { noticeId, claimantEmail } = await fileTestCopyrightFormNotice(false)
    await requestTestCopyrightInformation(noticeId, `Send the registration ${crypto.randomUUID()}`)
    const [intent] = await readTestInformationRequestIntents(noticeId)
    const sesMessageId = `ses-${crypto.randomUUID()}`
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({ MessageId: sesMessageId } as never)
    await processSendCopyrightNoticeEmail({ intentId: intent?.id ?? '' })

    await expect(
      markCopyrightDeliveryIntentBouncedBySesMessageId({
        sesMessageId,
        recipientEmails: [claimantEmail],
      }),
    ).resolves.toBe(1)

    await using transaction = await beginTransaction()
    const staffCase = await getPendingCopyrightStaffCase(noticeId, transaction)
    expect(staffCase?.delivery_intents).toContainEqual(
      expect.objectContaining({
        id: intent?.id,
        delivery_kind: 'staff_information_request',
        state: 'bounced',
      }),
    )
  })
})
