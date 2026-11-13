import { seedCommittedTerritorialDecision } from '@voucha/test-helpers/copyright-territorial-committed-decision'
import {
  seedCommittedTerritorialRedress,
  seedCommittedTerritorialRedressDecision,
} from '@voucha/test-helpers/copyright-territorial-committed-redress'
import { assertTerritorialRequestOutcome } from '@voucha/test-helpers/copyright-territorial-request-outcome'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { getTestPostImagePlacement } from '@voucha/test-helpers/entities/post-images'
import { createTestEuParticipantCase } from '@voucha/test-helpers/copyright-eu-participant-cases'
import { createTestHistoricalEuDecisionWindow } from '@voucha/test-helpers/copyright-territorial-historical-window'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { readTerritorialDecisionReopeningFacts } from '@voucha/test-helpers/territorial-decision-reopening'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { seedRestorationSceneWithhold } from '@voucha/test-helpers/copyright-withhold-scene-fixture'
import { assertSurfaceRestoreOutcome } from '@voucha/test-helpers/copyright-surface-restore-outcome'

async function actionIntent(noticeId: string, action: 'withhold' | 'restore') {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const intent = aggregate?.actionIntents.find(row => row.action === action)
  if (!intent) throw new Error(`Missing ${action} intent for ${noticeId}`)
  return intent
}

describe('EU complaint after a reopened notice', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('projects second notifier and poster complaints on the successor, then restores after poster revoke', async () => {
    installTestMediaDeliveryEdge()
    const scene = await createTestEuParticipantCase('no_action')
    const noticeId = scene.receipt.notice_id
    const first = await seedCommittedTerritorialRedress(
      'eu_dsa',
      noticeId,
      scene.notifier,
      'Please review the no-action decision.',
    )
    await seedCommittedTerritorialRedressDecision('eu_dsa', noticeId, first.id, scene.staff, {
      disposition: 'revoke',
      rationale: 'The initial notice deserves a fresh review.',
    })
    const reopened = await readTerritorialDecisionReopeningFacts(noticeId)
    expect(reopened.decisions).toHaveLength(1)
    expect(reopened.restore_intent_count).toBe(0)

    await seedCommittedTerritorialDecision('eu_dsa', scene.staff, noticeId, {
      text: `The hosted post reproduces the notified photograph ${scene.suffix}.`,
      publicExplanation: `The image matches the notified photograph ${scene.suffix}.`,
      outcome: 'restrict',
      targets: [
        {
          surfaceKind: 'post-image',
          postId: scene.postId,
          imageId: scene.imageId,
          hostedUseUrl: `https://example.test/work/${scene.suffix}`,
        },
      ],
    })
    const restricted = await readTerritorialDecisionReopeningFacts(noticeId)
    expect(restricted.decisions).toHaveLength(2)
    expect(restricted.decisions[1]?.supersedes_decision_id).toBe(restricted.decisions[0]?.id)
    expect(restricted.operative_incident_count).toBe(1)
    expect(restricted.restrictions[0]?.lifted_at).toBeNull()
    await seedRestorationSceneWithhold((await actionIntent(noticeId, 'withhold')).id)
    const placement = await getTestPostImagePlacement(scene.postId, scene.imageId)
    if (!placement) throw new Error('Post image placement disappeared')
    expect(await getImagePlacementForCopyright(placement.placement_id)).toMatchObject({
      withheld: true,
    })

    const notifierSecond = await seedCommittedTerritorialRedress(
      'eu_dsa',
      noticeId,
      scene.notifier,
      'Please review the new restriction.',
    )
    const posterSecond = await seedCommittedTerritorialRedress(
      'eu_dsa',
      noticeId,
      scene.poster,
      'This post image should be restored.',
      'poster',
    )
    expect(new Set([first.id, notifierSecond.id, posterSecond.id]).size).toBe(3)
    await seedCommittedTerritorialRedressDecision(
      'eu_dsa',
      noticeId,
      posterSecond.id,
      scene.staff,
      {
        disposition: 'revoke',
        rationale: 'The poster complaint shows the restriction was mistaken.',
      },
    )
    const reversed = await readTerritorialDecisionReopeningFacts(noticeId)
    expect(reversed.operative_incident_count).toBe(0)
    expect(reversed.restore_intent_count).toBe(1)
    expect(
      reversed.messages.some(
        message =>
          message.recipient_role === 'claimant' &&
          message.text.includes('reversed the image restriction'),
      ),
    ).toBe(true)
    const restore = await actionIntent(noticeId, 'restore')
    await assertSurfaceRestoreOutcome({
      noticeId,
      restrictionId: restore.copyright_restriction_id,
      placementId: placement.placement_id,
      restoreId: restore.id,
      outcome: 'visible',
      incidentAccountIds: [scene.poster.id],
      deliveries: [
        `poster_restoration_notice:email:${scene.poster.id}`,
        `poster_restoration_notice:in_app:${scene.poster.id}`,
      ],
    })
    const notices = await readTestCopyrightStatementIntents(noticeId)
    expect(
      notices.some(
        intent =>
          intent.delivery_kind === 'claimant_decision_notice' &&
          intent.text?.includes('reversed the image restriction'),
      ),
    ).toBe(true)
  })

  it('atomically admits the initial notifier complaint on a no-action decision', async () => {
    expect.hasAssertions()
    const scene = await createTestEuParticipantCase('no_action')
    await assertTerritorialRequestOutcome(
      'eu_dsa',
      scene.receipt.notice_id,
      scene.notifier,
      'Review the no-action decision.',
      'notifier',
    )
  })

  it.each(['notifier', 'poster'] as const)(
    'atomically admits the %s complaint on a restricting successor',
    async role => {
      expect.hasAssertions()
      const scene = await createTestEuParticipantCase('no_action')
      const noticeId = scene.receipt.notice_id
      const initial = await seedCommittedTerritorialRedress(
        'eu_dsa',
        noticeId,
        scene.notifier,
        'Review the initial no-action decision.',
      )
      await seedCommittedTerritorialRedressDecision('eu_dsa', noticeId, initial.id, scene.staff, {
        disposition: 'revoke',
        rationale: 'A fresh review is warranted.',
      })
      await seedCommittedTerritorialDecision('eu_dsa', scene.staff, noticeId, {
        text: 'The hosted image reproduces the photograph.',
        publicExplanation: 'The image matches the photograph.',
        outcome: 'restrict',
        targets: [
          {
            surfaceKind: 'post-image',
            postId: scene.postId,
            imageId: scene.imageId,
            hostedUseUrl: `https://example.test/work/${scene.suffix}`,
          },
        ],
      })
      await assertTerritorialRequestOutcome(
        'eu_dsa',
        noticeId,
        role === 'notifier' ? scene.notifier : scene.poster,
        'Review the successor restriction.',
        role,
      )
    },
  )

  it('allows a staff reviewer to file a fresh complaint after a sent party window expired', async () => {
    const reviewer = await createTestUser({ extraRoles: ['moderator'] })
    const fixture = await createTestHistoricalEuDecisionWindow()
    expect(fixture.windowEndsAt.getTime()).toBeLessThan(Date.now())
    await assertTerritorialRequestOutcome(
      'eu_dsa',
      fixture.noticeId,
      reviewer,
      'Review the old decision for the notifier.',
      'reviewer',
    )
  })
})
