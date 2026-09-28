import type { MediaDeliveryRegistryState } from '@modules/aws/media-delivery-registry'

export type ImageDeliveryRecord = {
  delivery_key: string
  desired_state: MediaDeliveryRegistryState
  placement_id: string
  placement_revision: number
  image_id: string
  generation: string
  /** Sorted comma-joined denied countries. Empty when the tuple is not country-restricted. */
  denied_country_codes: string
}

export type MediaDeliveryDependencies = {
  putMediaDeliveryRegistryRecord: (input: {
    deliveryKey: string
    state: MediaDeliveryRegistryState
    generation: string
    deniedCountryCodes: readonly string[]
  }) => Promise<void>
  invalidateMediaDeliveryPath: (path: string) => Promise<void>
}

export function getImagePlacementDeliveryKey(input: {
  placementId: string
  revision: number
  imageId: string
}): string {
  return `image-placement:${input.placementId}:${input.revision}:${input.imageId}`
}

export function getMediaDeliveryPath(record: ImageDeliveryRecord): string {
  return `/images/placements/${record.placement_id}/${record.placement_revision}/${record.image_id}`
}
