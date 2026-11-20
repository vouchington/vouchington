export interface ExposureState {
  /** Distinct-entity reveal count within the current window, at most the display cap. */
  count: number
  /** True when more distinct reveals exist than `count` reports; render "N+". */
  count_capped: boolean
  /** Threshold before the break prompt fires. */
  threshold: number
  /** True when count >= threshold AND the cooldown window has not yet elapsed. */
  in_cooldown: boolean
  /** ISO timestamp when the cooldown ends; null when not in cooldown. */
  cooldown_ends_at: string | null
}
