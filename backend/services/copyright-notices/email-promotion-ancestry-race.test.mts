import { createTestUser } from '@voucha/test-helpers'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import { readCopyrightEmailAncestorIds } from '@voucha/test-helpers/copyright-email-ancestor-edges'
import { readCopyrightEmailPromotionEffects } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { seedTestCopyrightAncestorEdge } from '@voucha/test-helpers/copyright-operational-email-retention'
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
})
