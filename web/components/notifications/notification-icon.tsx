import { Bell, Scale, ShieldBan } from 'lucide-react'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'

const FollowIcon = EntityActionIcons.follow
const ReportIcon = EntityActionIcons.report

export function NotificationIcon({
  entityType,
  size = 'md',
}: {
  entityType: string
  size?: 'sm' | 'md'
}) {
  const className =
    size === 'sm'
      ? 'h-3.5 w-3.5 shrink-0 text-muted-foreground'
      : 'h-4 w-4 shrink-0 text-muted-foreground'
  if (entityType === 'follow') return <FollowIcon className={className} />
  if (entityType === 'review_dispute') return <ReportIcon className={className} />
  if (entityType === 'moderation_appeal') return <Scale className={className} />
  if (entityType === 'community_ban') return <ShieldBan className={className} />
  return <Bell className={className} />
}
