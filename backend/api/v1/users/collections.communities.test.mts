import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestLocalFollow,
  safeUsername,
} from '@voucha/test-helpers'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { updateUserFields } from '@services/users/update-fields'

describe('GET /api/v1/users/:idOrSlug communities collections', () => {
  it('paginates visible member communities at the exact limit', async () => {
    const owner = await createTestUser({ username: safeUsername('comm-page-owner') })
    if (!owner) throw new Error('Failed to create owner')
    await updateUserFields(owner.id, { community_memberships_visibility: 'everyone' })
    const communities = await Promise.all(
      Array.from({ length: 3 }, () =>
        insertTestCommunity({ createdById: owner.id, visibility: 'public' }),
      ),
    )
    await Promise.all(
      communities.map(community =>
        insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'member' }),
      ),
    )

    const page1 = await createRequest()
      .get(`/api/v1/users/${owner.id}/communities/member?limit=2`)
      .expect(200)
    const page2 = await createRequest()
      .get(
        `/api/v1/users/${owner.id}/communities/member?limit=2&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(page1.body.results).toHaveLength(2)
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page2.body.results).toHaveLength(1)
    expect(new Set([...page1.body.results, ...page2.body.results].map(item => item.id))).toEqual(
      new Set(communities.map(item => item.id)),
    )
  })

  it('rejects a member-community cursor replayed for another user', async () => {
    const owner = await createTestUser({ username: safeUsername('comm-scope-owner') })
    const other = await createTestUser({ username: safeUsername('comm-scope-other') })
    if (!owner || !other) throw new Error('Failed to create users')
    await Promise.all([
      updateUserFields(owner.id, { community_memberships_visibility: 'everyone' }),
      updateUserFields(other.id, { community_memberships_visibility: 'everyone' }),
    ])
    const communities = await Promise.all([
      insertTestCommunity({ createdById: owner.id, visibility: 'public' }),
      insertTestCommunity({ createdById: owner.id, visibility: 'public' }),
    ])
    await Promise.all(
      communities.map(community =>
        insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'member' }),
      ),
    )
    const first = await createRequest()
      .get(`/api/v1/users/${owner.id}/communities/member?limit=1`)
      .expect(200)
    await createRequest()
      .get(
        `/api/v1/users/${other.id}/communities/member?limit=1&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })

  it('returns community member list publicly for everyone visibility', async () => {
    const owner = await createTestUser({ username: safeUsername('comm-member-owner') })
    if (!owner) throw new Error('Failed to create owner')
    await updateUserFields(owner.id, { community_memberships_visibility: 'everyone' })

    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'member',
    })

    const anonResponse = await createRequest()
      .get(`/api/v1/users/${owner.username}/communities/member`)
      .expect(200)
    expect(anonResponse.body.results).toHaveLength(1)
    expect(anonResponse.body.results[0].id).toBe(community.id)
    expect(Object.keys(anonResponse.body.results[0]).sort()).toEqual([
      'allow_data_point_posts',
      'allow_review_posts',
      'archived_at',
      'archived_by_id',
      'banner_image_id',
      'created_at',
      'created_by_id',
      'default_language',
      'deleted_at',
      'deleted_by_id',
      'id',
      'lingua_rs_detected_language',
      'list_type',
      'markdown',
      'member_invites_allowed_at',
      'member_roster_visibility',
      'name',
      'owner',
      'post_approval_required_at',
      'profile_image_id',
      'rules_markdown',
      'slug',
      'trusted_at',
      'updated_at',
      'visibility',
    ])
    expect(anonResponse.headers['cache-control']).toContain('public')
    expect(anonResponse.headers['cache-control']).toContain(
      `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
    )
  })

  it('restricts community member list by visibility=followers (anon→404, follower→200)', async () => {
    const owner = await createTestUser({ username: safeUsername('comm-member-priv') })
    if (!owner) throw new Error('Failed to create owner')
    await updateUserFields(owner.id, { community_memberships_visibility: 'followers' })

    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'member',
    })

    await createRequest().get(`/api/v1/users/${owner.username}/communities/member`).expect(404)

    const follower = await createTestUser({ username: safeUsername('comm-follower') })
    if (!follower) throw new Error('Failed to create follower')
    await insertTestLocalFollow(follower.id, owner.id)

    const followerRequest = createRequest()
    await followerRequest.authenticateAs(follower)
    const followerResponse = await followerRequest
      .get(`/api/v1/users/${owner.username}/communities/member`)
      .expect(200)
    expect(followerResponse.body.results).toHaveLength(1)
    expect(followerResponse.body.results[0].id).toBe(community.id)
  })
})
