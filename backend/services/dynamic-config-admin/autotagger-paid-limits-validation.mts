import { DynamicConfigValidationError } from './namespace.mts'
import type { DynamicConfigFields } from './types.mts'

export function validateAutotaggerPaidLimitsConfig(next: DynamicConfigFields): void {
  if (next.post_free_max_topics !== undefined && next.post_free_max_topics !== 0) {
    throw new DynamicConfigValidationError(
      'Free-tier post autotagging must remain disabled (post_free_max_topics = 0)',
    )
  }
  const plusLimit = next.rss_collaborative_plus_max_topics
  const proLimit = next.rss_collaborative_pro_max_topics
  if (
    typeof plusLimit !== 'number' ||
    !Number.isFinite(plusLimit) ||
    typeof proLimit !== 'number' ||
    !Number.isFinite(proLimit)
  ) {
    throw new DynamicConfigValidationError('RSS collaborative topic caps must be finite numbers')
  }
  if (plusLimit <= proLimit) return

  throw new DynamicConfigValidationError(
    'RSS collaborative topic caps must satisfy rss_collaborative_plus_max_topics <= rss_collaborative_pro_max_topics',
  )
}
