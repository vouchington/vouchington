export function createSourceCrawlFeedItemKey(
  item: Record<string, unknown>,
  url: string | null,
): string {
  const identity = ['id', 'guid', 'uuid']
    .map(field => getStringField(item, field))
    .find((field): field is string => field != null)
  return identity ?? url ?? JSON.stringify(item)
}

function getStringField(item: Record<string, unknown>, field: string): string | null {
  const value = item[field]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
import type { CrawlOutcome } from '@/components/topics/manage-source/crawl-outcome'

export function getCrawlOutcomeMessage(outcome: CrawlOutcome) {
  switch (outcome.kind) {
    case 'not_modified':
      return { key: 'extracted.manageSource.crawlHistorySection.notModified_2dca2e47' } as const
    case 'items':
      return {
        key: 'extracted.manageSource.crawlHistorySection.itemCount_89f0312c',
        values: { count: outcome.count ?? 0 },
      } as const
    case 'success':
      return { key: 'extracted.manageSource.crawlHistorySection.success_6f488f09' } as const
    case 'redirect':
      return { key: 'extracted.manageSource.crawlHistorySection.redirect_c8a20f60' } as const
    case 'error':
      return { key: 'extracted.manageSource.crawlHistorySection.error_19448d29' } as const
  }
}

export function getCrawlOutcomeBackgroundClass(tone: CrawlOutcome['tone']): string {
  if (tone === 'success')
    return 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200'
  if (tone === 'warning')
    return 'bg-yellow-50 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-200'
  if (tone === 'error') return 'bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-200'
  return 'bg-muted text-muted-foreground'
}
