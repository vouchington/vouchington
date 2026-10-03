'use client'

import type { AccountType } from '@ts-shared/utils/account-type'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTranslations } from '@/lib/i18n/use-translations'

const LABEL_KEYS = {
  official: 'shared.accountType.official',
  system: 'shared.accountType.system',
  ai_agent: 'shared.accountType.aiAgent',
} as const

export function UserAccountBadge({
  accountType,
  className,
}: {
  accountType: AccountType | undefined
  className?: string
}) {
  const t = useTranslations()
  if (accountType == null) return null
  return (
    <Badge
      data-pw='user-account-badge'
      variant='secondary'
      className={cn('text-[10px]', className)}
      asChild
    >
      <span>{t(LABEL_KEYS[accountType])}</span>
    </Badge>
  )
}
