import type { ImagePlacementTuple } from '@services/media-delivery-safety'
import type { ProfileLinkType } from './profile-links-input.mts'

export type ProfileLink = {
  id: string
  user_id: string
  link_type: ProfileLinkType
  sort_order: number
  url_id: string | null
  url: string | null
  handle: string | null
  name: string | null
  image_id: string | null
  image_placement?: ImagePlacementTuple | null
  created_at: Date
  updated_at: Date
}
