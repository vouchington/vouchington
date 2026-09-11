'use client'

import { clientApi } from './instance'
import type {
  MigrationStatusResponse,
  PartitionStatusResponseBody,
  PsqlJobEnqueueResponse,
} from '@/types/api-responses'

export function fetchMigrations(): Promise<MigrationStatusResponse> {
  return clientApi.get<MigrationStatusResponse>('/api/v1/psql/migrations')
}

export function fetchPartitions(): Promise<PartitionStatusResponseBody> {
  return clientApi.get<PartitionStatusResponseBody>('/api/v1/psql/partitions')
}

export function enqueuePsqlJob(
  type: 'runMigrations' | 'runViews' | 'runConfigDriven' | 'createPartitions' | 'cleanupPartitions',
): Promise<PsqlJobEnqueueResponse> {
  return clientApi.post<PsqlJobEnqueueResponse>('/api/v1/psql/jobs', { type })
}
