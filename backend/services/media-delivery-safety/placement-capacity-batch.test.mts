import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser, insertTestImage, insertTestPost } from '@voucha/test-helpers'
import {
  commitTestImageCapacityBatch,
  readTestCapacityBatch,
  failTestImageCapacitySettlement,
  replayTestImageCapacityBatch,
  refuseTestImageCapacityReplacement,
} from '@voucha/test-helpers/image-capacity-batch'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { mediaDeliverySafetyWorkConfig } from './work-limits.mts'

async function fixture() {
  const user = await createTestUser()
  const imageIds = (
    await Promise.all([insertTestImage(user.id), insertTestImage(user.id)])
  ).toSorted()
  const post = () =>
    insertTestPost({
      title: 'Multi-image capacity',
      slug: crypto.randomUUID(),
      markdown: '',
      createdById: user.id,
    })
  return { imageIds, post }
}

describe('multi-image capacity claims', () => {
  it('admits each image independently and replays live activations under a lower cap', async () => {
    await mediaDeliverySafetyWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
        max_placements_per_image: 2,
      }),
    )
    const { imageIds, post } = await fixture()
    const original = await commitTestImageCapacityBatch(await post(), imageIds)
    await commitTestImageCapacityBatch(await post(), imageIds.toReversed())
    const restoreLower = overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
      max_placements_per_image: 1,
    })
    try {
      await replayTestImageCapacityBatch(original)
    } finally {
      restoreLower()
    }
    expect(await readTestCapacityBatch(imageIds)).toEqual(
      imageIds.map(imageId => ({ image_id: imageId, occupied: 2 })),
    )
  })

  it('leaves the outgoing placement active when another incoming image is already full', async () => {
    await mediaDeliverySafetyWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
        max_placements_per_image: 1,
      }),
    )
    const { imageIds, post } = await fixture()
    const current = await commitTestImageCapacityBatch(await post(), imageIds)
    const result = await refuseTestImageCapacityReplacement(
      await post(),
      current[0]!.placementId,
      imageIds[1]!,
    )
    expect(result.error).toMatchObject({ status: 409, code: 'IMAGE_PLACEMENT_LIMIT_REACHED' })
    expect(result.active).toBe(true)
    expect(await readTestCapacityBatch(imageIds)).toEqual(
      imageIds.map(imageId => ({ image_id: imageId, occupied: 1 })),
    )
  })

  it('does not retry settlement deadlocks and preserves the retained caller transaction', async () => {
    await mediaDeliverySafetyWorkConfig.waitForInitialization()
    const { imageIds } = await fixture()
    const outcome = await failTestImageCapacitySettlement(imageIds[0]!)
    expect(outcome.error).toBe(outcome.failure)
    expect(outcome.mutations).toBe(1)
    expect(outcome.settlements).toBe(1)
    expect(outcome.restored).toBe(outcome.before)
    expect(outcome.committed).toBe(`${outcome.before}-caller`)
  })
})
