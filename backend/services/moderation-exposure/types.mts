export type ModMediaRevealSurface = 'mod_queue' | 'review_queue' | 'reports' | 'post_page'

export type ExposureState = {
  /** Distinct-entity reveal count within the current window. */
  count: number
  /** Threshold before the break prompt fires. */
  threshold: number
  /** True when count >= threshold AND the cooldown window has not yet elapsed. */
  in_cooldown: boolean
  /** ISO timestamp when the cooldown ends; null when not in cooldown. */
  cooldown_ends_at: string | null
}
