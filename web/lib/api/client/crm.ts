'use client'

import { clientApi } from './instance'
import { ApiError } from '../error'
import { parseErrorResponseBody } from '../error-helpers'
import type {
  WebCrmContact,
  WebCrmNote,
  WebCrmMessage,
  CrmImportResponse,
  CrmEmailDraft,
} from '@/types/crm'

// Keep this aligned with POST /api/v1/imports/crm-contacts. The browser must
// reject before File.text() duplicates an arbitrarily large local file.
export const MAX_CRM_CSV_FILE_BYTES = 4 * 1024 * 1024

interface UpdateCrmContactBody {
  name?: string
  email?: string
  phone?: string | null
  vertical?: string | null
  contact_type?: string
  follower_count?: number | null
  notes?: string | null
  assigned_to_id?: string | null
  contacted_at?: string | null
  responded_at?: string | null
  converted_at?: string | null
  opted_out_at?: string | null
}

export function createCrmContact(body: {
  name: string
  email: string
  phone?: string | null
  vertical?: string | null
  contact_type?: string
  follower_count?: number | null
  notes?: string | null
}): Promise<{ contact: WebCrmContact }> {
  return clientApi.post<{ contact: WebCrmContact }>('/api/v1/crm/contacts', body)
}

export function updateCrmContact(
  id: string,
  body: UpdateCrmContactBody,
): Promise<{ contact: WebCrmContact }> {
  return clientApi.patch<{ contact: WebCrmContact }>(`/api/v1/crm/contacts/${id}`, body)
}

export function deleteCrmContact(id: string): Promise<void> {
  return clientApi.delete<void>(`/api/v1/crm/contacts/${id}`)
}

export function sendCrmEmail(
  contactId: string,
  body: {
    subject: string
    body_html?: string | null
    body_text?: string | null
    email_provider: 'ses' | 'gmail_smtp'
    cta_url?: string | null
    ai_prompt?: string | null
    ai_generated_at?: string | null
  },
): Promise<{ message: WebCrmMessage }> {
  return clientApi.post<{ message: WebCrmMessage }>(
    `/api/v1/crm/contacts/${contactId}/emails`,
    body,
  )
}

export async function importCrmCsv(csvText: string): Promise<CrmImportResponse> {
  // Raw fetch (not clientApi) so the 422 validation body is read and rendered by the dialog.
  // Body is JSON `{ csv }`, not a raw text/csv body — the API enforces JSON-only content types
  // as a CSRF defense (see docs/requirements/security/CSRF.md).
  const response = await fetch('/api/v1/imports/crm-contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ csv: csvText }),
  })
  // 201 (success) and 422 (validation errors) both return a CrmImportResponse the dialog
  // renders; any other non-2xx status (401/403/500) is a real failure, not a parseable body.
  if (!response.ok && response.status !== 422) {
    throw new ApiError('CSV import failed', response.status, await parseErrorResponseBody(response))
  }
  return response.json() as Promise<CrmImportResponse>
}

export function linkCrmContactToUser(
  contactId: string,
  userId: string,
): Promise<{ contact: WebCrmContact }> {
  return clientApi.put<{ contact: WebCrmContact }>(`/api/v1/crm/contacts/${contactId}/user-link`, {
    user_id: userId,
  })
}

export function unlinkCrmContact(contactId: string): Promise<{ contact: WebCrmContact }> {
  return clientApi.delete<{ contact: WebCrmContact }>(`/api/v1/crm/contacts/${contactId}/user-link`)
}

export function createCrmNote(contactId: string, body: string): Promise<{ note: WebCrmNote }> {
  return clientApi.post<{ note: WebCrmNote }>(`/api/v1/crm/contacts/${contactId}/notes`, {
    body,
  })
}

export function deleteCrmNote(contactId: string, noteId: string): Promise<void> {
  return clientApi.delete<void>(`/api/v1/crm/contacts/${contactId}/notes/${noteId}`)
}

export function generateCrmEmailDraft(
  contactId: string,
  body: { prompt?: string; tone?: string },
): Promise<{ draft: CrmEmailDraft }> {
  return clientApi.post<{ draft: CrmEmailDraft }>(
    `/api/v1/crm/contacts/${contactId}/email-drafts`,
    body,
  )
}

export function unsubscribeCrmContactToken(token: string): Promise<{ ok: true }> {
  return clientApi.post<{ ok: true }>('/api/v1/crm/unsubscribe', { token })
}
