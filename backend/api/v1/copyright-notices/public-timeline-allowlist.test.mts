import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  useTestMediaDeliveryReplayProviders,
  createCopyrightReplayFixture,
} from '@voucha/test-helpers/copyright-route-replay-setup'
import {
  seedFailedTimelineAction,
  seedTimelineInternalFacts,
} from '@voucha/test-helpers/copyright-api-timeline-fixture'
import { assertApiActionReplay } from '@voucha/test-helpers/copyright-api-action-replay-outcome'

type TimelineEvent = { event_type: string }

const withheldEventTypes = [
  'guest_capability_issued',
  'guest_capability_revoked',
  'copyright_action_replayed',
  'supplement_received',
  'court_or_ccb_hold_received',
]

function eventTypes(body: { copyright_notice: { timeline: TimelineEvent[] } }): string[] {
  return body.copyright_notice.timeline.map(event => event.event_type)
}

describe('copyright case timeline audiences', () => {
  useTestMediaDeliveryReplayProviders()

  it('gives members and case participants only case-facing events while staff keep the full timeline', async () => {
    const actor = await createCopyrightReplayFixture()
    const actorStaff = createRequest()
    await actorStaff.authenticateAs(actor.moderator)
    await seedFailedTimelineAction(actor.intentId)
    await assertApiActionReplay({
      staff: actorStaff,
      noticeId: actor.noticeId,
      intentId: actor.intentId,
      actorId: actor.moderator.id,
    })
    const fixture = await createCopyrightReplayFixture()
    const staff = createRequest()
    await staff.authenticateAs(fixture.moderator)
    await seedTimelineInternalFacts(fixture)
    const recorded = (await getCopyrightNoticePrivateAggregate(fixture.noticeId))?.lifecycleEvents
    expect(recorded?.map(event => event.change_type)).toEqual(
      expect.arrayContaining(withheldEventTypes),
    )

    const member = createRequest()
    await member.authenticateAs(await createTestUser())
    const memberTypes = eventTypes(
      (await member.get(`/api/v1/copyright-notices/${fixture.noticeId}`).expect(200)).body,
    )
    expect(memberTypes).toEqual(
      expect.arrayContaining(['notice_received', 'provisional_restriction_imposed']),
    )
    for (const internal of withheldEventTypes) expect(memberTypes).not.toContain(internal)
    const staffOnMemberRoute = eventTypes(
      (await staff.get(`/api/v1/copyright-notices/${fixture.noticeId}`).expect(200)).body,
    )
    expect(staffOnMemberRoute).toEqual(memberTypes)

    const claimant = createRequest()
    await claimant.authenticateAs(fixture.claimant)
    const claimantResponse = await claimant
      .get(`/api/v1/copyright-notices/${fixture.noticeId}/participant`)
      .expect(200)
    expect(claimantResponse.body.copyright_notice.viewer_role).toBe('claimant')
    expect(eventTypes(claimantResponse.body)).toEqual(memberTypes)

    const staffResponse = await staff
      .get(`/api/v1/copyright-notices/${fixture.noticeId}/participant`)
      .expect(200)
    expect(staffResponse.body.copyright_notice.viewer_role).toBe('staff')
    expect(eventTypes(staffResponse.body)).toEqual(expect.arrayContaining(withheldEventTypes))
    expect(eventTypes(staffResponse.body)).toHaveLength(recorded?.length ?? -1)
  })
})
