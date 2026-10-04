import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestTopic,
  createRandomString,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicAliases } from '@services/topics/aliases'

describe('GET /api/v1/communities – hashtag topic search', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns no communities when a hashtag is unknown', async () => {
    const request = createRequest()
    const response = await request
      .get('/api/v1/communities?q=%23definitely-unknown-topic-slug-xyzzy')
      .expect(200)

    expect(response.body.results).toEqual([])
  })

  it('filters by ?q=%23known-slug and returns matching community', async () => {
    const rand = createRandomString(8)
    const topicSlug = `ht-topic-${rand}`

    const topicId = await insertTestTopic({
      name: `Hashtag Topic ${rand}`,
      slug: topicSlug,
      createdById: user.id,
    })
    await createTopicAliases(topicId, topicSlug)

    const matchingCommunity = await insertTestCommunity({
      createdById: user.id,
      name: `${rand} Hashtag Match`,
      slug: `${rand}-ht-match`,
    })
    const nonMatchingCommunity = await insertTestCommunity({
      createdById: user.id,
      name: `${rand} Hashtag No Match`,
      slug: `${rand}-ht-no-match`,
    })

    await insertTestCommunityListItem({
      communityId: matchingCommunity.id,
      itemType: 'topic',
      entityId: topicId,
    })

    const request = createRequest()
    const response = await request
      .get(`/api/v1/communities?q=${encodeURIComponent(`#${topicSlug}`)}`)
      .expect(200)

    const ids = response.body.results.map((r: { id: string }) => r.id)
    expect(ids).toContain(matchingCommunity.id)
    expect(ids).not.toContain(nonMatchingCommunity.id)
  })

  it('returns 400 when ?topic param is not a valid UUID', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/communities?topic=not-a-uuid').expect(400)

    expect(response.body).toHaveProperty('message')
  })

  it('filters by ?topic=<uuid> and returns matching community', async () => {
    const rand = createRandomString(8)

    const topicId = await insertTestTopic({
      name: `Topic Param ${rand}`,
      slug: `topic-param-${rand}`,
      createdById: user.id,
    })

    const matchingCommunity = await insertTestCommunity({
      createdById: user.id,
      name: `${rand} Topic Param Match`,
      slug: `${rand}-tp-match`,
    })
    const nonMatchingCommunity = await insertTestCommunity({
      createdById: user.id,
      name: `${rand} Topic Param No Match`,
      slug: `${rand}-tp-no-match`,
    })

    await insertTestCommunityListItem({
      communityId: matchingCommunity.id,
      itemType: 'topic',
      entityId: topicId,
    })

    const request = createRequest()
    const response = await request.get(`/api/v1/communities?topic=${topicId}`).expect(200)

    const ids = response.body.results.map((r: { id: string }) => r.id)
    expect(ids).toContain(matchingCommunity.id)
    expect(ids).not.toContain(nonMatchingCommunity.id)
  })

  it('filters by comma-separated topic UUIDs', async () => {
    const rand = createRandomString(8)
    const topicIds = await Promise.all(
      ['one', 'two'].map(suffix =>
        insertTestTopic({
          name: `CSV Topic ${suffix} ${rand}`,
          slug: `csv-topic-${suffix}-${rand}`,
          createdById: user.id,
        }),
      ),
    )
    const community = await insertTestCommunity({
      createdById: user.id,
      name: `CSV Topic Match ${rand}`,
      slug: `csv-topic-match-${rand}`,
    })
    await Promise.all(
      topicIds.map(topicId =>
        insertTestCommunityListItem({
          communityId: community.id,
          itemType: 'topic',
          entityId: topicId,
        }),
      ),
    )

    const response = await createRequest()
      .get(`/api/v1/communities?topic=${topicIds.join(',')}`)
      .expect(200)
    const resultIds = response.body.results.map((result: { id: string }) => result.id)
    expect(resultIds).toContain(community.id)
  })

  it('returns 400 for an empty member in a comma-separated topic list', async () => {
    const response = await createRequest().get('/api/v1/communities?topic=,').expect(400)
    expect(response.body.message).toBe('Invalid topic UUID format')
  })
})
