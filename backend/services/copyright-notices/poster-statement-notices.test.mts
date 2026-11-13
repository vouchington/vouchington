import { assertStatementWithholdFailure } from '@voucha/test-helpers/copyright-statement-withhold-failure'
import { assertStatementFinalize } from '@voucha/test-helpers/copyright-statement-finalize-subject'
import { seedStatementTransportClaim } from '@voucha/test-helpers/copyright-statement-transport-fixtures'
import {
  createPosterReviewTransportScene,
  createDeliveredPosterTransportScene,
} from '@voucha/test-helpers/copyright-poster-transport-scenes'
import { copyrightEmailSubject } from './statement-of-reasons-wording.mts'
import { listNotifications } from '@services/notifications'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createTestUser } from '@voucha/test-helpers'
import { createCommittedCopyrightStatementScene } from '@voucha/test-helpers/copyright-statement-scene'
import { seedEffectiveConfirmation } from '@voucha/test-helpers/copyright-effective-review-decisions'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import {
  readTestCopyrightStatementIntents,
  replayTestCopyrightStatementNotices,
} from '@voucha/test-helpers/copyright-statement-notices'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  assertStatementInAppTransport,
  assertStatementEmailTransport,
} from '@voucha/test-helpers/copyright-statement-transport-subjects'

describe('poster statements on human imposition', () => {
  let edge: ReturnType<typeof installTestMediaDeliveryEdge>

  beforeEach(() => {
    edge = installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  useCopyrightIntakeEnvironment()
  it('delivers truthful immutable authorization text even when withholding delivery fails', async () => {
    const poster = await createTestUser()
    const { notice, target } = await createCommittedCopyrightStatementScene({ poster })
    const noticeId = notice.intake.copyright_notice_id
    const before = await readTestCopyrightStatementIntents(noticeId)
    const action = (await getCopyrightNoticePrivateAggregate(noticeId))!.actionIntents.find(
      row => row.action === 'withhold',
    )!
    edge.put.mockRejectedValue(new Error('Edge unavailable'))
    await assertStatementWithholdFailure(noticeId, action.id, target.placement_id)
    const email = before.find(row => row.recipient_role === 'poster' && row.channel === 'email')!
    expect(email.text).toContain('An image restriction was authorized')
    expect(email.text).not.toContain('The image is withheld')
    expect((await assertStatementEmailTransport(email.id))?.text).toBe(email.text)
    const inApp = before.find(row => row.recipient_role === 'poster' && row.channel === 'in_app')!
    expect((await assertStatementInAppTransport(inApp.id)).body).toBe(email.text!.split('\n\n')[0])
    const deliveredScene = await createDeliveredPosterTransportScene()
    expect(
      Object.values((await listNotifications(deliveredScene.poster.id)).notifications),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: deliveredScene.intents
            .find(row => row.channel === 'email' && row.recipient_role === 'poster')!
            .text!.split('\n\n')[0],
        }),
      ]),
    )
  })
  it('records both channels and in-app informed-at time', async () => {
    const poster = await createTestUser()
    const { notice } = await createCommittedCopyrightStatementScene({ poster })
    const intents = (
      await readTestCopyrightStatementIntents(notice.intake.copyright_notice_id)
    ).filter(row => row.recipient_role === 'poster')
    expect(intents).toHaveLength(2)
    expect(intents.every(row => row.recipient_user_id === poster.id)).toBe(true)
    expect(intents.find(row => row.channel === 'email')?.text).toContain('worldwide')
    expect(intents.find(row => row.channel === 'email')?.text).toContain(
      'A person made this decision',
    )
    expect(intents.find(row => row.channel === 'email')?.text).toContain('/counter-notice')
    expect(
      (await assertStatementInAppTransport(intents.find(row => row.channel === 'in_app')!.id)).body,
    ).toBe(intents.find(row => row.channel === 'email')!.text!.split('\n\n')[0])
    const deliveredScene = await createDeliveredPosterTransportScene()
    const notifications = await listNotifications(deliveredScene.poster.id)
    expect(Object.values(notifications.notifications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_path: `/copyright/notices/${deliveredScene.noticeId}`,
          body: deliveredScene.intents
            .find(row => row.channel === 'email' && row.recipient_role === 'poster')!
            .text!.split('\n\n')[0],
        }),
      ]),
    )
    expect(
      deliveredScene.intents.find(
        row => row.channel === 'in_app' && row.recipient_role === 'poster',
      )?.sent_at,
    ).toBeInstanceOf(Date)
  })
})

describe('poster first human review statements', () => {
  useCopyrightIntakeEnvironment()
  useAutomaticProvisionalWithholding()
  it('delivers all new email subjects and in-app kinds with per-recipient sent times', async () => {
    const { intents } = await createPosterReviewTransportScene()
    for (const intent of intents.filter(row => row.channel === 'in_app')) {
      expect((await assertStatementInAppTransport(intent.id)).body).toBe(
        intent.text!.split('\n\n')[0],
      )
    }
    for (const intent of intents.filter(row => row.channel === 'email')) {
      const prepared = await assertStatementEmailTransport(intent.id)
      expect(prepared.subject).toBe(
        copyrightEmailSubject(
          intent.delivery_kind as
            | 'poster_review_notice'
            | 'poster_restoration_notice'
            | 'claimant_decision_notice',
        ),
      )
      expect(prepared.text).toBe(intent.text)
    }
    // Finalize subjects each own an independent already committed transport claim.
    const finalize = await createPosterReviewTransportScene()
    for (const intent of finalize.intents.filter(row => row.channel === 'email')) {
      const token = await seedStatementTransportClaim(intent.id)
      await assertStatementFinalize(intent.id, token)
    }
    const deliveredScene = await createDeliveredPosterTransportScene(true)
    const delivered = deliveredScene.intents
    expect(
      delivered
        .filter(row => row.delivery_kind !== 'poster_restriction_notice')
        .every(row => row.sent_at instanceof Date),
    ).toBe(true)
    expect(
      new Set(intents.filter(row => row.channel === 'email').map(row => row.delivery_kind)),
    ).toEqual(
      new Set(['poster_review_notice', 'poster_restoration_notice', 'claimant_decision_notice']),
    )
  })
  it.each(['confirm', 'reverse'] as const)(
    'keeps the %s decision durable independently of restoration',
    async action => {
      const { notice, moderator } = await createCommittedCopyrightStatementScene(
        {},
        { automated: true },
      )
      const caseId = notice.intake.copyright_notice_id
      const restriction = (await getCopyrightNoticePrivateAggregate(caseId))!.restrictions[0]!
      await seedEffectiveConfirmation(caseId, restriction.id, moderator, action)
      await replayTestCopyrightStatementNotices(caseId, restriction.id, action)
      const intents = await readTestCopyrightStatementIntents(caseId)
      expect(intents.filter(row => row.delivery_kind === 'poster_review_notice')).toHaveLength(2)
      expect(intents.filter(row => row.delivery_kind === 'poster_restoration_notice')).toHaveLength(
        0,
      )
      expect(
        intents.find(row => row.delivery_kind === 'poster_review_notice' && row.channel === 'email')
          ?.text,
      ).toContain('A person made this decision')
      expect(intents.filter(row => row.delivery_kind === 'claimant_decision_notice')).toHaveLength(
        4,
      )
    },
  )
})
