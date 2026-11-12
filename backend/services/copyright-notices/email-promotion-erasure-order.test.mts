import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import {
  createUnparsedCopyrightEmailIntake,
  readCopyrightEmailPromotionEffects,
} from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { markTestCopyrightNoticeErased } from '@voucha/test-helpers/copyright-email-manual-association'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it, onTestFinished } from 'vitest'
import { copyrightConfig } from './config.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'

describe('copyright email promotion replay and case erasure', () => {
  it('maps a deadlocked admission to a domain conflict without promotion effects', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createUnparsedCopyrightEmailIntake()
    const input = await copyrightEmailPromotionInput(moderator, intake.id)
    const failure = Object.assign(new Error('deadlock detected'), { code: '40P01' })
    let reachedRead = false
    const restore = runBeforePostgresStatementForTest(
      '/* promoteCopyrightEmailIntake:exists */',
      async () => {
        reachedRead = true
        throw failure
      },
    )
    onTestFinished(restore)
    try {
      await expect(promoteCopyrightEmailIntake(input)).rejects.toMatchObject({
        status: 409,
        code: COPYRIGHT_EMAIL_THREAD_CHANGED,
        cause: failure,
      })
    } finally {
      restore()
    }
    expect(reachedRead).toBe(true)
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
    expect(
      await readCopyrightEmailPromotionEffects(intake.id, input.targets[0]!.placementId),
    ).toMatchObject({ reviews: 0, evidence: 0, notice_targets: 0 })
  })

  it('rejects a replayed pending reply link when case erasure commits first', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const root = await recordThreadedCopyrightEmail({ messageId, replyReferences: [] })
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [messageId],
    })
    const input = await copyrightEmailPromotionInput(moderator, root.intakeId)
    const restoreCap = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      emailThreadGraphMaxRows: 2,
    })
    let promoted: Awaited<ReturnType<typeof promoteCopyrightEmailIntake>>
    try {
      promoted = await promoteCopyrightEmailIntake(input)
    } finally {
      restoreCap()
    }
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.intakeId)).toEqual([])
    const effects = await readCopyrightEmailPromotionEffects(
      root.intakeId,
      input.targets[0]!.placementId,
    )
    await using erasure = await beginTransaction()
    await markTestCopyrightNoticeErased(promoted.noticeId, erasure)
    const holderProcessId = await getTestPostgresBackendProcessId(erasure)
    let erasureCommit: Promise<void> | undefined
    const commitErasure = () => (erasureCommit ??= erasure.commit())
    const replay = await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: '/* linkPendingCopyrightEmailRepliesInTransaction:links */',
        releaseHolder: commitErasure,
      },
      async waitForLock => {
        const attempt = promoteCopyrightEmailIntake(input)
        await waitForLock(attempt)
        await commitErasure()
        return (await Promise.allSettled([attempt]))[0]!
      },
    )
    expect(replay).toMatchObject({
      status: 'rejected',
      reason: {
        status: 409,
        code: COPYRIGHT_EMAIL_THREAD_CHANGED,
        cause: {
          code: '23514',
          message: 'erased copyright case cannot acquire an email intake',
        },
      },
    })
    expect(await readCopyrightEmailIntakeNoticeLinks(root.intakeId)).toEqual([
      { copyright_notice_id: promoted.noticeId, link_kind: 'initial' },
    ])
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.intakeId)).toEqual([])
    expect(
      await readCopyrightEmailPromotionEffects(root.intakeId, input.targets[0]!.placementId),
    ).toEqual(effects)
  })
})
