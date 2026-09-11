import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls/upsert'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'

describe('GET /api/v1/communities/:slug/posts link embed sidecar', () => {
  it('includes post_link_embeds keyed by post id when a link post is in the community', async () => {
    const user = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: user.id,
      slug: `link-embed-${random}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id })

    const href = `https://example-embed-${random}.com/article`
    const url = await addUrl(null, href, { content_type: 'text/html', skipCreatedEvents: true })
    const urlId = url!.id

    const postId = await insertTestPost({
      title: `Link Post Embed ${random}`,
      slug: `link-post-embed-${random}`,
      createdById: user.id,
      markdown: '',
      postType: 'link',
      urlId,
      communityId: community.id,
    })

    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user.id,
    })

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get(`/api/v1/communities/${community.slug}/posts`).expect(200)

    expect(response.body.post_link_embeds).toBeDefined()
    expect(response.body.post_link_embeds[postId]).toBeDefined()
  })
})
