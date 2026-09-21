import type { MediaDeliveryRegistryState } from '@modules/aws/media-delivery-registry'

export type ImageDeliveryRecord = {
  delivery_key: string
  desired_state: MediaDeliveryRegistryState
  route_kind: 'placement' | 'legacy-image'
  placement_id: string | null
  placement_revision: number | null
  asset_id: string
  generation: number
}

export type MediaDeliveryDependencies = {
  putMediaDeliveryRegistryRecord: (input: {
    deliveryKey: string
    state: MediaDeliveryRegistryState
    generation: number
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

export function getLegacyImageDeliveryKey(imageId: string): string {
  return `legacy-image:${imageId}`
}

export function getMediaDeliveryPath(record: ImageDeliveryRecord): string {
  if (record.route_kind === 'legacy-image') return `/images/${record.asset_id}`
  if (!record.placement_id || record.placement_revision === null) {
    throw new Error(`Placement delivery record ${record.delivery_key} is missing its exact tuple`)
  }
  return `/images/placements/${record.placement_id}/${record.placement_revision}/${record.asset_id}`
}
