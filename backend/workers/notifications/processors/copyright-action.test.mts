import { describe, expect, it } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { processApplyCopyrightAction } from './copyright-action.mts'

describe('copyright action delivery', () => {
  it('applies the owned withhold intent named by the job payload', async () => {
    installTestMediaDeliveryEdge()
    const fixture = await createTestCopyrightImageFixture('post-image')
    const { withholdIntentId } = await createTestCopyrightRestrictionForImage(fixture)

    await expect(processApplyCopyrightAction({ intentId: withholdIntentId })).resolves.toBe(
      'applied',
    )
    expect(await getImagePlacementForCopyright(fixture.placementId)).toMatchObject({
      withheld: true,
      imageId: fixture.imageId,
    })
  })

  it('leaves an unknown action intent unclaimed', async () => {
    await expect(
      processApplyCopyrightAction({ intentId: '00000000-0000-7000-8000-000000000001' }),
    ).resolves.toBe('not_claimed')
  })
})
