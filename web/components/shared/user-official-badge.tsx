import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AgentBadge } from './agent-badge'

export function OfficialAccountBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant='secondary'
      className={cn('text-[10px]', className)}
      asChild
    >
      <span>official</span>
    </Badge>
  )
}

export function UserOfficialBadge({
  isAgent,
  isOfficial,
  className,
}: {
  isAgent?: boolean | null
  isOfficial?: boolean | null
  className?: string
}) {
  if (!isOfficial) return null
  return isAgent === true ? (
    <AgentBadge className={className} />
  ) : (
    <OfficialAccountBadge className={className} />
  )
}
