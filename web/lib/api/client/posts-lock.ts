'use client'

import { clientApi } from './instance'
import { assertPathIdentifier } from '@vouchington/api-client'

export async function lockPost(postIdOrSlug: string): Promise<void> {
  const safePostIdOrSlug = assertPathIdentifier(postIdOrSlug)
  await clientApi.post(`/api/v1/posts/${encodeURIComponent(safePostIdOrSlug)}/lock`, {})
}

export async function unlockPost(postIdOrSlug: string): Promise<void> {
  const safePostIdOrSlug = assertPathIdentifier(postIdOrSlug)
  await clientApi.delete(`/api/v1/posts/${encodeURIComponent(safePostIdOrSlug)}/lock`)
}
