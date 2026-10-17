import { describe, expect, it } from 'vitest'
import { EMAIL_DIGESTS_JOBS } from '@queues/background/enqueues/email-digests-jobs'
import { emailDigestsHandlers } from './workers.mts'

describe('email-digests handlers', () => {
  it('handles every registered email-digests job exactly once', () => {
    expect(emailDigestsHandlers.map(handler => handler.job)).toEqual([...EMAIL_DIGESTS_JOBS])
  })
})
