import { randomUUID } from 'node:crypto'

import { describe, it, expect } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { addUrl } from '@services/urls/upsert'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/posts post_link_embeds sidecar', () => {
  it('omits post_link_embeds when no result has a URL embed', async () => {
    const user = (await createTestUser()) as PrivateUser
    const suffix = randomUUID().replaceAll('-', '').slice(0, 8)
    const postId = await insertTestPost({
      title: `Post Without Embed ${suffix}`,
      slug: `post-without-embed-${suffix}`,
      createdById: user.id,
      markdown: 'No link URL',
      postType: 'discussion',
    })

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .get(`/api/v1/posts?creator=${user.id}&post_types=discussion`)
      .expect(200)

    expect(response.body.results.map((result: { id: string }) => result.id)).toContain(postId)
    expect(response.body).not.toHaveProperty('post_link_embeds')
  })

  it('includes post_link_embeds keyed by post id when a link post is in results', async () => {
    const user = (await createTestUser()) as PrivateUser
    const suffix = randomUUID().replaceAll('-', '').slice(0, 8)
    const href = `https://example-${suffix}.com/article`
    const url = await addUrl(null, href, { content_type: 'text/html', skipCreatedEvents: true })
    const urlId = url!.id
    const postId = await insertTestPost({
      title: `Link Post Embed Test ${suffix}`,
      slug: `link-post-embed-test-${suffix}`,
      createdById: user.id,
      markdown: '',
      postType: 'link',
      urlId,
    })

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get(`/api/v1/posts?creator=${user.id}`).expect(200)

    const resultIds = response.body.results.map((r: { id: string }) => r.id)
    expect(resultIds).toContain(postId)
    expect(response.body.post_link_embeds).toBeDefined()
    expect(response.body.post_link_embeds[postId]).toBeDefined()
  })
})
