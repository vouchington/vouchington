import { cache } from 'react'
import { serverApi } from './instance'
import type { MigrationStatusResponse, PartitionStatusResponseBody } from '@/types/api-responses'

export const getMigrationStatus = cache(function getMigrationStatus(options?: {
  headers?: Record<string, string>
}): Promise<MigrationStatusResponse> {
  return serverApi.get<MigrationStatusResponse>('/api/v1/psql/migrations', options)
})

export const getPartitionStatus = cache(function getPartitionStatus(options?: {
  headers?: Record<string, string>
}): Promise<PartitionStatusResponseBody> {
  return serverApi.get<PartitionStatusResponseBody>('/api/v1/psql/partitions', options)
})
