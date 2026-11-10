import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser, insertTestImage, insertTestPost } from '@voucha/test-helpers'
import {
  commitTestImageCapacityBatch,
  conflictTestImageCapacityBatch,
  readTestCapacityBatch,
  failTestImageCapacitySettlement,
  replayTestImageCapacityBatch,
  refuseTestImageCapacityReplacement,
} from '@voucha/test-helpers/image-capacity-batch'
import { moveTestImageCapacitySlot } from '@voucha/test-helpers/image-placement-capacity'
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
  it('allocates each image independently through sparse slots in one atomic batch', async () => {
    await mediaDeliverySafetyWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
        max_placements_per_image: 2,
      }),
    )
    const { imageIds, post } = await fixture()
    const original = await commitTestImageCapacityBatch(await post(), imageIds)
    await Promise.all(original.map(row => moveTestImageCapacitySlot(row.placementId, 2)))
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
      imageIds.flatMap(imageId => [
        { image_id: imageId, slot_number: 1 },
        { image_id: imageId, slot_number: 2 },
      ]),
    )
  })

  it('restores an outgoing image slot when another incoming image is already full', async () => {
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
    expect(result.slots).toEqual([1])
    expect(await readTestCapacityBatch(imageIds)).toEqual(
      imageIds.map(imageId => ({ image_id: imageId, slot_number: 1 })),
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

  it('rolls back every image when a concurrent winner consumes one image final slot', async () => {
    await mediaDeliverySafetyWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
        max_placements_per_image: 1,
      }),
    )
    const { imageIds, post } = await fixture()
    const outcome = await conflictTestImageCapacityBatch(await post(), await post(), imageIds)
    expect(outcome.error).toMatchObject({ status: 409, code: 'IMAGE_PLACEMENT_LIMIT_REACHED' })
    expect(outcome.rows).toEqual([{ image_id: imageIds[1], slot_number: 1 }])
    expect(await readTestCapacityBatch(imageIds)).toEqual(outcome.rows)
  })
})
