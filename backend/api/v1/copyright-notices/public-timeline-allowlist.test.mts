import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { getCopyrightNoticePrivateAggregate } from '@services/copyright-notices'
import { createCopyrightReplayFixture } from '@services/copyright-notices/route-replay-fixture-setup'
import { exhaustCopyrightActionIntent } from '@services/copyright-notices/route-replay-fixtures'

type TimelineEvent = { event_type: string }

const internalEventTypes = [
  'guest_capability_issued',
  'guest_capability_revoked',
  'copyright_action_replayed',
  'supplement_received',
]

function eventTypes(body: { copyright_notice: { timeline: TimelineEvent[] } }): string[] {
  return body.copyright_notice.timeline.map(event => event.event_type)
}

describe('copyright case timeline audiences', () => {
  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.stubEnv('MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID', 'test-distribution')
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_REGION', 'us-east-1')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', 'test-media-delivery-registry')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('gives each audience only its own events while staff keep the full timeline', async () => {
    const fixture = await createCopyrightReplayFixture()
    const staff = createRequest()
    await staff.authenticateAs(fixture.moderator)
    await exhaustCopyrightActionIntent(fixture.intentId)
    await staff
      .post(
        `/api/v1/copyright-notices/${fixture.noticeId}/action-intents/${fixture.intentId}/replays`,
      )
      .expect(200)
    const capability = (
      await staff
        .post(`/api/v1/copyright-notices/${fixture.noticeId}/guest-capabilities`)
        .send({ expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
        .expect(201)
    ).body.copyright_guest_capability
    for (const kind of ['supplement', 'court_or_ccb_hold']) {
      await createRequest()
        .post(`/api/v1/copyright-notices/${fixture.noticeId}/guest-filings`)
        .set('Copyright-Guest-Capability', capability.token)
        .send({ kind, statement: `A ${kind} filing.` })
        .expect(201)
    }
    await staff
      .post(
        `/api/v1/copyright-notices/${fixture.noticeId}/guest-capabilities/${capability.id}/revocation`,
      )
      .expect(200)
    const recorded = (await getCopyrightNoticePrivateAggregate(fixture.noticeId))?.lifecycleEvents
    expect(recorded?.map(event => event.event_type)).toEqual(
      expect.arrayContaining([...internalEventTypes, 'court_or_ccb_hold_received']),
    )

    const member = createRequest()
    await member.authenticateAs(await createTestUser())
    const memberTypes = eventTypes(
      (await member.get(`/api/v1/copyright-notices/${fixture.noticeId}`).expect(200)).body,
    )
    expect(memberTypes).toEqual(
      expect.arrayContaining(['notice_received', 'provisional_restriction_imposed']),
    )
    for (const internal of [...internalEventTypes, 'court_or_ccb_hold_received']) {
      expect(memberTypes).not.toContain(internal)
    }
    const staffOnMemberRoute = eventTypes(
      (await staff.get(`/api/v1/copyright-notices/${fixture.noticeId}`).expect(200)).body,
    )
    expect(staffOnMemberRoute).toEqual(memberTypes)

    const claimant = createRequest()
    await claimant.authenticateAs(fixture.claimant)
    const claimantResponse = await claimant
      .get(`/api/v1/copyright-notices/${fixture.noticeId}/participant`)
      .expect(200)
    const participantTypes = eventTypes(claimantResponse.body)
    expect(claimantResponse.body.copyright_notice.viewer_role).toBe('claimant')
    expect(participantTypes).toEqual(
      expect.arrayContaining([...memberTypes, 'court_or_ccb_hold_received']),
    )
    for (const internal of internalEventTypes) expect(participantTypes).not.toContain(internal)

    const staffResponse = await staff
      .get(`/api/v1/copyright-notices/${fixture.noticeId}/participant`)
      .expect(200)
    expect(staffResponse.body.copyright_notice.viewer_role).toBe('staff')
    expect(eventTypes(staffResponse.body)).toEqual(
      expect.arrayContaining([...internalEventTypes, 'court_or_ccb_hold_received']),
    )
    expect(eventTypes(staffResponse.body)).toHaveLength(recorded?.length ?? -1)
  })
})
