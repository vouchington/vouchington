export const MAX_RATE_LIMIT_REQUESTS = 1_000_000
export const MAX_RATE_LIMIT_WINDOW_SECONDS = 31_536_000

export function scoreField(description: string) {
  return { description, maxValue: 1_000_000_000 }
}
