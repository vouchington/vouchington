import { createHash, randomBytes } from 'node:crypto'

import { beforeAll, describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createEntityRelationWithElection,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followRssFeed,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestPost,
  insertTestRssFeedItem,
  insertTestUrl,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { insertContentProvenanceOAuthClient } from '@voucha/test-helpers/data-stores/psql/content-provenance'
import { renameTestOAuthClient } from '@voucha/test-helpers/entities/oauth-client-management'

import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { PrivateUser } from '@services/users/types'

const suffix = randomBytes(6).toString('hex')
const APP_NAME = `Related Route Agent ${suffix}`

let reader: PrivateUser
let feedId: string
let postId: string
let webPostId: string
let communitySlug: string

const expectLabels = (posts: Record<string, Record<string, unknown>>) => {
  expect(posts[postId]!.provenance).toEqual({ via: 'mcp', app_name: APP_NAME })
  expect(posts[postId]).not.toHaveProperty('staff_provenance')
  expect(posts[webPostId]).toBeDefined()
  expect(posts[webPostId]).not.toHaveProperty('provenance')
}

describe('post provenance on routes that embed related or listed posts', () => {
  beforeAll(async () => {
    const [author, admin] = await Promise.all([
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    reader = await createTestUser()
    const clientRowId = await insertContentProvenanceOAuthClient({
      verifiedAt: new Date(),
      verifiedById: admin.id,
    })
    await renameTestOAuthClient(clientRowId, APP_NAME)

    feedId = await createTestRssFeedWithTiming((await createTestTopic()).id)
    await followRssFeed(reader, feedId)
    const hostnameId = await insertTestUrlHostname({ hostname: `related-${suffix}.example.com` })
    const urlId = await insertTestUrl({
      url: `https://related-${suffix}.example.com/article`,
      hostnameId,
    })
    await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `related-provenance-${suffix}`,
      itemData: { title: `Related provenance ${suffix}` },
      contentSha256: createHash('sha256').update(suffix).digest(),
    })

    const seed = (key: string, provenance: ContentProvenance) =>
      insertTestPost({
        title: `Related provenance ${key} ${suffix}`,
        slug: `related-provenance-${key}-${suffix}`,
        createdById: author.id,
        markdown: 'Related provenance route test',
        provenance,
      })
    postId = await seed('mcp', { createdVia: 'mcp', oauthClientId: clientRowId })
    webPostId = await seed('web', { createdVia: 'web', oauthClientId: null })
    await createEntityRelationWithElection(postId, urlId, author.id, 1)
    await createEntityRelationWithElection(webPostId, urlId, author.id, 1)

    communitySlug = `related-provenance-${suffix}`
    const community = await insertTestCommunity({ createdById: author.id, slug: communitySlug })
    for (const entityId of [postId, webPostId]) {
      await insertTestCommunityListItem({ communityId: community.id, itemType: 'post', entityId })
    }
  })

  it('labels related discussions on GET /api/v1/rss-feed-items', async () => {
    const request = createRequest()
    await request.authenticateAs(reader)
    const { body } = await request.get(`/api/v1/rss-feed-items?rss_feeds=${feedId}`).expect(200)
    expectLabels(body.posts)
  })

  it('labels related discussions on GET /api/v1/feeds/rss_feed_items/:feed_type', async () => {
    const request = createRequest()
    await request.authenticateAs(reader)
    const { body } = await request
      .get('/api/v1/feeds/rss_feed_items/follow_rss_feeds?time_range=all')
      .expect(200)
    expectLabels(body.posts)
  })

  it('labels listed posts on GET /api/v1/communities/:idOrSlug/list-items/posts', async () => {
    const { body } = await createRequest()
      .get(`/api/v1/communities/${communitySlug}/list-items/posts`)
      .expect(200)
    expectLabels(body.posts)
  })
})
