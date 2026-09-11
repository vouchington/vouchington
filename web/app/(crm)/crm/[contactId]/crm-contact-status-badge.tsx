import { Badge } from '@/components/ui/badge'
import type { CrmContactStatus } from '@/types/crm'

const STATUS_LABELS: Record<CrmContactStatus, string> = {
  new: 'New',
  awaiting_response: 'Awaiting Response',
  in_conversation: 'In Conversation',
  converted: 'Converted',
  archived: 'Archived',
  opted_out: 'Opted Out',
}

const STATUS_VARIANTS: Record<
  CrmContactStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  new: 'secondary',
  awaiting_response: 'outline',
  in_conversation: 'default',
  converted: 'default',
  archived: 'secondary',
  opted_out: 'destructive',
}

interface Props {
  status: CrmContactStatus
}

export function CrmContactStatusBadge({ status }: Props) {
  return <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
}
