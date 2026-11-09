import { IMAGE_PLACEMENT_LIMIT_REACHED } from '@modules/on-error/error-codes'

export type ImagePlacementCapacityReservation = {
  placementId: string
  imageId: string
  bindingFamily: 'post' | 'surface'
  activationRevision: number
  postId?: string
}

/** A concrete reservation changed before its conditional mutation could settle. */
export class ImagePlacementCapacityConflictError extends Error {
  readonly status = 409
  readonly code = IMAGE_PLACEMENT_LIMIT_REACHED

  constructor() {
    super('Concurrent image placement change')
  }
}
