import type { Serialized } from '@voucha/types/serialized'
import type {
  CrmContact,
  CrmContactSocialAccount,
  CrmMessage,
  CrmNote,
} from '@voucha/types/entities/crm-contact'

export type { CrmContactVertical, CrmContactStatus } from '@voucha/types/entities/crm-contact'

export type WebCrmContact = Serialized<CrmContact>
export type WebCrmContactSocialAccount = Serialized<CrmContactSocialAccount>
export type WebCrmMessage = Serialized<CrmMessage>
export type WebCrmNote = Serialized<CrmNote>

export interface CrmContactListResponse {
  results: WebCrmContact[]
  page_info: {
    has_next_page: boolean
    end_cursor: string | null
    start_cursor: string | null
  }
}

export interface CrmContactDetailResponse {
  contact: WebCrmContact
  social_accounts: WebCrmContactSocialAccount[]
}

export interface CrmEmailListResponse {
  results: WebCrmMessage[]
  page_info: {
    has_next_page: boolean
    end_cursor: string | null
    start_cursor: string | null
  }
}

export interface CrmNoteListResponse {
  results: WebCrmNote[]
  page_info: {
    has_next_page: boolean
    end_cursor: string | null
    start_cursor: string | null
  }
}

export type CrmImportResponse =
  | {
      valid: true
      batch: { id: string; import_type: string; total_rows: number; created_at: string }
    }
  | {
      valid: false
      error?: string
      validation?: {
        valid: false
        rows: Array<{
          row_index: number
          valid: boolean
          errors: string[]
        }>
      }
    }

export interface CrmEmailDraft {
  subject: string
  body_html: string
  body_text: string
}
