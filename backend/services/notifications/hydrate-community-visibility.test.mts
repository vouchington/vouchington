import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createApplication } from '../communities/applications/create.mts'
import { rejectApplication } from '../communities/applications/review.mts'
import type { PrivateUser } from '@services/users/types'
import { hydrateNotifications } from './hydrate-notifications.mts'

type Source = Parameters<typeof hydrateNotifications>[1][number]

function source(userId: string, overrides: Partial<Source>): Source {
  return {
    kind: 'community_application_rejected',
    user_id: userId,
    post_id: null,
    top_post_id: null,
    rss_feed_item_id: null,
    actor_user_id: null,
    sent_by_id: null,
    community_id: null,
    copyright_notice_id: null,
    review_dispute_id: null,
    moderation_appeal_id: null,
    user_warning_id: null,
    community_application_id: null,
    copyright_notice_delivery_work_item_id: null,
    ...overrides,
  } as Source
}

describe('hydrating private community names', () => {
  let owner: PrivateUser
  beforeAll(async () => {
    owner = await createTestUser()
  })

  async function privateCommunity() {
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    return community
  }

  it('shows the name on the applicant own decision notice only', async () => {
    const applicant = await createTestUser()
    const stranger = await createTestUser()
    const community = await privateCommunity()
    const application = await createApplication(applicant.id, WEB_PROVENANCE, community.id, {})
    await rejectApplication(owner, application.id, 'not a fit')

    const decision = source(applicant.id, {
      community_id: community.id,
      community_application_id: application.id,
    })
    expect(
      (await hydrateNotifications(applicant.id, [decision])).communities[community.id]?.name,
    ).toBe(community.name)
    expect(
      (await hydrateNotifications(stranger.id, [{ ...decision, user_id: stranger.id }]))
        .communities,
    ).toEqual({})
  })

  it('hides the name on other kinds and for an undecided application', async () => {
    const applicant = await createTestUser()
    const community = await privateCommunity()
    const application = await createApplication(applicant.id, WEB_PROVENANCE, community.id, {})

    const pendingDecision = source(applicant.id, {
      community_id: community.id,
      community_application_id: application.id,
    })
    expect((await hydrateNotifications(applicant.id, [pendingDecision])).communities).toEqual({})

    await rejectApplication(owner, application.id, 'not a fit')
    const otherKind = source(applicant.id, {
      kind: 'community_role_changed',
      community_id: community.id,
    })
    expect((await hydrateNotifications(applicant.id, [otherKind])).communities).toEqual({})
  })
})
