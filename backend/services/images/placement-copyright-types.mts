export type CopyrightImagePlacement = {
  placementId: string
  revision: number
  imageId: string
  deleted: boolean
  withheld: boolean
  safetyBlocked: boolean
}

export type CopyrightImagePlacementRow = {
  placement_id: string
  revision: number
  image_id: string
  retired_at: Date | null
  copyright_withheld_at: Date | null
  image_deleted_at: Date | null
  host_live: boolean
  image_quarantine_pending_at: Date | null
  image_moderation_flagged: boolean | null
}

export function toCopyrightImagePlacement(
  placement: CopyrightImagePlacementRow,
): CopyrightImagePlacement {
  return {
    placementId: placement.placement_id,
    revision: placement.revision,
    imageId: placement.image_id,
    deleted:
      placement.retired_at !== null ||
      placement.image_deleted_at !== null ||
      !placement.host_live ||
      placement.image_quarantine_pending_at !== null ||
      placement.image_moderation_flagged === true,
    withheld: placement.copyright_withheld_at !== null,
    safetyBlocked:
      placement.image_quarantine_pending_at !== null || placement.image_moderation_flagged === true,
  }
}
