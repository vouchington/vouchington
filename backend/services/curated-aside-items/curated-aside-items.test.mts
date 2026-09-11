import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  hardDeleteTestTopic,
  hardDeleteTestUser,
  insertTestCommunity,
  insertTestCuratedAsideItem,
  insertTestRssFeed,
  insertTestTopic,
  softDeleteTopic,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { updateRssFeedById } from '@services/rss-feeds/update'
import { listCuratedItems } from './list.mts'
import { createCuratedItem } from './create.mts'
import { deleteCuratedItem } from './delete.mts'
import { reorderCuratedItems } from './reorder.mts'

async function createAdminAndTopic(): Promise<{ admin: PrivateUser; topicId: string }> {
  const admin = await createTestUser({ administrator: true })
  const random = Math.random().toString(36).slice(2, 10)
  const topicId = await insertTestTopic({
    name: `Curated Topic ${random}`,
    slug: `curated-topic-${random}`,
    createdById: admin.id,
  })
  return { admin, topicId }
}

describe('curated-aside-items service', () => {
  it('listCuratedItems returns an array for supported aside types', async () => {
    const result = await listCuratedItems('topic')
    expect(Array.isArray(result)).toBe(true)
  })

  it('createCuratedItem throws 403 for non-admin user', async () => {
    const user = await createTestUser()
    const { topicId } = await createAdminAndTopic()

    await expect(createCuratedItem(user, 'topic', topicId, 0)).rejects.toThrow('Forbidden')
  })

  it('createCuratedItem creates an item for admin user', async () => {
    const { admin, topicId } = await createAdminAndTopic()

    const item = await createCuratedItem(admin, 'topic', topicId, 0)
    expect(item.id).toBeTruthy()
    expect(item.aside_type).toBe('topic')
    expect(item.entity_id).toBe(topicId)
    expect(item.position).toBe(0)
    expect(item.entity_data).toMatchObject({
      entity_type: 'topic',
      id: topicId,
    })
  })

  it('preserves curated items when their creator is deleted', async () => {
    const { topicId } = await createAdminAndTopic()
    const curator = await createTestUser({ administrator: true })
    const item = await createCuratedItem(curator, 'topic', topicId, 27000)

    await hardDeleteTestUser(curator.id)

    const items = await listCuratedItems('topic')
    expect(items.find(candidate => candidate.id === item.id)).toMatchObject({
      created_by_id: null,
      entity_id: topicId,
    })
  })

  it('removes curated items when their target entity is deleted', async () => {
    const { admin, topicId } = await createAdminAndTopic()
    const item = await createCuratedItem(admin, 'topic', topicId, 27000)

    await hardDeleteTestTopic(topicId)

    const items = await listCuratedItems('topic')
    expect(items.find(candidate => candidate.id === item.id)).toBeUndefined()
  })

  it('createCuratedItem appends when position is omitted', async () => {
    const { admin, topicId } = await createAdminAndTopic()

    const item = await createCuratedItem(admin, 'topic', topicId)
    expect(item.position).toBeGreaterThanOrEqual(0)
  })

  it('createCuratedItem rejects appended positions beyond the smallint maximum', async () => {
    const { admin, topicId: firstTopicId } = await createAdminAndTopic()
    const random = Math.random().toString(36).slice(2, 10)
    const secondTopicId = await insertTestTopic({
      name: `Curated Topic Overflow ${random}`,
      slug: `curated-topic-overflow-${random}`,
      createdById: admin.id,
    })
    const maxItem = await createCuratedItem(admin, 'topic', firstTopicId, 32767)

    try {
      await expect(createCuratedItem(admin, 'topic', secondTopicId)).rejects.toThrow(
        'No curated aside positions are available',
      )
    } finally {
      await deleteCuratedItem(admin, maxItem.id)
    }
  })

  it('createCuratedItem rejects entity ids that do not match the aside type', async () => {
    const { admin, topicId } = await createAdminAndTopic()

    await expect(createCuratedItem(admin, 'community', topicId, 0)).rejects.toThrow(
      'community entity not found',
    )
  })

  it('createCuratedItem rejects private communities', async () => {
    const { admin } = await createAdminAndTopic()
    const community = await insertTestCommunity({
      createdById: admin.id,
      name: 'Private Curated Community',
      slug: `private-curated-community-${Math.random().toString(36).slice(2, 10)}`,
      visibility: 'private',
    })

    await expect(createCuratedItem(admin, 'community', community.id, 0)).rejects.toThrow(
      'community entity not found',
    )
  })

  it('hydrates source and community entity data', async () => {
    const { admin, topicId } = await createAdminAndTopic()
    const sourceHostname = `curated-source-${Math.random().toString(36).slice(2, 10)}.example.test`
    const sourceId = await insertTestRssFeed({
      topicId,
      homePageUrl: `https://${sourceHostname}/home`,
      title: 'Curated Source',
    })
    const community = await insertTestCommunity({
      createdById: admin.id,
      name: 'Curated Community',
      slug: `curated-community-${Math.random().toString(36).slice(2, 10)}`,
    })

    const source = await createCuratedItem(admin, 'source', sourceId)
    const communityItem = await createCuratedItem(admin, 'community', community.id)

    expect(source.entity_data).toMatchObject({
      entity_type: 'source',
      home_page_url: `https://${sourceHostname}/`,
      id: sourceId,
      title: 'Curated Source',
    })
    expect(communityItem.entity_data).toMatchObject({
      entity_type: 'community',
      id: community.id,
      name: 'Curated Community',
    })

    const sourceItems = await listCuratedItems('source')
    expect(sourceItems.find(i => i.id === source.id)?.entity_data).toMatchObject({
      entity_type: 'source',
      home_page_url: `https://${sourceHostname}/`,
      id: sourceId,
    })
  })

  it('listCuratedItems marks sources unresolved when their topic is inactive', async () => {
    const { admin, topicId } = await createAdminAndTopic()
    const sourceId = await insertTestRssFeed({
      topicId,
      title: 'Inactive Topic Source',
    })
    const item = await createCuratedItem(admin, 'source', sourceId, 27000)
    await softDeleteTopic(topicId, admin.id)

    const items = await listCuratedItems('source')
    expect(items.find(i => i.id === item.id)?.entity_data).toBeNull()
  })

  it('createCuratedItem rejects disabled sources', async () => {
    const { admin, topicId } = await createAdminAndTopic()
    const sourceId = await insertTestRssFeed({
      topicId,
      title: 'Disabled Curated Source',
    })
    await updateRssFeedById(sourceId, { enabled: false })

    await expect(createCuratedItem(admin, 'source', sourceId, 27000)).rejects.toThrow(
      'source entity not found',
    )
  })

  it('listCuratedItems marks disabled sources unresolved', async () => {
    const { admin, topicId } = await createAdminAndTopic()
    const sourceId = await insertTestRssFeed({
      topicId,
      title: 'Later Disabled Source',
    })
    const item = await createCuratedItem(admin, 'source', sourceId, 27000)
    await updateRssFeedById(sourceId, { enabled: false })

    const items = await listCuratedItems('source')
    expect(items.find(i => i.id === item.id)?.entity_data).toBeNull()
  })

  it('listCuratedItems marks private communities unresolved', async () => {
    const { admin } = await createAdminAndTopic()
    const community = await insertTestCommunity({
      createdById: admin.id,
      name: 'Private Listed Community',
      slug: `private-listed-community-${Math.random().toString(36).slice(2, 10)}`,
      visibility: 'private',
    })
    const item = await insertTestCuratedAsideItem({
      asideType: 'community',
      entityId: community.id,
      position: 27000,
      createdById: admin.id,
    })

    const items = await listCuratedItems('community')
    expect(items.find(i => i.id === item.id)?.entity_data).toBeNull()
  })

  it('listCuratedItems returns items ordered by position', async () => {
    const { admin, topicId: topicId1 } = await createAdminAndTopic()
    const random2 = Math.random().toString(36).slice(2, 10)
    const topicId2 = await insertTestTopic({
      name: `Curated Topic 2 ${random2}`,
      slug: `curated-topic-2-${random2}`,
      createdById: admin.id,
    })

    await createCuratedItem(admin, 'topic', topicId1, 30000)
    await createCuratedItem(admin, 'topic', topicId2, 29999)

    const items = (await listCuratedItems('topic')).filter(item =>
      [topicId1, topicId2].includes(item.entity_id),
    )
    const ids = items.map(i => i.entity_id)
    expect(ids.indexOf(topicId2)).toBeLessThan(ids.indexOf(topicId1))
  })

  it('deleteCuratedItem soft-deletes an item', async () => {
    const { admin, topicId } = await createAdminAndTopic()

    const item = await createCuratedItem(admin, 'topic', topicId, 0)
    await deleteCuratedItem(admin, item.id)

    const items = await listCuratedItems('topic')
    expect(items.find(i => i.id === item.id)).toBeUndefined()
  })

  it('deleteCuratedItem throws 403 for non-admin', async () => {
    const user = await createTestUser()
    await expect(deleteCuratedItem(user, 'some-id')).rejects.toThrow('Forbidden')
  })

  it('reorderCuratedItems updates position order', async () => {
    const { admin, topicId: topicId1 } = await createAdminAndTopic()
    const random2 = Math.random().toString(36).slice(2, 10)
    const topicId2 = await insertTestTopic({
      name: `Curated Topic R2 ${random2}`,
      slug: `curated-topic-r2-${random2}`,
      createdById: admin.id,
    })

    const item1 = await createCuratedItem(admin, 'topic', topicId1, 0)
    const item2 = await createCuratedItem(admin, 'topic', topicId2, 1)

    await reorderCuratedItems(admin, 'topic', [item2.id, item1.id])

    const items = (await listCuratedItems('topic')).filter(item =>
      [item1.id, item2.id].includes(item.id),
    )
    expect(items[0].entity_id).toBe(topicId2)
    expect(items[1].entity_id).toBe(topicId1)
  })

  it('reorderCuratedItems throws 403 for non-admin', async () => {
    const user = await createTestUser()
    await expect(reorderCuratedItems(user, 'topic', [])).rejects.toThrow('Forbidden')
  })
})
