import { describe, expect, it } from 'vitest'
import {
  createUnparsedCopyrightEmailIntake,
  seedCopyrightEmailInitialThreadSource,
} from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  eraseTestCopyrightEmailIntakeOriginal,
  readTestCopyrightEmailThreadReferences,
  writeCopyrightEmailAfterReceiptErasure,
} from '@voucha/test-helpers/copyright-email-intake-retention'
import { readCopyrightIntakeRetentionState } from '@voucha/test-helpers/copyright-email-retention-state'
import {
  associateCopyrightEmailAfterErasure,
  isTestCopyrightCaseEvidenceErased,
} from '@voucha/test-helpers/copyright-email-manual-association'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { copyrightEmailMessageId } from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
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

  it('retains only admitted hash facts when concurrent case erasure rejects derivation', async () => {
    const messageId = copyrightEmailMessageId()
    const parent = await createRetentionMinimalCase()
    await seedCopyrightEmailInitialThreadSource(parent.noticeId, messageId)
    const intake = await createUnparsedCopyrightEmailIntake()
    const error = await associateCopyrightEmailAfterErasure(
      parent.noticeId,
      () =>
        recordCopyrightEmailThreadReferences({
          intakeId: intake.id,
          messageId: copyrightEmailMessageId(),
          inReplyTo: [],
          references: [messageId],
        }),
      'linkCopyrightEmailIntakeToNotice',
    ).catch((err: unknown) => err)
    const native = expect.objectContaining({
      status: 409,
      code: 'copyright_email_thread_changed',
      cause: expect.objectContaining({ code: '40001' }),
    })
    const erasedGuard = expect.objectContaining({
      status: 409,
      code: 'copyright_email_thread_changed',
      cause: expect.objectContaining({ constraint: 'copyright_email_link_active_case' }),
    })
    expect([
      { error: native, references: [], ancestorCount: 0, links: [], caseErased: true },
      {
        error: native,
        references: ['message_id', 'references'],
        ancestorCount: 0,
        links: [],
        caseErased: true,
      },
      {
        error: erasedGuard,
        references: ['message_id', 'references'],
        ancestorCount: 0,
        links: [],
        caseErased: true,
      },
    ]).toContainEqual({
      error,
      references: await readTestCopyrightEmailThreadReferences(intake.id),
      ancestorCount: (await readCopyrightIntakeRetentionState(intake.id)).ancestorCount,
      links: await readCopyrightEmailIntakeNoticeLinks(intake.id),
      caseErased: await isTestCopyrightCaseEvidenceErased(parent.noticeId),
    })
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
    expect([
      expect.objectContaining({ code: '23514' }),
      expect.objectContaining({
        status: 409,
        code: 'copyright_email_thread_changed',
        cause: expect.objectContaining({ code: '40001' }),
      }),
    ]).toContainEqual(error)
    expect(await readTestCopyrightEmailThreadReferences(intake.id)).toEqual([])
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
  })
})
