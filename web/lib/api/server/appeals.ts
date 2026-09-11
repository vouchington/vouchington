import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type { ModerationAppeal } from '@/types/appeals'

interface AppealsResponse {
  appeals: ModerationAppeal[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

export const getModerationAppeals = cache(
  async (
    options: {
      searchParams?: { limit?: number; cursor?: string; status?: string; mine?: boolean }
    } = {},
  ): Promise<AppealsResponse> => {
    return serverApi.get<AppealsResponse>('/api/v1/appeals', options)
  },
)

export const getModerationAppealById = cache(
  async (appealId: string): Promise<ModerationAppeal | null> => {
    const response = await returnNullForMissingEntity(
      serverApi.get<{ appeal: ModerationAppeal }>(`/api/v1/appeals/${appealId}`),
    )
    return response?.appeal ?? null
  },
)
