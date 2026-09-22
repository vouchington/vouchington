import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  CopyrightNoticeDetail,
  CopyrightNoticesPage,
  CopyrightParticipantNoticeDetail,
  CopyrightStaffQueuePage,
} from '@/types/copyright-notices'

export const getCopyrightNotices = cache(
  async (options?: { after?: string; limit?: number }): Promise<CopyrightNoticesPage> => {
    return serverApi.get<CopyrightNoticesPage>('/api/v1/copyright-notices', {
      searchParams: { after: options?.after, limit: options?.limit },
    })
  },
)

export const getCopyrightNoticeServer = cache(
  async (id: string): Promise<CopyrightNoticeDetail | null> => {
    const response = await returnNullForMissingEntity(
      serverApi.get<{ copyright_notice: CopyrightNoticeDetail }>(`/api/v1/copyright-notices/${id}`),
    )
    return response?.copyright_notice ?? null
  },
)

export const getCopyrightParticipantNoticeServer = cache(
  async (id: string): Promise<CopyrightParticipantNoticeDetail | null> => {
    const response = await returnNullForMissingEntity(
      serverApi.get<{ copyright_notice: CopyrightParticipantNoticeDetail }>(
        `/api/v1/copyright-notices/${id}/participant`,
      ),
      { nullStatusCodes: [403, 404] },
    )
    return response?.copyright_notice ?? null
  },
)

export const getCopyrightReviewQueue = cache(async (): Promise<CopyrightStaffQueuePage> => {
  return serverApi.get<CopyrightStaffQueuePage>('/api/v1/copyright-notices/review-queue')
})

export const getCopyrightEmailIntakeReviewQueue = cache(async () => {
  const response = await serverApi.get<{
    copyright_email_intakes: Array<{
      id: string
      received_at: string
      parse_status: string
      recommendation_id: string | null
    }>
  }>('/api/v1/copyright-email-intakes/review-queue')
  return response.copyright_email_intakes
})
