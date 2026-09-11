import type { CrmContactStatus } from '@/types/crm'

export function deriveCrmContactStatus(contact: {
  opted_out_at: string | null
  archived_at: string | null
  converted_at: string | null
  responded_at: string | null
  contacted_at: string | null
}): CrmContactStatus {
  if (contact.opted_out_at) return 'opted_out'
  if (contact.archived_at) return 'archived'
  if (contact.converted_at) return 'converted'
  if (contact.responded_at) return 'in_conversation'
  if (contact.contacted_at) return 'awaiting_response'
  return 'new'
}
