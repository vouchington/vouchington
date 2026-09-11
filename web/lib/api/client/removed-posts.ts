'use client'
import { clientApi } from './instance'
import type { MyRemovedPostsResponse } from '@/types/my'

export function listMyRemovedPosts(after?: string): Promise<MyRemovedPostsResponse> {
  const params = new URLSearchParams({ include_platform: 'true' })
  if (after) params.set('after', after)
  return clientApi.get(`/api/v1/my/removed-posts?${params}`)
}
