import type { MediaDeliveryRegistryState } from '@modules/aws/media-delivery-registry'

export type ImageDeliveryRecord = {
  delivery_key: string
  desired_state: MediaDeliveryRegistryState
  placement_id: string
  placement_revision: number
  image_id: string
  generation: string
}

export type MediaDeliveryDependencies = {
  putMediaDeliveryRegistryRecord: (input: {
    deliveryKey: string
    state: MediaDeliveryRegistryState
    generation: string
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

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const IMAGE_PLACEMENT_KEY = new RegExp(`^image-placement:(${UUID}):(0|[1-9][0-9]*):(${UUID})$`)

/** Only canonical immutable placement URL identities may enter authority recovery. */
export function parseImagePlacementDeliveryKey(deliveryKey: string): {
  placementId: string
  revision: number
  imageId: string
} {
  const match = IMAGE_PLACEMENT_KEY.exec(deliveryKey)
  const revision = Number(match?.[2])
  if (
    !match ||
    match[0] !== deliveryKey ||
    !Number.isSafeInteger(revision) ||
    revision > 2147483647
  )
    throw new Error('Invalid image placement delivery key')
  return { placementId: match[1]!, revision, imageId: match[3]! }
}

export function getMediaDeliveryPath(record: ImageDeliveryRecord): string {
  return `/images/placements/${record.placement_id}/${record.placement_revision}/${record.image_id}`
}
