import { cache } from 'react'
import { serverApi } from './instance'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getReportIntegrityFlags = cache(async <T>(options: GetOptions = {}): Promise<T> => {
  return serverApi.get<T>('/api/v1/report-integrity/flags', options)
})

export const getReportIntegrityPenalties = cache(
  async <T>(options: GetOptions = {}): Promise<T> => {
    return serverApi.get<T>('/api/v1/report-integrity/penalties', options)
  },
)
