import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

/** Number of distinct disturbing-media items a moderator can reveal before a break is prompted. */
export const EXPOSURE_BREAK_THRESHOLD: number = 10

/** Rolling window in minutes used to count distinct reveals for the threshold check. */
export const EXPOSURE_WINDOW_MINUTES: number = 60

/** Duration in minutes of the soft queue pause shown after the threshold is reached. */
export const EXPOSURE_COOLDOWN_MINUTES: number = 10

const DEFAULT_COUNT_DISPLAY_CAP = 99

/**
 * Hard ceiling for the display cap. The SQL read limit binds this, so changing the configured cap
 * never changes the rows read or the cooldown timing.
 */
export const EXPOSURE_COUNT_DISPLAY_CAP_MAX = 999

export const moderationExposureConfig = new DynamicConfig({
  key: 'moderation-exposure-config',
  fieldTypes: { count_display_cap: 'number' },
  defaultFields: { count_display_cap: DEFAULT_COUNT_DISPLAY_CAP },
})

/**
 * Largest distinct-reveal count the exposure read reports; clients render "N+" past it. It is
 * never below EXPOSURE_BREAK_THRESHOLD, so the threshold and cooldown stay exact.
 */
export function getExposureCountDisplayCap(): number {
  return Math.max(
    getBoundedPositiveIntegerField(moderationExposureConfig, 'count_display_cap', {
      defaultValue: DEFAULT_COUNT_DISPLAY_CAP,
      maxValue: EXPOSURE_COUNT_DISPLAY_CAP_MAX,
    }),
    EXPOSURE_BREAK_THRESHOLD,
  )
}
