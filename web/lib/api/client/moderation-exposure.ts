'use client'

import { clientApi } from './instance'
import type { ExposureState } from '@/types/moderation-exposure'

export type ModMediaRevealSurface = 'mod_queue' | 'review_queue' | 'reports' | 'post_page'

export interface RecordRevealBody {
  postId?: string | null
  reportId?: string | null
  surface: ModMediaRevealSurface
}

export interface ExposureResponse {
  exposure: ExposureState
}

export function recordMediaReveal(body: RecordRevealBody): Promise<ExposureResponse> {
  return clientApi.post<ExposureResponse>('/api/v1/moderation/reveals', body)
}

export function getExposureState(): Promise<ExposureResponse> {
  return clientApi.get<ExposureResponse>('/api/v1/moderation/exposure')
}
