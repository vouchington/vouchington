import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import {
  eraseTestCopyrightEmailIntakeOriginal,
  readTestCopyrightEmailThreadReferences,
  writeCopyrightEmailAfterReceiptErasure,
} from '@voucha/test-helpers/copyright-email-intake-retention'
import { associateCopyrightEmailAfterErasure } from '@voucha/test-helpers/copyright-email-manual-association'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  copyrightEmailMessageId,
  promoteInitialCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { recordCopyrightEmailThreadReferences } from './email-threading.mts'

describe('copyright threading after evidence erasure', () => {
  it('ignores erased originals without retaining new references', async () => {
    const intake = await createUnparsedCopyrightEmailIntake()
    await eraseTestCopyrightEmailIntakeOriginal(intake.id)
    await expect(
      recordCopyrightEmailThreadReferences({
        intakeId: intake.id,
        messageId: copyrightEmailMessageId(),
        inReplyTo: [],
        references: [],
      }),
    ).resolves.toBeNull()
    expect(await readTestCopyrightEmailThreadReferences(intake.id)).toEqual([])
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
  })

  it('returns a conflict and rolls back references when the matched case is concurrently erased', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const parent = await promoteInitialCopyrightEmail({ moderator, messageId })
    const intake = await createUnparsedCopyrightEmailIntake()
    await expect(
      associateCopyrightEmailAfterErasure(
        parent.noticeId,
        () =>
          recordCopyrightEmailThreadReferences({
            intakeId: intake.id,
            messageId: copyrightEmailMessageId(),
            inReplyTo: [],
            references: [messageId],
          }),
        'linkCopyrightEmailIntakeToNotice',
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: 'copyright_email_thread_changed',
      cause: { constraint: 'copyright_email_link_active_case' },
    })
    expect(await readTestCopyrightEmailThreadReferences(intake.id)).toEqual([])
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
  })

  it('preserves the source rejection when its receipt is concurrently erased', async () => {
    const intake = await createUnparsedCopyrightEmailIntake()
    const error = await writeCopyrightEmailAfterReceiptErasure(intake.id, () =>
      recordCopyrightEmailThreadReferences({
        intakeId: intake.id,
        messageId: copyrightEmailMessageId(),
        inReplyTo: [],
        references: [],
      }),
    ).catch((err: unknown) => err)
    expect(error).toMatchObject({ code: '23514' })
    expect(error).not.toHaveProperty('status')
    expect(await readTestCopyrightEmailThreadReferences(intake.id)).toEqual([])
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
  })
})
