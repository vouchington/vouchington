import { beginTransaction } from '@voucha/test-helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { failTestCopyrightDeliveryIntent } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { captureTestLogOutput } from '@voucha/test-helpers/services/copyright-notices/capture-log-output'
import { openTestGuestCopyrightNotice } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import {
  fileTestCopyrightFormNotice,
  requestTestCopyrightInformation,
} from '@voucha/test-helpers/services/copyright-notices/information-request-fixture'
import {
  readTestCorrespondenceBodyCiphertext,
  readTestInformationRequestIntents,
} from '@voucha/test-helpers/services/copyright-notices/claimant-delivery'
import { decryptSecret } from '@modules/token-secrets'
import { getCopyrightEmailCorrespondence } from './correspondence.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { getPendingCopyrightStaffCase } from './read-models-staff-case.mts'

describe('copyright staff information request delivery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    { label: 'guest', signedIn: false },
    { label: 'signed-in', signedIn: true },
  ])(
    'queues exactly one claimant email to the notice address for a $label form notice',
    async ({ signedIn }) => {
      const { noticeId, claimantEmail } = await fileTestCopyrightFormNotice(signedIn)
      const statement = `Send the registration number ${crypto.randomUUID()}`

      const correspondence = await requestTestCopyrightInformation(noticeId, statement)

      const intents = await readTestInformationRequestIntents(noticeId)
      expect(intents).toEqual([
        {
          id: expect.any(String),
          state: 'pending',
          recipientEmail: claimantEmail,
          correspondenceId: correspondence.id,
          recipientRole: 'claimant',
          channel: 'email',
        },
      ])
      const delivery = await getCopyrightEmailCorrespondence(intents[0]?.id ?? '')
      expect(delivery.bodyText).toBe(statement)
    },
  )

  it('keeps the request text out of every log stream and stores it encrypted', async () => {
    const { noticeId } = await fileTestCopyrightFormNotice(false)
    const statement = `Confidential request ${crypto.randomUUID()}`
    const output = captureTestLogOutput()

    const correspondence = await requestTestCopyrightInformation(noticeId, statement)

    expect(output()).not.toContain(statement)
    const stored = await readTestCorrespondenceBodyCiphertext(correspondence.id)
    expect(stored).not.toContain(statement)
    expect(decryptSecret(stored, `copyright-correspondence:${correspondence.id}`)).toBe(statement)
  })

  it('rejects a request whose notice recorded no claimant email instead of silently skipping it', async () => {
    const noticeId = await openTestGuestCopyrightNotice()

    await expect(
      requestTestCopyrightInformation(noticeId, 'Send the registration number'),
    ).rejects.toMatchObject({ status: 422 })

    await expect(readTestInformationRequestIntents(noticeId)).resolves.toEqual([])
  })

  it.each([
    { label: 'carries no correspondence', recipientRole: 'claimant', withCorrespondence: false },
    {
      label: 'is addressed to a correspondent',
      recipientRole: 'correspondent',
      withCorrespondence: true,
    },
  ] as const)(
    'refuses at the database a staff information request delivery that $label',
    async ({ recipientRole, withCorrespondence }) => {
      const { noticeId } = await fileTestCopyrightFormNotice(false)
      const correspondence = withCorrespondence
        ? await requestTestCopyrightInformation(noticeId, 'Send the registration number')
        : null

      await expect(
        createCopyrightDeliveryIntent({
          noticeId,
          submissionId: null,
          correspondenceId: correspondence?.id ?? null,
          recipientUserId: null,
          recipientRole,
          deliveryKind: 'staff_information_request',
          channel: 'email',
          idempotencyKey: crypto.randomUUID(),
          recipientEmail: 'tests+other@voucha.ai',
        }),
      ).rejects.toThrow(/violates check constraint/)
    },
  )

  it('shows a failed request delivery on the staff case so it is not silently stuck', async () => {
    const { noticeId } = await fileTestCopyrightFormNotice(true)
    await requestTestCopyrightInformation(noticeId, `Send the registration ${crypto.randomUUID()}`)
    const [intent] = await readTestInformationRequestIntents(noticeId)
    await failTestCopyrightDeliveryIntent(intent?.id ?? '')

    await using transaction = await beginTransaction()
    const staffCase = await getPendingCopyrightStaffCase(noticeId, transaction)

    expect(staffCase?.delivery_intents).toContainEqual({
      id: intent?.id,
      delivery_kind: 'staff_information_request',
      channel: 'email',
      state: 'failed',
      delivery_attempt_count: 5,
    })
  })
})
