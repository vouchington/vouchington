'use client'

import { clientApi } from './instance'
import type { BookmarkResponseBody, BookmarksResponseBody } from '@/types/api-responses'

const inflightBookmarkGets = new Map<string, Promise<BookmarksResponseBody>>()

export function getEntityBookmarks(
  entityType: string,
  entityId: string,
): Promise<BookmarksResponseBody> {
  const key = `${entityType}:${entityId}`
  const existing = inflightBookmarkGets.get(key)
  if (existing) return existing

  const promise = clientApi
    .get<BookmarksResponseBody>(
      `/api/v1/bookmarks/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
    )
    .finally(() => {
      inflightBookmarkGets.delete(key)
    })
  inflightBookmarkGets.set(key, promise)
  return promise
}

export async function bookmarkEntity(
  entityType: string,
  entityId: string,
  predicate: string,
): Promise<BookmarkResponseBody> {
  return clientApi.put<BookmarkResponseBody>(
    `/api/v1/bookmarks/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/${encodeURIComponent(predicate)}`,
  )
}

export async function unbookmarkEntity(
  entityType: string,
  entityId: string,
  predicate: string,
): Promise<void> {
  await clientApi.delete(
    `/api/v1/bookmarks/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/${encodeURIComponent(predicate)}`,
  )
}
