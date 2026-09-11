'use client'

import { clientApi } from './instance'

export interface QueueStats {
  name: string
  waiting: number
  active: number
  completed: number
  failed: number
  paused: boolean
}

export interface QueueStatsSummary {
  totalWaiting: number
  totalActive: number
  totalCompleted: number
  totalFailed: number
  queueCount: number
}

export function fetchQueueStats(): Promise<{ stats: QueueStatsSummary }> {
  return clientApi.get<{ stats: QueueStatsSummary }>('/api/v1/mq/stats')
}

export interface ScheduledJob {
  id: string
  queue_name: string
  job_name: string
  schedule: string
  description: string
}

export interface Backfill {
  id: string
  queue_name: string
  job_name: string
  description: string
  source_table: string
}

export function fetchQueues(): Promise<{ queues: QueueStats[]; total: number }> {
  return clientApi.get<{ queues: QueueStats[]; total: number }>('/api/v1/mq/queues')
}

export function pauseQueue(name: string): Promise<{ success: boolean }> {
  return clientApi.post<{ success: boolean }>(`/api/v1/mq/queues/${encodeURIComponent(name)}/pause`)
}

export function resumeQueue(name: string): Promise<{ success: boolean }> {
  return clientApi.post<{ success: boolean }>(
    `/api/v1/mq/queues/${encodeURIComponent(name)}/resume`,
  )
}

export function retryFailedJobs(name: string): Promise<{ success: boolean; retried: number }> {
  return clientApi.post<{ success: boolean; retried: number }>(
    `/api/v1/mq/queues/${encodeURIComponent(name)}/retry-failed`,
  )
}

export function fetchScheduledJobs(): Promise<{ jobs: ScheduledJob[] }> {
  return clientApi.get<{ jobs: ScheduledJob[] }>('/api/v1/mq/scheduled-jobs')
}

export function triggerScheduledJob(id: string): Promise<{ success: boolean }> {
  return clientApi.post<{ success: boolean }>(
    `/api/v1/mq/scheduled-jobs/${encodeURIComponent(id)}/runs`,
  )
}

export function fetchBackfills(): Promise<{ backfills: Backfill[] }> {
  return clientApi.get<{ backfills: Backfill[] }>('/api/v1/mq/backfills')
}

export function triggerBackfill(id: string): Promise<{ success: boolean }> {
  return clientApi.post<{ success: boolean }>(`/api/v1/mq/backfills/${encodeURIComponent(id)}/runs`)
}
