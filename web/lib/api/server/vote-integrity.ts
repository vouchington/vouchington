import { cache } from 'react'
import { serverApi } from './instance'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getVoteIntegrityFlags = cache(async <T>(options: GetOptions = {}): Promise<T> => {
  return serverApi.get<T>('/api/v1/vote-integrity/flags', options)
})

export const getVoteIntegrityPenalties = cache(async <T>(options: GetOptions = {}): Promise<T> => {
  return serverApi.get<T>('/api/v1/vote-integrity/penalties', options)
})
