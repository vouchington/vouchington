export type CopyrightStaydownMatch = {
  id: string
  image_id: string
  registered_image_id: string
  uploaded_by_id: string
  match_kind: 'exact' | 'perceptual'
  hamming_distance: number
  matched_at: string
}
