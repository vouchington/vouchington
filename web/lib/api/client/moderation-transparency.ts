import { clientApi } from './instance'
import type { ModerationAnalyticsRange, ModerationTransparency } from '@/types/moderation-analytics'

type TransparencyOptions = { range: ModerationAnalyticsRange; after?: string }

function searchParams({ range, after }: TransparencyOptions) {
  return { range, ...(after ? { after } : {}) }
}

export function fetchModerationTransparency(options: TransparencyOptions) {
  return clientApi.get<ModerationTransparency>('/api/v1/moderation-transparency', {
    searchParams: searchParams(options),
  })
}

export function fetchCommunityModerationTransparency(slug: string, options: TransparencyOptions) {
  return clientApi.get<ModerationTransparency>(
    `/api/v1/communities/${encodeURIComponent(slug)}/moderation-transparency`,
    { searchParams: searchParams(options) },
  )
}
