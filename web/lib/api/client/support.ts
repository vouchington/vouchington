'use client'

import { clientApi } from './instance'
import type {
  SupportContactsResponse,
  SupportContactDetailResponse,
  SupportMessage,
  SupportMessagesResponse,
  SupportThreadCreateResponseBody,
  SupportThread,
  SupportThreadsResponse,
} from '@/types/support'

// Admin endpoints

export function getAdminSupportThreadsClient(params?: {
  status?: 'open' | 'assigned' | 'resolved'
  q?: string
  after?: string
  limit?: number
}): Promise<SupportThreadsResponse> {
  const searchParams: Record<string, string | number | boolean | undefined> = {}
  if (params?.status) searchParams.status = params.status
  if (params?.q) searchParams.q = params.q
  if (params?.after) searchParams.after = params.after
  if (params?.limit !== undefined) searchParams.limit = params.limit
  return clientApi.get<SupportThreadsResponse>('/api/v1/support/threads', { searchParams })
}

export function patchAdminSupportThread(
  threadId: string,
  body: { assigned_to_id?: string } | { resolved: boolean },
): Promise<{ thread: SupportThread }> {
  return clientApi.patch<{ thread: SupportThread }>(`/api/v1/support/threads/${threadId}`, body)
}

export function getAdminSupportThreadMessagesClient(
  threadId: string,
  params?: { after?: string; limit?: number },
): Promise<SupportMessagesResponse> {
  const searchParams: Record<string, string | number | boolean | undefined> = {}
  if (params?.after) searchParams.after = params.after
  if (params?.limit !== undefined) searchParams.limit = params.limit
  return clientApi.get<SupportMessagesResponse>(`/api/v1/support/threads/${threadId}/messages`, {
    searchParams,
  })
}

export function postAdminSupportThreadMessage(
  threadId: string,
  body: { body_text: string },
): Promise<{ message: SupportMessage }> {
  return clientApi.post<{ message: SupportMessage }>(
    `/api/v1/support/threads/${threadId}/messages`,
    body,
  )
}

export function postAdminSupportThreadDraft(threadId: string): Promise<{ queued: true }> {
  return clientApi.post<{ queued: true }>(`/api/v1/support/threads/${threadId}/drafts`)
}

export function patchAdminSupportMessage(
  threadId: string,
  messageId: string,
  body: { body_text: string },
): Promise<{ message: SupportMessage }> {
  return clientApi.patch<{ message: SupportMessage }>(
    `/api/v1/support/threads/${threadId}/messages/${messageId}`,
    body,
  )
}

export function approveAdminSupportMessage(
  threadId: string,
  messageId: string,
): Promise<{ message: SupportMessage }> {
  return clientApi.post<{ message: SupportMessage }>(
    `/api/v1/support/threads/${threadId}/messages/${messageId}/approvals`,
  )
}

export function sendAdminSupportMessage(
  threadId: string,
  messageId: string,
): Promise<{ message: SupportMessage }> {
  return clientApi.post<{ message: SupportMessage }>(
    `/api/v1/support/threads/${threadId}/messages/${messageId}/sends`,
  )
}

export function getAdminSupportContactsClient(params?: {
  q?: string
  after?: string
  limit?: number
}): Promise<SupportContactsResponse> {
  const searchParams: Record<string, string | number | boolean | undefined> = {}
  if (params?.q) searchParams.q = params.q
  if (params?.after) searchParams.after = params.after
  if (params?.limit !== undefined) searchParams.limit = params.limit
  return clientApi.get<SupportContactsResponse>('/api/v1/support/contacts', { searchParams })
}

export function getAdminSupportContactClient(
  contactId: string,
  params?: { after?: string; limit?: number },
): Promise<SupportContactDetailResponse> {
  const searchParams: Record<string, string | number | boolean | undefined> = {}
  if (params?.after) searchParams.after = params.after
  if (params?.limit !== undefined) searchParams.limit = params.limit
  return clientApi.get<SupportContactDetailResponse>(`/api/v1/support/contacts/${contactId}`, {
    searchParams,
  })
}

// User endpoints

export function createMySupportThread(body: {
  subject: string
  message?: string
  conversation_id?: string
}): Promise<SupportThreadCreateResponseBody> {
  return clientApi.post<SupportThreadCreateResponseBody>('/api/v1/my/support-threads', body)
}

export function getMySupportThreadsClient(params?: {
  after?: string
  limit?: number
}): Promise<SupportThreadsResponse> {
  const searchParams: Record<string, string | number | boolean | undefined> = {}
  if (params?.after) searchParams.after = params.after
  if (params?.limit !== undefined) searchParams.limit = params.limit
  return clientApi.get<SupportThreadsResponse>('/api/v1/my/support-threads', { searchParams })
}
