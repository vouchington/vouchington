import type { MediaDeliveryRegistryState } from '@modules/aws/media-delivery-registry'

export type ImageDeliveryRecord = {
  state?: string
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

export function getMediaDeliveryPath(record: ImageDeliveryRecord): string {
  return `/images/placements/${record.placement_id}/${record.placement_revision}/${record.image_id}`
}
