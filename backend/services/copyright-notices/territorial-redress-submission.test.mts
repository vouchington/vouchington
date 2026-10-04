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
import {
  processCopyrightActionIntent,
  recordEuCopyrightRedressDecision,
  recordEuCopyrightStatementOfReasons,
  submitEuCopyrightRedress,
} from './index.mts'

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

  it('admits second notifier and poster complaints on the successor, then restores after poster revoke', async () => {
    const edge = installTestMediaDeliveryEdge()
    const scene = await createTestEuParticipantCase('no_action')
    const noticeId = scene.receipt.notice_id
    const first = await submitEuCopyrightRedress(
      scene.notifier,
      noticeId,
      crypto.randomUUID(),
      'Please review the no-action decision.',
    )
    await recordEuCopyrightRedressDecision(scene.staff, noticeId, first.id, {
      disposition: 'revoke',
      rationale: 'The initial notice deserves a fresh review.',
    })
    const reopened = await readTerritorialDecisionReopeningFacts(noticeId)
    expect(reopened.decisions).toHaveLength(1)
    expect(reopened.restore_intent_count).toBe(0)

    await recordEuCopyrightStatementOfReasons(scene.staff, noticeId, {
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
    await expect(
      processCopyrightActionIntent((await actionIntent(noticeId, 'withhold')).id),
    ).resolves.toBe('applied')
    const placement = await getTestPostImagePlacement(scene.postId, scene.imageId)
    if (!placement) throw new Error('Post image placement disappeared')
    expect(await getImagePlacementForCopyright(placement.placement_id)).toMatchObject({
      withheld: true,
    })

    const notifierSecond = await submitEuCopyrightRedress(
      scene.notifier,
      noticeId,
      crypto.randomUUID(),
      'Please review the new restriction.',
    )
    const posterSecond = await submitEuCopyrightRedress(
      scene.poster,
      noticeId,
      crypto.randomUUID(),
      'This post image should be restored.',
    )
    expect(new Set([first.id, notifierSecond.id, posterSecond.id]).size).toBe(3)
    await recordEuCopyrightRedressDecision(scene.staff, noticeId, posterSecond.id, {
      disposition: 'revoke',
      rationale: 'The poster complaint shows the restriction was mistaken.',
    })
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
    await expect(
      processCopyrightActionIntent((await actionIntent(noticeId, 'restore')).id),
    ).resolves.toBe('applied')
    expect(await getImagePlacementForCopyright(placement.placement_id)).toMatchObject({
      withheld: false,
    })
    expect([...edge.records.values()].some(record => record.state === 'allow')).toBe(true)
    const restored = await readTerritorialDecisionReopeningFacts(noticeId)
    expect(restored.restrictions[0]?.lifted_at).toBeInstanceOf(Date)
    expect(restored.operative_incident_count).toBe(0)
    const notices = await readTestCopyrightStatementIntents(noticeId)
    expect(
      notices.some(
        intent =>
          intent.delivery_kind === 'claimant_decision_notice' &&
          intent.text?.includes('reversed the image restriction'),
      ),
    ).toBe(true)
  })

  it('allows a staff reviewer to file a fresh complaint after a sent party window expired', async () => {
    const reviewer = await createTestUser({ extraRoles: ['moderator'] })
    const fixture = await createTestHistoricalEuDecisionWindow()
    expect(fixture.windowEndsAt.getTime()).toBeLessThan(Date.now())
    const complaint = await submitEuCopyrightRedress(
      reviewer,
      fixture.noticeId,
      crypto.randomUUID(),
      'Review the old decision for the notifier.',
    )
    expect(complaint.is_duplicate).toBe(false)
  })
})
