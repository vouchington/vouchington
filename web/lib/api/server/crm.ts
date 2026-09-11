import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  CrmContactListResponse,
  CrmContactDetailResponse,
  CrmEmailListResponse,
  CrmNoteListResponse,
} from '@/types/crm'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getAdminCrmContacts = cache(
  async (options: GetOptions = {}): Promise<CrmContactListResponse> => {
    return serverApi.get<CrmContactListResponse>('/api/v1/crm/contacts', options)
  },
)

export const getAdminCrmContact = cache(
  async (
    id: string,
    options?: { headers?: Record<string, string> },
  ): Promise<CrmContactDetailResponse | null> => {
    return returnNullForMissingEntity(
      serverApi.get<CrmContactDetailResponse>(`/api/v1/crm/contacts/${id}`, options),
    )
  },
)

export const getAdminCrmContactEmails = cache(
  async (contactId: string, options: GetOptions = {}): Promise<CrmEmailListResponse> => {
    return serverApi.get<CrmEmailListResponse>(`/api/v1/crm/contacts/${contactId}/emails`, options)
  },
)

export const getAdminCrmContactNotes = cache(
  async (contactId: string, options: GetOptions = {}): Promise<CrmNoteListResponse> => {
    return serverApi.get<CrmNoteListResponse>(`/api/v1/crm/contacts/${contactId}/notes`, options)
  },
)
