/** Number of distinct disturbing-media items a moderator can reveal before a break is prompted. */
export const EXPOSURE_BREAK_THRESHOLD: number = 10

/** Rolling window in minutes used to count distinct reveals for the threshold check. */
export const EXPOSURE_WINDOW_MINUTES: number = 60

/** Duration in minutes of the soft queue pause shown after the threshold is reached. */
export const EXPOSURE_COOLDOWN_MINUTES: number = 10
