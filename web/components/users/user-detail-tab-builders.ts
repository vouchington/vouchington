// Tab visibility rule: hide when count is 0 unless the user is currently on
// that tab's URL. See web/CLAUDE.md "Entity-detail tab visibility".

import type { MessageKey } from '@ts-shared/ui-messages'
import type { useTranslations } from '@/lib/i18n/use-translations'
import type { UserMetrics } from '@/types/user'
import type { UserDetailTab } from './user-detail-tab-types'
import { formatNumber, type NumberFormatLocale } from '@ts-shared/utils/format'

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
  const publicCount = metrics?.count[key] ?? 0
  const viewerCount = metrics?.viewer_count?.[key] ?? 0

  const routeSuffix = `/${key}`
  if (publicCount === 0 && viewerCount === 0 && activeRouteSuffix !== routeSuffix) return

  const countDisplay = `${formatNumber(publicCount, uiLocale)}${viewerCount > publicCount ? '+' : ''}`
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
    label: t(labelKey, { count: formatNumber(count, uiLocale) }),
    href: `${userPath}${routeSuffix}`,
    routeSuffix,
  })
}
