export const NAVIGATION_TIMEOUT_MS = 30_000
export const CSR_HYDRATION_WAIT_MS = 5_000
export const MIN_CONTENT_LENGTH = 50
export const PAGE_MEASUREMENT_LIMITS = {
  maxHtmlBytes: 4 * 1024 * 1024,
  maxTraversalWork: 4 * 1024 * 1024,
} as const
export const MAX_TITLE_BYTES = 16 * 1024
