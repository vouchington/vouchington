import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { createCopyrightNoticeForManualAssociation } from '@voucha/test-helpers/copyright-email-manual-association'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  claimTestCopyrightEmailStorage,
  deleteTestCopyrightEmailLink,
  mutateCopyrightEmailAfterStorageClaim,
  readTestCopyrightEmailStorage,
  replayTestCopyrightEmailLink,
} from '@voucha/test-helpers/copyright-email-storage-claims'

async function createCaseIntake() {
  const noticeId = await createCopyrightNoticeForManualAssociation()
  const intake = await createUnparsedCopyrightEmailIntake()
  return { noticeId, intakeId: intake.id }
}

describe('copyright email links and claimed storage', () => {
  it.each(['insert', 'delete'] as const)(
    'rejects a concurrent %s when deletion claimed the object before the generation write',
    async operation => {
      const { noticeId, intakeId } = await createCaseIntake()
      if (operation === 'delete')
        await linkCopyrightEmailIntakeToNotice({ noticeId, intakeId, linkKind: 'thread' })
      const before = await readTestCopyrightEmailStorage(intakeId)
      await expect(
        mutateCopyrightEmailAfterStorageClaim<boolean | number | null>(
          noticeId,
          intakeId,
          operation === 'insert'
            ? 'linkCopyrightEmailIntakeToNotice'
            : 'deleteTestCopyrightEmailLink',
          () =>
            operation === 'insert'
              ? linkCopyrightEmailIntakeToNotice({ noticeId, intakeId, linkKind: 'thread' })
              : deleteTestCopyrightEmailLink(noticeId, intakeId),
        ),
      ).rejects.toMatchObject({ code: '23514' })
      expect(await readTestCopyrightEmailStorage(intakeId)).toEqual({ ...before, claimed: true })
      expect(await readCopyrightEmailIntakeNoticeLinks(intakeId)).toEqual(
        operation === 'insert' ? [] : [{ copyright_notice_id: noticeId, link_kind: 'thread' }],
      )
    },
  )

  it('replays an existing link without changing its generation while an object claim is uncommitted', async () => {
    const { noticeId, intakeId } = await createCaseIntake()
    await linkCopyrightEmailIntakeToNotice({ noticeId, intakeId, linkKind: 'thread' })
    await using claim = await beginTransaction()
    await claimTestCopyrightEmailStorage(noticeId, intakeId, claim)
    const before = await readTestCopyrightEmailStorage(intakeId)
    expect(await replayTestCopyrightEmailLink(noticeId, intakeId)).toBe(0)
    await claim.commit()
    expect(await readTestCopyrightEmailStorage(intakeId)).toEqual({ ...before, claimed: true })
    expect(await readCopyrightEmailIntakeNoticeLinks(intakeId)).toEqual([
      { copyright_notice_id: noticeId, link_kind: 'thread' },
    ])
  })

  it('allows link cleanup after controlled erasure cleared the original pointer', async () => {
    const { noticeId, intakeId } = await createCaseIntake()
    await linkCopyrightEmailIntakeToNotice({ noticeId, intakeId, linkKind: 'thread' })
    await using claim = await beginTransaction()
    await claimTestCopyrightEmailStorage(noticeId, intakeId, claim)
    await claim.commit()
    expect(await deleteTestCopyrightEmailLink(noticeId, intakeId, true)).toBe(1)
    expect(await readTestCopyrightEmailStorage(intakeId)).toBeNull()
    expect(await readCopyrightEmailIntakeNoticeLinks(intakeId)).toEqual([])
  })
})
