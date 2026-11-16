import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import { readCopyrightEmailAncestorIds } from '@voucha/test-helpers/copyright-email-ancestor-edges'
import { readCopyrightEmailPromotionEffects } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
  seedTestCopyrightAncestorEdge,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import {
  readCopyrightThreadRetirementBound,
  seedCopyrightThreadRetirement,
} from '@voucha/test-helpers/copyright-thread-retention'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionThreadSeedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it } from 'vitest'
import { copyrightConfig } from './config.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import { linkPendingCopyrightEmailRepliesInTransaction } from './email-thread-link-pending.mts'

describe('copyright email promotion ancestry race', () => {
  it('rolls back pending links when committed ancestry grows beyond the fixed graph cap', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const rootMessageId = copyrightEmailMessageId()
    const root = await recordThreadedCopyrightEmail({ messageId: rootMessageId })
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      inReplyTo: [rootMessageId],
    })
    const outside = await recordThreadedCopyrightEmail({ messageId: copyrightEmailMessageId() })
    const input = await copyrightEmailPromotionInput(moderator, root.intakeId)
    const before = await readCopyrightEmailPromotionEffects(
      root.intakeId,
      input.targets[0]!.placementId,
    )
    const restoreConfig = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      emailThreadGraphMaxRows: 3,
    })
    let ancestryExpanded = false
    const restoreQuery = afterPostgresTransactionQueryForTest(
      '/* linkPendingCopyrightEmailRepliesInTransaction:links */',
      values => values.includes(root.intakeId),
      async () => {
        restoreQuery()
        // The pending INSERT saw a three-row graph. This independent committed edge adds
        // an outside ancestor before its new links authorize any case activity.
        await seedTestCopyrightAncestorEdge(reply.intakeId, outside.intakeId)
        ancestryExpanded = true
      },
    )
    try {
      await expect(promoteCopyrightEmailIntake(input)).rejects.toMatchObject({
        status: 409,
        code: COPYRIGHT_EMAIL_THREAD_CHANGED,
        cause: undefined,
      })
      expect(ancestryExpanded).toBe(true)
      expect(await readCopyrightEmailAncestorIds(reply.intakeId)).toEqual(
        [root.intakeId, outside.intakeId].toSorted(),
      )
      expect(await readCopyrightEmailIntakeNoticeLinks(reply.intakeId)).toEqual([])
      expect(await readCopyrightEmailIntakeNoticeLinks(root.intakeId)).toEqual([])
      expect(
        await readCopyrightEmailPromotionEffects(root.intakeId, input.targets[0]!.placementId),
      ).toEqual(before)
    } finally {
      restoreQuery()
      restoreConfig()
    }
  })

  it('rejects a stale promotion graph whose linked root retired before pending assignment', async () => {
    const notice = await createRetentionMinimalCase()
    const rootMessageId = copyrightEmailMessageId()
    const root = await createRetentionThreadSeedEmail('pending-retired-root', {
      sesMessageId: notice.initialEmailSesMessageId,
      messageId: rootMessageId,
    })
    await linkTestCopyrightEmailIntake(root.id, notice.noticeId)
    const reply = await createRetentionThreadSeedEmail('pending-retired-reply', {
      messageId: copyrightEmailMessageId(),
      replyReferences: [rootMessageId],
    })
    await seedTestCopyrightAncestorEdge(reply.id, root.id)
    expect(root.id.localeCompare(reply.id)).toBeLessThan(0)
    const rootFacts = await readCopyrightThreadReferenceState(root.id)
    const replyFacts = await readCopyrightThreadReferenceState(reply.id)
    // The proposed reply is still at the fresh boundary, but its authorizing root retired.
    // These are the real committed graph identities an earlier promotion read retained.
    await seedCopyrightThreadRetirement(notice.noticeId, reply.id)
    await using transaction = await beginTransaction()
    await expect(
      linkPendingCopyrightEmailRepliesInTransaction(
        {
          initialIntakeId: root.id,
          noticeId: notice.noticeId,
          descendantIntakeIds: [reply.id],
          graphIntakeIds: [root.id, reply.id],
        },
        transaction,
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: COPYRIGHT_EMAIL_THREAD_CHANGED,
      cause: undefined,
    })
    await transaction.rollback()
    expect(await readCopyrightThreadRetirementBound(notice.noticeId)).toBe(reply.id)
    expect(await readCopyrightEmailIntakeNoticeLinks(root.id)).toEqual([
      { copyright_notice_id: notice.noticeId, link_kind: 'initial' },
    ])
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.id)).toEqual([])
    expect(await readCopyrightThreadReferenceState(root.id)).toEqual(rootFacts)
    expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(replyFacts)
    expect(await readCopyrightEmailAncestorIds(reply.id)).toEqual([root.id])
  })
})
