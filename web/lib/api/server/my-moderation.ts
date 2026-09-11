import { cache } from 'react'
import { serverApi } from './instance'
import type { MyBansResponse, MyRemovedPostsResponse } from '@/types/my'

type HeaderOptions = { headers?: Record<string, string> }

export const getMyBans = cache(async (options?: HeaderOptions): Promise<MyBansResponse> =>
  serverApi.get<MyBansResponse>('/api/v1/my/bans', options),
)

export const getMyRemovedPosts = cache(
  async (options?: HeaderOptions): Promise<MyRemovedPostsResponse> =>
    serverApi.get<MyRemovedPostsResponse>('/api/v1/my/removed-posts', {
      ...options,
      searchParams: { include_platform: 'true' },
    }),
)
