import { describe, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  archiveTestCommunity,
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestCommunityMember,
  insertTestTopic,
} from '@voucha/test-helpers'

describe('community list item archived writes', () => {
  it('returns 409 when adding topic to archived community', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await createArchivedListCommunity(owner.id, `list-post-archived-${random}`)
    const topicId = await insertTestTopic({
      name: `Archived Post Topic ${random}`,
      slug: `archived-post-topic-${random}`,
      createdById: owner.id,
    })

    const request = createRequest()
    await request.authenticateAs(owner)

    await request
      .post(`/api/v1/communities/${community.slug}/list-items/topics`)
      .set('Content-Type', 'application/json')
      .send({ topic_id: topicId })
      .expect(409)
  })

  it('returns 409 when removing topic from archived community', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await createArchivedListCommunity(owner.id, `list-delete-archived-${random}`)
    const topicId = await insertTestTopic({
      name: `Archived Delete Topic ${random}`,
      slug: `archived-delete-topic-${random}`,
      createdById: owner.id,
    })
    const item = await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'topic',
      entityId: topicId,
    })

    const request = createRequest()
    await request.authenticateAs(owner)

    await request
      .delete(`/api/v1/communities/${community.slug}/list-items/topics/${item.id}`)
      .expect(409)
  })
})

async function createArchivedListCommunity(ownerId: string, slug: string) {
  const community = await insertTestCommunity({ createdById: ownerId, slug })
  await insertTestCommunityMember({
    communityId: community.id,
    userId: ownerId,
    role: 'owner',
  })
  await archiveTestCommunity({ communityId: community.id, archivedById: ownerId })
  return community
}
