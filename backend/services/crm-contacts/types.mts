export type {
  CrmContact,
  CrmContactSocialAccount,
  CrmContactType,
  CrmContactSource,
  CrmContactVertical,
  CrmSocialPlatform,
  CrmContactStatus,
} from '@voucha/types/entities/crm-contact'

import type {
  CrmContactVertical,
  CrmContactType,
  CrmContactSource,
  CrmSocialPlatform,
} from '@voucha/types/entities/crm-contact'

export type CreateCrmContactSocialAccountInput = {
  platform: CrmSocialPlatform
  handle: string
  profile_url?: string | null
  follower_count?: number | null
}

export type CreateCrmContactInput = {
  name: string
  email: string
  phone?: string | null
  vertical?: CrmContactVertical | null
  contact_type?: CrmContactType
  source?: CrmContactSource
  follower_count?: number | null
  notes?: string | null
  metadata?: Record<string, unknown> | null
  assigned_to_id?: string | null
  social_accounts?: CreateCrmContactSocialAccountInput[]
}

export type UpdateCrmContactInput = {
  name?: string
  email?: string
  phone?: string | null
  vertical?: CrmContactVertical | null
  contact_type?: CrmContactType
  follower_count?: number | null
  notes?: string | null
  metadata?: Record<string, unknown> | null
  assigned_to_id?: string | null
  contacted_at?: Date | null
  responded_at?: Date | null
  converted_at?: Date | null
  opted_out_at?: Date | null
}
