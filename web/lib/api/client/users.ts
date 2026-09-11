'use client'

import { clientApi } from './instance'
import { clientFetch } from './raw-fetch'
import { assertPathIdentifier } from './path-identifiers'
import { ApiError } from '../error'
import { parseErrorResponseBody } from '../error-helpers'
import type {
  UserResponseBody,
  UsersListResponseBody,
  UsersSearchResponseBody,
  UserModNotesListResponse,
  UserModerationContextResponse,
  UserModNote,
} from '@/types/api-responses'
import type { UpdateUserBody } from '@/types/user'

interface SearchUsersOptions {
  q: string
  after?: string
  limit?: number
  signal?: AbortSignal
}

export function searchUsers(options: SearchUsersOptions): Promise<UsersSearchResponseBody> {
  return clientApi.get<UsersSearchResponseBody>('/api/v1/users', {
    searchParams: { q: options.q, after: options.after, limit: options.limit },
    signal: options.signal,
  })
}

export function suspendUser(userId: string, body: { reason?: string }): Promise<UserResponseBody> {
  const safeId = assertPathIdentifier(userId)
  return clientApi.put<UserResponseBody>(
    `/api/v1/users/${encodeURIComponent(safeId)}/suspension`,
    body,
  )
}

export function unsuspendUser(userId: string): Promise<UserResponseBody> {
  const safeId = assertPathIdentifier(userId)
  return clientApi.delete<UserResponseBody>(
    `/api/v1/users/${encodeURIComponent(safeId)}/suspension`,
  )
}

export function updateMyUser(
  userId: string,
  body: Partial<UpdateUserBody>,
): Promise<UserResponseBody> {
  const safeId = assertPathIdentifier(userId)
  return clientApi.patch<UserResponseBody>(`/api/v1/users/${encodeURIComponent(safeId)}`, body)
}

export function deleteUser(userId: string): Promise<{ logout: boolean }> {
  const safeId = assertPathIdentifier(userId)
  return clientApi.delete<{ logout: boolean }>(`/api/v1/users/${encodeURIComponent(safeId)}`)
}

export type DataRequestStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'expired'

export interface DataRequest {
  id: string
  status: DataRequestStatus
  expires_at: string | null
  created_at: string
  download_url: string | null
}

export interface CreateOrConflictDataRequestResponse {
  id?: string
  status?: DataRequestStatus
  created_at?: string
  expires_at?: string | null
  error?: string
}

const DATA_REQUEST_STATUSES: ReadonlySet<DataRequestStatus> = new Set([
  'pending',
  'processing',
  'ready',
  'failed',
  'expired',
])

export function isDataRequestResponse(data: CreateOrConflictDataRequestResponse): data is {
  id: string
  status: DataRequestStatus
  created_at: string
  expires_at?: string | null
  error?: string
} {
  return (
    data != null &&
    typeof data.id === 'string' &&
    typeof data.created_at === 'string' &&
    typeof data.status === 'string' &&
    DATA_REQUEST_STATUSES.has(data.status)
  )
}

export async function getUserDataRequest(userId: string): Promise<DataRequest> {
  const safeId = assertPathIdentifier(userId)
  const response = await clientFetch(`/api/v1/users/${encodeURIComponent(safeId)}/data-request`)
  if (!response.ok) {
    throw new ApiError(
      'Failed to load export status',
      response.status,
      await parseErrorResponseBody(response),
    )
  }
  return parseRequiredJsonBody<DataRequest>(response, 'Invalid export status response')
}

export async function createUserDataRequest(
  userId: string,
): Promise<CreateOrConflictDataRequestResponse> {
  const safeId = assertPathIdentifier(userId)
  const response = await clientFetch(`/api/v1/users/${encodeURIComponent(safeId)}/data-request`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new ApiError(
      'Failed to request export',
      response.status,
      await parseErrorResponseBody(response),
    )
  }
  return parseRequiredJsonBody<CreateOrConflictDataRequestResponse>(
    response,
    'Invalid export request response',
  )
}

async function parseRequiredJsonBody<T>(response: Response, message: string): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError(message, response.status)
  }
}

export function fetchFollowerUsers(
  idOrUsername: string,
  options: { after?: string; limit?: number; q?: string; signal?: AbortSignal } = {},
): Promise<UsersListResponseBody> {
  const safeIdOrUsername = assertPathIdentifier(idOrUsername)

  return clientApi.get<UsersListResponseBody>(
    `/api/v1/users/${encodeURIComponent(safeIdOrUsername)}/users/followers`,
    {
      searchParams: { after: options.after, limit: options.limit, q: options.q },
      signal: options.signal,
    },
  )
}

export function getUserModerationContext(userId: string): Promise<UserModerationContextResponse> {
  const safeId = assertPathIdentifier(userId)
  return clientApi.get<UserModerationContextResponse>(
    `/api/v1/users/${encodeURIComponent(safeId)}/moderation-context`,
  )
}

export function listUserModNotes(
  userId: string,
  options: { after?: string; limit?: number } = {},
): Promise<UserModNotesListResponse> {
  const safeId = assertPathIdentifier(userId)
  return clientApi.get<UserModNotesListResponse>(
    `/api/v1/users/${encodeURIComponent(safeId)}/mod-notes`,
    { searchParams: options },
  )
}

export function createUserModNote(
  userId: string,
  body: { body: string; community_id?: string | null },
): Promise<{ note: UserModNote }> {
  const safeId = assertPathIdentifier(userId)
  return clientApi.post<{ note: UserModNote }>(
    `/api/v1/users/${encodeURIComponent(safeId)}/mod-notes`,
    body,
  )
}

export function deleteUserModNote(userId: string, noteId: string): Promise<{ ok: boolean }> {
  const safeId = assertPathIdentifier(userId)
  const safeNoteId = assertPathIdentifier(noteId)
  return clientApi.delete<{ ok: boolean }>(
    `/api/v1/users/${encodeURIComponent(safeId)}/mod-notes/${encodeURIComponent(safeNoteId)}`,
  )
}
