// Tab visibility rule: hide when count is 0 unless the user is currently on
// that tab's URL. See web/AGENTS.md "Entity-detail tab visibility".

import type { MessageKey } from '@ts-shared/ui-messages'
import type { useTranslations } from '@/lib/i18n/use-translations'
import type { UserMetrics } from '@/types/user-metrics'
import type { UserDetailTab } from './user-detail-tab-types'
import type { NumberFormatLocale } from '@ts-shared/utils/format'
import { formatCappedCount } from '@/lib/users/format-capped-count'

type PublicContentKey = 'reviews' | 'discussions' | 'comments'

export function appendContentTab(
  tabs: UserDetailTab[],
  userPath: string,
  metrics: UserMetrics | undefined,
  key: PublicContentKey,
  t: ReturnType<typeof useTranslations>,
  labelKey: MessageKey,
  activeRouteSuffix: string,
  uiLocale?: NumberFormatLocale,
) {
  const count = metrics?.count[key] ?? 0

  const routeSuffix = `/${key}`
  if (count === 0 && activeRouteSuffix !== routeSuffix) return

  const countDisplay = formatCappedCount(count, metrics?.count_capped[key] ?? false, uiLocale)
  tabs.push({
    value: key,
    label: t(labelKey, { count: countDisplay }),
    href: `${userPath}${routeSuffix}`,
    routeSuffix,
  })
}

export function appendCountTab(
  tabs: UserDetailTab[],
  count: number,
  capped: boolean,
  value: string,
  t: ReturnType<typeof useTranslations>,
  labelKey: MessageKey,
  userPath: string,
  routeSuffix: string,
  activeRouteSuffix: string,
  uiLocale?: NumberFormatLocale,
) {
  if (count === 0 && activeRouteSuffix !== routeSuffix) return

  tabs.push({
    value,
    label: t(labelKey, { count: formatCappedCount(count, capped, uiLocale) }),
    href: `${userPath}${routeSuffix}`,
    routeSuffix,
  })
}
