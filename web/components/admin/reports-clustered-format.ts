import { formatNumber } from '@ts-shared/utils/format'
import type { ModerationReportReasonBreakdown } from './reports-client-types'

export function formatReasonBreakdown(
  breakdown: ModerationReportReasonBreakdown,
  uiLocale: string,
): string {
  if (breakdown.length === 0) return 'No reasons'
  return breakdown.map(item => `${item.reason} ${formatNumber(item.count, uiLocale)}`).join(', ')
}

export function buildReportsPageHref(options: {
  after?: string
  before?: string
  cluster?: 'entity' | 'none'
  sort?: string
  status?: string
}): string {
  const params = new URLSearchParams()
  if (options.status) params.set('status', options.status)
  if (options.sort) params.set('sort', options.sort)
  if (options.cluster) params.set('cluster', options.cluster)
  if (options.after) params.set('after', options.after)
  if (options.before) params.set('before', options.before)
  const query = params.toString()
  return query ? `/reports?${query}` : '/reports'
}
