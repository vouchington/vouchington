import type { WebCrmContact, WebCrmMessage } from '@/types/crm'
import type { CrmContactEditFields } from './crm-contact-edit-form'

export interface CrmContactDetailState {
  contact: WebCrmContact
  editing: boolean
  saving: boolean
  archiving: boolean
  messages: WebCrmMessage[]
  fields: CrmContactEditFields
  linkUserId: string
  linking: boolean
  unlinking: boolean
  confirmArchive: boolean
}

export function makeInitialState(
  initialContact: WebCrmContact,
  initialMessages: WebCrmMessage[],
): CrmContactDetailState {
  return {
    contact: initialContact,
    editing: false,
    saving: false,
    archiving: false,
    messages: initialMessages,
    fields: getEditFields(initialContact),
    linkUserId: '',
    linking: false,
    unlinking: false,
    confirmArchive: false,
  }
}

export function getEditFields(contact: WebCrmContact): CrmContactEditFields {
  return {
    email: contact.email,
    followerCount: contact.follower_count != null ? String(contact.follower_count) : '',
    name: contact.name,
    notes: contact.notes ?? '',
    phone: contact.phone ?? '',
    vertical: contact.vertical ?? 'none',
  }
}
