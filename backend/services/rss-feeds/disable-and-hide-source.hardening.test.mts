import { readTestImageCapacitySlots } from '@voucha/test-helpers/image-placement-capacity'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  insertTestRssFeedDirect,
  insertTestImage,
  setTestTopicSurfaceImages,
  getTestImageSurfacePlacements,
} from '@voucha/test-helpers'
import { runTestRssFeedHideLockRace } from '@voucha/test-helpers/rss-feed-hide-lock-race'
import { upsertUrlHostnames } from '../urls-hostnames/upsert.mts'
import { addUrl } from '../urls/upsert.mts'
import { addAdditionalHostname } from '../topics/additional-hostnames.mts'
import { getTopicByAny } from '../topics/get.mts'
import { getEntityRelationMetadataOrThrow } from '../entity-relations/metadata.mts'
import { writeEntityRelations } from '../entity-relations/write-relations.mts'
import { queryRssFeedBaseState } from '@voucha/test-helpers/data-stores/psql/views/view-rss-feed-current-states'
import { disableAndHideSource } from './disable-and-hide-source.mts'

const landing = getEntityRelationMetadataOrThrow({
  subjectType: 'topic',
  objectType: 'url',
  predicate: 'landing_page',
})

describe('source hide releases all hostname ownership', () => {
  it('retires both source images and releases their concrete reservations before commit', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user: admin, topic_type: 'rss_feed' })
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    const imageId = await insertTestImage(admin.id)
    await setTestTopicSurfaceImages(topic.id, { logoImageId: imageId, heroImageId: imageId })
    const prior = await getTestImageSurfacePlacements({ topicId: topic.id })
    expect(prior).toHaveLength(2)
    const edge = installTestMediaDeliveryEdge()
    await disableAndHideSource(feed.id)
    expect(await getTopicByAny(topic.id)).toBeNull()
    expect(await readTestImageCapacitySlots(imageId)).toEqual([])
    const retired = await getTestImageSurfacePlacements({ topicId: topic.id })
    expect(
      retired.every(row => row.retired_at !== null && row.retirement_reason === 'owner_removed'),
    ).toBe(true)
    for (const placement of prior)
      expect(edge.put).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryKey: `image-placement:${placement.placement_id}:${placement.placement_revision}:${imageId}`,
          state: 'withheld',
        }),
      )
  })

  it.each(['additional', 'landing', 'additional-ancestor', 'landing-ancestor'] as const)(
    'hides the source after a freshly discovered %s hostname is attached',
    async kind => {
      const admin = await createTestUser({ administrator: true })
      const topic = await createTestTopic({ user: admin, topic_type: 'rss_feed' })
      const feed = await insertTestRssFeedDirect({ topicId: topic.id })
      const parent = `hide-scope-${crypto.randomUUID()}.test`
      await upsertUrlHostnames(admin.id, [parent])
      const child = `blog.${parent}`
      const url = (await addUrl(admin.id, `https://${child}/`))!
      await using owner = await beginTransaction()
      if (kind.startsWith('additional'))
        await addAdditionalHostname(topic.id, child, admin.id, { query: owner })
      else
        await writeEntityRelations(landing, admin, [{ subject: topic, object: { id: url.id } }], {
          skipBlockedHostnameGuard: true,
        })
      await runTestRssFeedHideLockRace({
        owner,
        hide: query => disableAndHideSource(feed.id, { query }),
      })
      expect(await getTopicByAny(topic.id)).toBeNull()
      expect(await queryRssFeedBaseState(feed.id)).toMatchObject({ is_enabled: false })
    },
  )
})
