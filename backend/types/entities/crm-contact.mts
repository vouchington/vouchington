export type CrmContactType = 'influencer' | 'customer' | 'partner'
export type CrmContactSource = 'csv_import' | 'manual' | 'inbound_email' | 'referral'
export type CrmContactVertical =
  | 'credit_cards'
  | 'travel'
  | 'cars'
  | 'ai'
  | 'technology'
  | 'finance'
  | 'lifestyle'
  | 'other'
export type CrmSocialPlatform = 'instagram' | 'tiktok' | 'youtube' | 'x' | 'linkedin'
import type { MessageDirection } from '../common.mts'
export type CrmMessageDirection = MessageDirection
export type CrmEmailProvider = 'ses' | 'gmail_smtp'
export type CrmContactStatus =
  | 'new'
  | 'awaiting_response'
  | 'in_conversation'
  | 'converted'
  | 'archived'
  | 'opted_out'

export type CrmContact = {
  __entity_type: 'crm_contact'
  id: string
  name: string
  email: string
  phone: string | null
  vertical: CrmContactVertical | null
  contact_type: CrmContactType
  source: CrmContactSource
  follower_count: number | null
  notes: string | null
  metadata: Record<string, unknown> | null
  user_id: string | null
  assigned_to_id: string | null
  created_by_id: string
  contacted_at: Date | null
  responded_at: Date | null
  converted_at: Date | null
  opted_out_at: Date | null
  archived_at: Date | null
  created_at: Date
  updated_at: Date
}

export type CrmContactSocialAccount = {
  __entity_type: 'crm_contact_social_account'
  id: string
  contact_id: string
  platform: CrmSocialPlatform
  handle: string
  profile_url: string | null
  follower_count: number | null
  follower_count_updated_at: Date | null
  created_at: Date
  updated_at: Date
}

export type CrmThread = {
  __entity_type: 'crm_thread'
  id: string
  contact_id: string
  subject: string
  created_by_id: string
  closed_at: Date | null
  archived_at: Date | null
  created_at: Date
  updated_at: Date
}

export type CrmMessage = {
  __entity_type: 'crm_message'
  id: string
  conversation_id: string
  direction: CrmMessageDirection
  from_email: string
  to_email: string
  subject: string | null
  body_text: string | null
  body_html: string | null
  email_provider: CrmEmailProvider | null
  ses_message_id: string | null
  sent_at: Date | null
  delivered_at: Date | null
  bounced_at: Date | null
  received_at: Date | null
  discarded_at: Date | null
  ai_prompt: string | null
  ai_generated_at: Date | null
  sent_by_id: string | null
  created_at: Date
  updated_at: Date
}

export type CrmMessageImage = {
  __entity_type: 'crm_message_image'
  message_id: string
  image_id: string
  sort_order: number
}

export type CrmNote = {
  __entity_type: 'crm_note'
  id: string
  conversation_id: string
  contact_id: string
  body: string
  created_by_id: string
  deleted_at: Date | null
  created_at: Date
  updated_at: Date
}
