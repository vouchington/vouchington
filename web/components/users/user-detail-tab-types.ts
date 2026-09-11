import type { UserMetrics } from '@/types/user'
import type { NumberFormatLocale } from '@ts-shared/utils/format'

export interface UserDetailTab {
  value: string
  label: string
  href: string
  routeSuffix: string
  active?: boolean
}

export interface BuildUserDetailTabsOptions {
  usernameOrId: string
  metrics?: UserMetrics
  routeSuffix?: string
  uiLocale?: NumberFormatLocale
}
