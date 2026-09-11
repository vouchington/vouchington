export type { CrmNote } from '@voucha/types/entities/crm-contact'

export type CreateCrmNoteInput = {
  contact_id: string
  body: string
}
