import { describe, expect, it } from 'vitest'
import { getLegacyImageDeliveryKey, getMediaDeliveryPath } from './delivery-registry-types.mts'

describe('media delivery registry keys', () => {
  it('builds a legacy image path', () => {
    expect(getLegacyImageDeliveryKey('image-1')).toBe('legacy-image:image-1')
    expect(
      getMediaDeliveryPath({
        delivery_key: 'legacy-image:image-1',
        desired_state: 'withheld',
        route_kind: 'legacy-image',
        placement_id: null,
        placement_revision: null,
        asset_id: 'image-1',
        generation: 1,
      }),
    ).toBe('/images/image-1')
  })

  it('rejects a placement record that lost its exact tuple', () => {
    expect(() =>
      getMediaDeliveryPath({
        delivery_key: 'image-placement:missing',
        desired_state: 'allow',
        route_kind: 'placement',
        placement_id: null,
        placement_revision: null,
        asset_id: 'image-1',
        generation: 1,
      }),
    ).toThrow('Placement delivery record image-placement:missing is missing its exact tuple')
  })
})
