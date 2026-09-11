'use client'

import { clientApi } from './instance'

export type AvailabilityKind =
  | 'topic-slug'
  | 'topic-name'
  | 'community-slug'
  | 'post-slug'
  | 'username'

export interface TopicConflict {
  kind: 'topic'
  id: string
  slug: string
  name: string
  topic_type: string
}
export interface CommunityConflict {
  kind: 'community'
  id: string
  slug: string
  name: string
}
export interface PostConflict {
  kind: 'post'
  id: string
  slug: string
  title: string
  post_type: string
}
export type AvailabilityConflict = TopicConflict | CommunityConflict | PostConflict

export interface AvailabilityResult {
  available: boolean
  conflict: AvailabilityConflict | null
}

export async function checkAvailability(
  kind: AvailabilityKind,
  value: string,
  signal?: AbortSignal,
): Promise<AvailabilityResult> {
  return clientApi.get<AvailabilityResult>('/api/v1/availability', {
    searchParams: { kind, value },
    signal,
  })
}
