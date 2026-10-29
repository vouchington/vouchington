export type CopyrightStaydownMatch = {
  id: string
  image_id: string
  registered_image_id: string
  uploaded_by_id: string
  uploaded_by_username: string | null
  image_placement: { placement_id: string; placement_revision: number } | null
  match_kind: 'exact' | 'perceptual'
  hamming_distance: number
  matched_at: string
}
