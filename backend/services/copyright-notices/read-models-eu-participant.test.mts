import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestEuParticipantCase,
  createTestEuParticipantComplaint,
} from '@voucha/test-helpers/copyright-eu-participant-cases'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  claimCopyrightDeliveryIntent,
  markCopyrightDeliveryIntentSent,
} from './delivery-intents.mts'
import { recordEuCopyrightStatementOfReasons } from './eu-reasons.mts'
import { getCopyrightParticipantNoticeDetail } from './read-models.mts'

describe('EU participant read model', () => {
  useCopyrightIntakeEnvironment()

  it('serves the notifier before acceptance and after a no-action decision', async () => {
    const scene = await createTestEuParticipantCase('pending')
    const pending = await getCopyrightParticipantNoticeDetail(
      scene.receipt.notice_id,
      scene.notifier,
    )
    expect(pending).toMatchObject({
      jurisdiction: 'eu_dsa',
      accepted_at: null,
      viewer_role: 'claimant',
      eu: {
        outcome: null,
        decided_at: null,
        informed_at: null,
        reopened_at: null,
        complaint: { can_submit: false, window_ends_at: null, request: null, decision: null },
        dispute_settlements: [],
      },
    })

    const decided = await createTestEuParticipantCase('no_action')
    const detail = await getCopyrightParticipantNoticeDetail(
      decided.receipt.notice_id,
      decided.notifier,
    )
    expect(detail).toMatchObject({
      jurisdiction: 'eu_dsa',
      accepted_at: null,
      viewer_role: 'claimant',
      eu: { outcome: 'no_action', decided_at: expect.any(Date) },
    })
    expect(JSON.stringify(detail)).not.toContain('Staff-only rationale')
  })

  it('gives each party only its own complaint and decision, while staff remains redacted here', async () => {
    const scene = await createTestEuParticipantCase('restrict')
    const notifierExplanation = `notifier complaint ${scene.suffix}`
    const posterExplanation = `poster complaint ${scene.suffix}`
    const notifierRationale = `notifier decision rationale ${scene.suffix}`
    const posterRationale = `poster decision rationale ${scene.suffix}`
    await createTestEuParticipantComplaint({
      noticeId: scene.receipt.notice_id,
      actor: scene.notifier,
      staff: scene.staff,
      explanation: notifierExplanation,
      rationale: notifierRationale,
    })
    await createTestEuParticipantComplaint({
      noticeId: scene.receipt.notice_id,
      actor: scene.poster,
      staff: scene.staff,
      explanation: posterExplanation,
      rationale: posterRationale,
    })

    const notifier = await getCopyrightParticipantNoticeDetail(
      scene.receipt.notice_id,
      scene.notifier,
    )
    const poster = await getCopyrightParticipantNoticeDetail(scene.receipt.notice_id, scene.poster)
    const staff = await getCopyrightParticipantNoticeDetail(scene.receipt.notice_id, scene.staff)
    expect(notifier?.viewer_role).toBe('claimant')
    expect(poster?.viewer_role).toBe('poster')
    expect(staff?.viewer_role).toBe('staff')
    expect(JSON.stringify(notifier?.eu?.complaint)).toContain(notifierExplanation)
    expect(JSON.stringify(notifier?.eu?.complaint)).toContain(notifierRationale)
    expect(JSON.stringify(notifier?.eu?.complaint)).not.toContain(posterExplanation)
    expect(JSON.stringify(notifier?.eu?.complaint)).not.toContain(posterRationale)
    expect(JSON.stringify(poster?.eu?.complaint)).toContain(posterExplanation)
    expect(JSON.stringify(poster?.eu?.complaint)).toContain(posterRationale)
    expect(JSON.stringify(poster?.eu?.complaint)).not.toContain(notifierExplanation)
    expect(JSON.stringify(poster?.eu?.complaint)).not.toContain(notifierRationale)
    expect(JSON.stringify(staff?.statements)).toBe('[]')
    expect(JSON.stringify(notifier)).not.toContain(`Notifier contact ${scene.suffix}`)
    expect(JSON.stringify(poster)).not.toContain(`notifier-${scene.suffix}@example.test`)
    expect(
      await getCopyrightParticipantNoticeDetail(scene.receipt.notice_id, scene.stranger),
    ).toBeNull()
  })

  it('keeps the complaint window null until this viewer was informed', async () => {
    const scene = await createTestEuParticipantCase('restrict')
    const notifier = await getCopyrightParticipantNoticeDetail(
      scene.receipt.notice_id,
      scene.notifier,
    )
    const poster = await getCopyrightParticipantNoticeDetail(scene.receipt.notice_id, scene.poster)
    expect(notifier?.eu?.complaint).toMatchObject({ can_submit: true, window_ends_at: null })
    expect(poster?.eu?.complaint).toMatchObject({ can_submit: true, window_ends_at: null })

    const intents = await readTestCopyrightStatementIntents(scene.receipt.notice_id)
    for (const intent of intents.filter(
      row =>
        (row.recipient_role === 'claimant' && row.delivery_kind === 'claimant_decision_notice') ||
        (row.recipient_role === 'poster' && row.delivery_kind === 'poster_restriction_notice'),
    )) {
      // The lease and sent transition are a single delivery attempt for each recipient intent.
      const claim = await claimCopyrightDeliveryIntent(intent.id)
      expect(claim).not.toBeNull()
      expect(
        await markCopyrightDeliveryIntentSent({
          intentId: intent.id,
          leaseToken: claim!.lease_token,
        }),
      ).toBe(true)
    }
    const informedNotifier = await getCopyrightParticipantNoticeDetail(
      scene.receipt.notice_id,
      scene.notifier,
    )
    const informedPoster = await getCopyrightParticipantNoticeDetail(
      scene.receipt.notice_id,
      scene.poster,
    )
    expect(informedNotifier?.eu?.complaint?.window_ends_at).toBeInstanceOf(Date)
    expect(informedPoster?.eu?.complaint?.window_ends_at).toBeInstanceOf(Date)
  })

  it('disables complaint submission while reopened, then scopes the successor to its own decision', async () => {
    const scene = await createTestEuParticipantCase('no_action')
    const oldComplaint = await createTestEuParticipantComplaint({
      noticeId: scene.receipt.notice_id,
      actor: scene.notifier,
      staff: scene.staff,
      explanation: `old complaint ${scene.suffix}`,
      rationale: `upheld ${scene.suffix}`,
      disposition: 'revoke',
    })
    const reopened = await getCopyrightParticipantNoticeDetail(
      scene.receipt.notice_id,
      scene.notifier,
    )
    expect(reopened?.eu).toMatchObject({
      reopened_at: expect.any(Date),
      complaint: { can_submit: false, window_ends_at: null },
    })

    await recordEuCopyrightStatementOfReasons(scene.staff, scene.receipt.notice_id, {
      text: `Successor rationale ${scene.suffix}`,
      publicExplanation: `Successor public explanation ${scene.suffix}`,
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
    const successor = await getCopyrightParticipantNoticeDetail(
      scene.receipt.notice_id,
      scene.notifier,
    )
    expect(successor?.eu).toMatchObject({
      outcome: 'restrict',
      complaint: { can_submit: true, window_ends_at: null, request: null, decision: null },
    })
    expect(oldComplaint.request.id).not.toBe(successor?.eu?.complaint?.request?.id)
  })

  it('enforces participant authentication and denies an unrelated signed-in member', async () => {
    const scene = await createTestEuParticipantCase('no_action')
    await createRequest()
      .get(`/api/v1/copyright-notices/${scene.receipt.notice_id}/participant`)
      .expect(401)
    const stranger = createRequest()
    await stranger.authenticateAs(scene.stranger)
    await stranger
      .get(`/api/v1/copyright-notices/${scene.receipt.notice_id}/participant`)
      .expect(403)
    const notifier = createRequest()
    await notifier.authenticateAs(scene.notifier)
    const response = await notifier
      .get(`/api/v1/copyright-notices/${scene.receipt.notice_id}/participant`)
      .expect(200)
    expect(response.body.copyright_notice.eu.outcome).toBe('no_action')
    expect(JSON.stringify(response.body)).not.toContain('Staff-only rationale')
  })
})
