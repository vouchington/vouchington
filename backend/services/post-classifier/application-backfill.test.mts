import { describe, expect, it } from 'vitest'
import { streamIncompletePostClassifierApplicationBatchesFromRows } from './application-backfill.mts'
import { POST_CLASSIFIER_SWEEP_ENQUEUE_BOUND } from './application-sweep.mts'

describe('streamIncompletePostClassifierApplicationBatches', () => {
  it('includes unfinished effects and distinct configuration fingerprints but excludes terminal remote failures', async () => {
    const rows = async function* () {
      yield {
        id: 'a',
        post_id: 'post-a',
        input_sha256: Buffer.alloc(32, 1),
        configuration_sha256: Buffer.alloc(32, 2),
        detector_package_version: '0.0.0-test',
        created_at: new Date(),
        sweep_enqueue_count: 0,
        completed_at: null,
        terminal_remote_failed_at: null,
        outcomes_persisted_at: new Date(),
        superseded_at: null,
      }
      yield {
        id: 'b',
        post_id: 'post-a',
        input_sha256: Buffer.alloc(32, 1),
        configuration_sha256: Buffer.alloc(32, 3),
        detector_package_version: '0.0.0-test',
        created_at: new Date(),
        sweep_enqueue_count: 0,
        completed_at: null,
        terminal_remote_failed_at: null,
        outcomes_persisted_at: null,
        superseded_at: null,
      }
      yield {
        id: 'terminal',
        post_id: 'post-a',
        input_sha256: Buffer.alloc(32, 1),
        configuration_sha256: Buffer.alloc(32, 4),
        detector_package_version: '0.0.0-test',
        created_at: new Date(),
        sweep_enqueue_count: 0,
        completed_at: null,
        terminal_remote_failed_at: new Date(),
        outcomes_persisted_at: null,
        superseded_at: null,
      }
      yield {
        id: 'superseded',
        post_id: 'post-a',
        input_sha256: Buffer.alloc(32, 1),
        configuration_sha256: Buffer.alloc(32, 5),
        detector_package_version: '0.0.0-test',
        created_at: new Date(),
        sweep_enqueue_count: 0,
        completed_at: null,
        terminal_remote_failed_at: null,
        outcomes_persisted_at: null,
        superseded_at: new Date(),
      }
    }
    const batches = []
    for await (const batch of streamIncompletePostClassifierApplicationBatchesFromRows(rows())) {
      batches.push(batch)
    }
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(2)
    expect(batches[0]?.map(row => row.configurationSha256)).toEqual([
      Buffer.alloc(32, 2).toString('hex'),
      Buffer.alloc(32, 3).toString('hex'),
    ])
  })

  it('streams a receipt at the sweep bound for give-up but never one past it', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z')
    const row = (id: string, sweepEnqueueCount: number) => ({
      id,
      post_id: 'post-a',
      input_sha256: Buffer.alloc(32, 1),
      configuration_sha256: Buffer.alloc(32, 2),
      detector_package_version: '0.0.0-test',
      created_at: createdAt,
      sweep_enqueue_count: sweepEnqueueCount,
      completed_at: null,
      terminal_remote_failed_at: null,
      outcomes_persisted_at: null,
      superseded_at: null,
    })
    const rows = async function* () {
      yield row('at-bound', POST_CLASSIFIER_SWEEP_ENQUEUE_BOUND)
      yield row('given-up', POST_CLASSIFIER_SWEEP_ENQUEUE_BOUND + 1)
    }
    const streamed = []
    for await (const batch of streamIncompletePostClassifierApplicationBatchesFromRows(rows())) {
      streamed.push(...batch)
    }
    expect(streamed).toEqual([
      expect.objectContaining({
        applicationId: 'at-bound',
        createdAt,
        sweepEnqueueCount: POST_CLASSIFIER_SWEEP_ENQUEUE_BOUND,
      }),
    ])
  })
})
