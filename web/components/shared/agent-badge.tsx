'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTranslations } from '@/lib/i18n/use-translations'

export function AgentBadge({ className }: { className?: string }) {
  const t = useTranslations()
  return (
    <Badge
      data-pw='agent-badge'
      variant='secondary'
      className={cn('text-[10px]', className)}
      asChild
    >
      <span>{t('extracted.shared.agentBadge.agent_d4f0bc5a')}</span>
    </Badge>
  )
}
