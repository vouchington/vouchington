import { describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import { isFinalActivityPubInboxAttempt } from './inbox-job.mts'

describe('ActivityPub inbox worker attempt routing', () => {
  it('uses the attempts configured on the actual job', () => {
    const job = { attemptsMade: 1, opts: { attempts: 2 } } as Pick<Job, 'attemptsMade' | 'opts'>

    expect(isFinalActivityPubInboxAttempt(job)).toBe(true)
  })

  it('is not final while attempts remain', () => {
    const job = { attemptsMade: 0, opts: { attempts: 5 } } as Pick<Job, 'attemptsMade' | 'opts'>

    expect(isFinalActivityPubInboxAttempt(job)).toBe(false)
  })

  it('defaults a job without explicit attempts to one attempt', () => {
    const job = { attemptsMade: 0, opts: {} } as Pick<Job, 'attemptsMade' | 'opts'>

    expect(isFinalActivityPubInboxAttempt(job)).toBe(true)
  })
})
