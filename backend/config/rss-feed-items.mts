const DEFAULT_STORY_WINDOW_DAYS = 4
// News stories rarely span more than 1–2 weeks; cap prevents misconfiguration
const MAX_STORY_WINDOW_DAYS = 14

const configuredStoryWindowDays = Number(process.env.STORY_WINDOW_DAYS)

export const STORY_WINDOW_DAYS = Number.isFinite(configuredStoryWindowDays)
  ? Math.min(MAX_STORY_WINDOW_DAYS, Math.max(0, Math.floor(configuredStoryWindowDays)))
  : DEFAULT_STORY_WINDOW_DAYS

// Stricter threshold reduces false positives where topically similar but
// event-distinct articles (e.g. two separate security incidents) get clustered.
export const STORY_DISTANCE_THRESHOLD = 0.35
