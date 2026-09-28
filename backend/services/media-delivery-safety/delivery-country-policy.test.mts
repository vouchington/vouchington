import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { markImageModerationFlagged } from '@voucha/test-helpers/entities/images'
import { getTestMediaDeliveryRecord } from '@voucha/test-helpers/entities/image-surface-placements'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import {
  imposeTestCopyrightGround,
  liftTestCopyrightRestriction,
  readTestDeniedCountryCodes,
} from '@voucha/test-helpers/copyright-country-grounds'
import { processMediaDeliveryRegistryRecord, stageImagePlacementDeliveryRecord } from './index.mts'

describe('country-scoped copyright delivery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('publishes an unrestricted allow when no country ground exists', async () => {
    const fixture = await createCountryDeliveryPost()
    const edge = installTestMediaDeliveryEdge()
    await processMediaDeliveryRegistryRecord(fixture.deliveryKey)
    expect(edge.records.get(fixture.deliveryKey)).toMatchObject({
      state: 'allow',
      deniedCountryCodes: [],
    })
    await expect(readTestDeniedCountryCodes(fixture.deliveryKey)).resolves.toEqual([])
  })

  it('unions country grounds from different cases and shrinks the set when one is lifted', async () => {
    const fixture = await createCountryDeliveryPost()
    const edge = installTestMediaDeliveryEdge()
    const germany = await imposeTestCopyrightGround({
      ...fixture.tuple,
      assessedById: fixture.userId,
      applicability: { scope: 'countries', countryCodes: ['DE'] },
    })
    await imposeTestCopyrightGround({
      ...fixture.tuple,
      assessedById: fixture.userId,
      applicability: { scope: 'countries', countryCodes: ['FR'] },
    })
    await stageImagePlacementDeliveryRecord({ ...fixture.tuple, state: 'allow' })
    await processMediaDeliveryRegistryRecord(fixture.deliveryKey)
    const published = edge.records.get(fixture.deliveryKey)
    expect(published).toMatchObject({ state: 'allow', deniedCountryCodes: ['DE', 'FR'] })
    const generation = published?.generation
    if (!generation) throw new Error('missing published generation')

    await liftTestCopyrightRestriction(germany.restrictionId)
    await stageImagePlacementDeliveryRecord({ ...fixture.tuple, state: 'allow' })
    await processMediaDeliveryRegistryRecord(fixture.deliveryKey)
    const reduced = edge.records.get(fixture.deliveryKey)
    expect(reduced).toMatchObject({ state: 'allow', deniedCountryCodes: ['FR'] })
    expect(BigInt(reduced?.generation ?? '0')).toBeGreaterThan(BigInt(generation))
    await expect(readTestDeniedCountryCodes(fixture.deliveryKey)).resolves.toEqual(['FR'])
  })

  it('keeps a global safety denial ahead of a country ground', async () => {
    const fixture = await createCountryDeliveryPost()
    const edge = installTestMediaDeliveryEdge()
    await imposeTestCopyrightGround({
      ...fixture.tuple,
      assessedById: fixture.userId,
      applicability: { scope: 'countries', countryCodes: ['DE'] },
    })
    await markImageModerationFlagged(fixture.tuple.imageId)
    await stageImagePlacementDeliveryRecord(
      { ...fixture.tuple, state: 'allow' },
      { forceGeneration: true },
    )
    await processMediaDeliveryRegistryRecord(fixture.deliveryKey)
    expect(edge.records.get(fixture.deliveryKey)).toMatchObject({
      state: 'withheld',
      deniedCountryCodes: [],
    })
    const record = await getTestMediaDeliveryRecord(fixture.deliveryKey)
    expect(record).toMatchObject({ desired_state: 'withheld', state: 'completed' })
    await expect(readTestDeniedCountryCodes(fixture.deliveryKey)).resolves.toEqual([])
  })

  it('treats a global copyright ground as a worldwide denial', async () => {
    const fixture = await createCountryDeliveryPost()
    const edge = installTestMediaDeliveryEdge()
    await imposeTestCopyrightGround({
      ...fixture.tuple,
      assessedById: fixture.userId,
      applicability: { scope: 'global' },
    })
    await stageImagePlacementDeliveryRecord({ ...fixture.tuple, state: 'allow' })
    await processMediaDeliveryRegistryRecord(fixture.deliveryKey)
    expect(edge.records.get(fixture.deliveryKey)).toMatchObject({
      state: 'withheld',
      deniedCountryCodes: [],
    })
  })
})

async function createCountryDeliveryPost() {
  const user = await createTestUserDirect()
  const [postId, imageId] = await Promise.all([
    insertTestPost({
      title: `country delivery ${crypto.randomUUID()}`,
      slug: `country-delivery-${crypto.randomUUID()}`,
      createdById: user.id,
      markdown: 'image',
    }),
    insertTestImage(user.id),
  ])
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('post placement disappeared')
  const tuple = {
    placementId: placement.placement_id,
    revision: placement.placement_revision,
    imageId,
  }
  const staged = await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' })
  return { tuple, userId: user.id, deliveryKey: staged.deliveryKey }
}
