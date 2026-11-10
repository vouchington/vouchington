import '@voucha/test-helpers/topic-image-guard-registrations'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser, insertTestImage, insertTestTopic } from '@voucha/test-helpers'
import { withTestTopicImageCapacityRetry } from '@voucha/test-helpers/topic-image-capacity-retry'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { readTestImageCapacitySlots } from '@voucha/test-helpers/image-placement-capacity'
import { mediaDeliverySafetyWorkConfig } from '@services/media-delivery-safety/work-limits'
import { getTopicByAny } from './get.mts'
import { updateTopic } from './update.mts'

describe('topic image capacity retry', () => {
  it('rebuilds its owner update after a retryable slot conflict and commits the desired image', async () => {
    await mediaDeliverySafetyWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
        placement_reservation_attempts: 2,
      }),
    )
    const user = await createTestUser({ administrator: true })
    const imageId = await insertTestImage(user.id)
    const suffix = crypto.randomUUID()
    const topicId = await insertTestTopic({
      name: `Image retry ${suffix}`,
      slug: `image-retry-${suffix}`,
      createdById: user.id,
    })
    const topic = await getTopicByAny(topicId, { readOnly: false })
    if (!topic) throw new Error('Missing owned topic')
    const { result, failures } = await withTestTopicImageCapacityRetry(imageId, () =>
      updateTopic(user, topic, { logo_image_id: imageId }),
    )
    expect(result).toMatchObject({ logo_image_id: imageId })
    expect(failures).toBe(1)
    expect(await getTopicByAny(topicId, { readOnly: false })).toMatchObject({
      logo_image_id: imageId,
    })
    expect(await readTestImageCapacitySlots(imageId)).toEqual([1])
  })
})
