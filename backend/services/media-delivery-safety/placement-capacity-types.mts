export type ImagePlacementAdmission = {
  imageId: string
  /** Already-written placement to leave out of the occupancy read. */
  placementId?: string
  /** An activation that is already live. A lower cap does not reject it. */
  alreadyActive?: boolean
}
