'use client'

import { clientApi } from './instance'

export type ContentLimitsResponse = {
  post_images_max: number
  copyright_claimant_targets_max: number
  follower_distribution_recipients_max: number
}

export function fetchContentLimits(): Promise<ContentLimitsResponse> {
  return clientApi.get<ContentLimitsResponse>('/api/v1/content-limits')
}
