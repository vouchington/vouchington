'use client'

import { clientApi } from './instance'

export function getFriendRecommendations<T>(
  searchParams?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  return clientApi.get<T>('/api/v1/my/friend-recommendations', { searchParams })
}
