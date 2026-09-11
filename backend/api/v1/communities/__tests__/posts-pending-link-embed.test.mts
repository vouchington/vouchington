import { describe, it, expect } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPendingCommunityPostReview,
} from '@voucha/test-helpers'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { addUrl } from '@services/urls/upsert'

describe('GET /api/v1/communities/:slug/posts/pending post_link_embeds sidecar', () => {
  it('includes post_link_embeds keyed by post id for a pending link post', async () => {
    const user = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: user.id,
      slug: `pending-link-embed-${random}`,
      post_approval_required_at: new Date(),
    })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })

    const href = `https://example-pending-${random}.com/article`
    const url = await addUrl(null, href, { content_type: 'text/html', skipCreatedEvents: true })
    const urlId = url!.id

    const postId = await insertTestPost({
      title: `Pending Link Post ${random}`,
      slug: `pending-link-post-${random}`,
      createdById: user.id,
      markdown: '',
      postType: 'link',
      urlId,
      communityId: community.id,
    })

    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user.id,
    })

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .get(`/api/v1/communities/${community.slug}/posts/pending`)
      .expect(200)

    const resultIds = response.body.results.map((r: { id: string }) => r.id)
    expect(resultIds).toContain(postId)
    expect(response.body.post_link_embeds).toBeDefined()
    expect(response.body.post_link_embeds[postId]).toBeDefined()
  })
})
