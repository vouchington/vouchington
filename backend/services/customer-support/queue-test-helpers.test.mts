import { describe, expect, it } from 'vitest'
import { dedupeJobsById } from './queue-test-helpers.mts'

describe('queue-test-helpers', () => {
  it('deduplicates queue snapshots by job id while preserving id-less snapshots', () => {
    type TestJob = { id?: string; data: { state: string } }

    const firstJob: TestJob = { id: 'job-1', data: { state: 'active' } }
    const duplicateJob: TestJob = { id: 'job-1', data: { state: 'completed' } }
    const idlessJob: TestJob = { data: { state: 'waiting' } }

    expect(dedupeJobsById([firstJob, duplicateJob, idlessJob])).toEqual([firstJob, idlessJob])
  })
})
