import { describe, expect, it } from 'vitest'
import { HEARTBEAT_JOB_OPTIONS } from '../config.mts'

describe('enqueueHeartbeat', () => {
  it('uses attempts=1 and no backoff', () => {
    expect(HEARTBEAT_JOB_OPTIONS).toMatchObject({
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100,
    })
  })
})
