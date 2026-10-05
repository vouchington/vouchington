import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createRandomString,
  createTestMembership,
  createTestUserWithAge,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

let member: PrivateUser
let staff: PrivateUser
let slug: string

const create = async (user: PrivateUser, clientHeaders: Record<string, string> = {}) => {
  const request = createRequest()
  request.setClientInfo(clientHeaders)
  await request.authenticateAs(user)
  const { body } = await request
    .post(`/api/v1/communities/${slug}/posts`)
    .send({ post_type: 'discussion', title: 'Community echo', markdown: 'Community echo content' })
    .expect(201)
  return body
}

describe('POST /api/v1/communities/:idOrSlug/posts provenance', () => {
  beforeAll(async () => {
    ;[member, staff] = await Promise.all([
      createTestUserWithAge(CONTRIBUTING_USER_AGE_MS),
      createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, { administrator: true }),
    ])
    const community = await insertTestCommunity({
      createdById: member.id,
      slug: `provenance-echo-${createRandomString(8)}`,
    })
    slug = community.slug
    for (const user of [member, staff]) {
      await insertTestCommunityMember({ communityId: community.id, userId: user.id })
      await createTestMembership({ user_id: user.id, plan: 'plus' })
    }
  })

  it('has no label on a post created by the web client, for its author', async () => {
    const body = await create(member)
    expect(body.post).not.toHaveProperty('provenance')
    expect(body.post).not.toHaveProperty('staff_provenance')
    expect(body).toHaveProperty('community_post_review')
  })

  it('gives moderation staff the channel of the post they just created', async () => {
    const web = await create(staff)
    const swift = await create(staff, { 'x-voucha-client': 'swift', 'x-voucha-platform': 'ios' })
    expect(web.post.staff_provenance).toEqual({ created_via: 'web', oauth_client: null })
    expect(swift.post.staff_provenance).toEqual({ created_via: 'swift', oauth_client: null })
    expect(web.post).not.toHaveProperty('provenance')
  })
})
