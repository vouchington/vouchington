'use client'

import { clientApi } from './instance'
import type {
  CommunityModmailInboxResponseBody,
  CommunityModmailThread,
  PageInfo,
} from '@/types/api-responses'

export type ModmailThread = CommunityModmailThread
export type ModmailInboxResponseBody = CommunityModmailInboxResponseBody

export interface ModmailMessage {
  id: string
  conversation_id: string
  body_text: string
  created_by_id: string | null
  sender_username?: string | null
  created_at: string
}

export interface SavedReply {
  id: string
  community_id: string
  title: string
  body: string
  order_index: number
  created_by_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ModmailMessagesResponseBody {
  results: ModmailMessage[]
  page_info: PageInfo
}

export interface SavedRepliesResponseBody {
  results: SavedReply[]
  page_info: PageInfo
}

export function getModmailInboxClient(
  communitySlug: string,
  options?: { after?: string },
): Promise<ModmailInboxResponseBody> {
  const params = options?.after ? `?after=${encodeURIComponent(options.after)}` : ''
  return clientApi.get<ModmailInboxResponseBody>(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/modmail${params}`,
  )
}

export function openModmailThread(
  communitySlug: string,
  subjectUserId?: string,
): Promise<{ thread: ModmailThread }> {
  return clientApi.post<{ thread: ModmailThread }>(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/modmail`,
    subjectUserId ? { subject_user_id: subjectUserId } : {},
  )
}

export function openModmailThreadForReport(
  communitySlug: string,
  reportId: string,
): Promise<{ conversation: { id: string } }> {
  return clientApi.post<{ conversation: { id: string } }>(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/reports/${encodeURIComponent(reportId)}/modmail`,
    {},
  )
}

export function getModmailMessagesClient(
  communitySlug: string,
  conversationId: string,
  options?: { after?: string },
): Promise<ModmailMessagesResponseBody> {
  const params = options?.after ? `?after=${encodeURIComponent(options.after)}` : ''
  const path = `/api/v1/communities/${encodeURIComponent(communitySlug)}/modmail/${conversationId}/messages${params}`
  return clientApi.get<ModmailMessagesResponseBody>(path)
}

export function sendModmailMessage(
  communitySlug: string,
  conversationId: string,
  text: string,
): Promise<{ message: ModmailMessage }> {
  return clientApi.post<{ message: ModmailMessage }>(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/modmail/${conversationId}/messages`,
    { text },
  )
}

export function assignModmailThread(
  communitySlug: string,
  conversationId: string,
  modUserId: string,
): Promise<{ thread: ModmailThread }> {
  return clientApi.patch<{ thread: ModmailThread }>(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/modmail/${conversationId}`,
    { assigned_mod_id: modUserId },
  )
}

export function resolveModmailThread(
  communitySlug: string,
  conversationId: string,
): Promise<{ thread: ModmailThread }> {
  return clientApi.patch<{ thread: ModmailThread }>(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/modmail/${conversationId}`,
    { resolved: true },
  )
}

export function getCommunitySavedReplies(
  communitySlug: string,
  options?: { after?: string; limit?: number },
): Promise<SavedRepliesResponseBody> {
  const path = `/api/v1/communities/${encodeURIComponent(communitySlug)}/saved-replies`
  if (!options) return clientApi.get<SavedRepliesResponseBody>(path)
  return clientApi.get<SavedRepliesResponseBody>(path, {
    searchParams: { after: options?.after, limit: options?.limit },
  })
}

export function createSavedReply(
  communitySlug: string,
  title: string,
  body: string,
): Promise<{ reply: SavedReply }> {
  return clientApi.post<{ reply: SavedReply }>(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/saved-replies`,
    { title, body },
  )
}

export function deleteSavedReply(communitySlug: string, replyId: string): Promise<void> {
  return clientApi.delete(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/saved-replies/${replyId}`,
  )
}
