export type StoryCategoryWork = {
  story_id: string
  generation: string
  sweep_upper_bound_item_id: string | null
  cursor_item_id: string | null
  active_item_id: string | null
  cursor_category_identity_id: string | null
  source_completed_at: Date | null
  cursor_relation_topic_id: string | null
  relations_completed_at: Date | null
  cursor_receipt_topic_id: string | null
}
