import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { seedEffectiveAppealDecision } from '@voucha/test-helpers/copyright-effective-review-decisions'
import { createStatementAppealScene } from '@voucha/test-helpers/copyright-statement-appeal-scenes'
import { assertStatementAppealReview } from '@voucha/test-helpers/copyright-statement-appeal-outcomes'
import { assertCommittedStatementAppealRestoration } from '@voucha/test-helpers/copyright-statement-appeal-restore'

describe('appeal as first human review', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  useCopyrightIntakeEnvironment()
  useAutomaticProvisionalWithholding()

  it.each(['confirm', 'reverse'] as const)(
    'records the %s review once without dropping the appellant status update',
    async action => {
      const actual = await createStatementAppealScene(action)
      await assertStatementAppealReview(actual.decision, {
        noticeId: actual.noticeId,
        restrictionId: actual.restriction.id,
        targetId: actual.target.id,
        poster: actual.poster,
      })
      // This independent committed decision always reaches replay and statement consumers.
      const scene = await createStatementAppealScene(action, true)
      await seedEffectiveAppealDecision(scene.decision, scene.noticeId)
      await assertStatementAppealReview(
        scene.decision,
        {
          noticeId: scene.noticeId,
          restrictionId: scene.restriction.id,
          targetId: scene.target.id,
          poster: scene.poster,
        },
        { replay: true },
      )
      const statements = await readTestCopyrightStatementIntents(scene.noticeId)
      expect(statements.filter(row => row.delivery_kind === 'poster_review_notice')).toHaveLength(2)
      expect(
        statements.filter(row => row.delivery_kind === 'poster_restoration_notice'),
      ).toHaveLength(0)
      expect(
        statements.find(
          row => row.delivery_kind === 'poster_review_notice' && row.channel === 'email',
        )?.text,
      ).toContain(action === 'confirm' ? 'A person confirmed' : 'A person reversed')
      expect((await getCopyrightNoticePrivateAggregate(scene.noticeId))!.deliveryIntents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            delivery_kind: 'status_update',
            recipient_user_id: scene.poster.id,
          }),
        ]),
      )
      if (action === 'reverse') await assertCommittedStatementAppealRestoration(scene)
    },
  )
})
