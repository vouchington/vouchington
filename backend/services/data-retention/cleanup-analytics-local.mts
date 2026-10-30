import { cleanupLocalAnalyticsRetention } from '@data-stores/analytics/retention'
import { flush as flushLocalAnalytics } from '@data-stores/analytics/backend-local'

export async function cleanupAnalyticsLocalFiles(options: { now?: Date } = {}): Promise<void> {
  if (process.env.ANALYTICS_BACKEND !== 'local') return
  await flushLocalAnalytics()
  await cleanupLocalAnalyticsRetention(options)
}
