import { formatNumber } from '@ts-shared/utils/format'
import type { DomainStateCount } from '@/lib/api/client/mq'

export const BACKGROUND_QUEUE = 'background'

export const DOMAIN_COUNT_STATES = ['waiting', 'active', 'delayed', 'completed', 'failed'] as const

export type DomainCountState = (typeof DOMAIN_COUNT_STATES)[number]

/** A capped scan is a lower bound, so it renders as `N+`. */
export function formatDomainCount(value: DomainStateCount, locale: string): string {
  const formatted = formatNumber(value.count, locale)
  return value.complete ? formatted : `${formatted}+`
}
